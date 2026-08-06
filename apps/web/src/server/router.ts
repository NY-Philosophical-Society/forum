import "server-only";

import { NextRequest, NextResponse } from "next/server";

const JSON_BODY_MAX_BYTES = 100 * 1024;
const RAW_BODY_MAX_BYTES = 4 * 1024 * 1024;

export type TRequestUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  verificationStatus: string;
  role: string;
  isSupporter: boolean;
  directoryVisible: boolean;
  directoryBio: string | null;
  openToPartners: boolean;
  createdAt: Date;
};

export type TApiRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  user?: TRequestUser;
  authClaims?: import("./supabase").TSupabaseClaims;
  source: NextRequest;
};

export type TApiResponse = {
  status(code: number): TApiResponse;
  json(value: unknown): TApiResponse;
  setHeader(name: string, value: string): TApiResponse;
};

export type TNext = () => Promise<void>;
export type TMiddleware = (
  request: TApiRequest,
  response: TApiResponse,
  next: TNext,
) => unknown | Promise<unknown>;

type TMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

type TRoute = {
  method: TMethod;
  pattern: string;
  match: RegExp;
  parameterNames: string[];
  middleware: TMiddleware[];
};

type TMountedRoute = TRoute & { pattern: string };

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

class ApiResponse implements TApiResponse {
  private statusCode = 200;
  private payload: unknown;
  private readonly headers = new Headers({ "Cache-Control": "private, no-store" });

  status(code: number): TApiResponse {
    this.statusCode = code;
    return this;
  }

  json(value: unknown): TApiResponse {
    this.payload = value;
    return this;
  }

  setHeader(name: string, value: string): TApiResponse {
    this.headers.set(name, value);
    return this;
  }

  toResponse(): NextResponse {
    return NextResponse.json(this.payload ?? {}, {
      status: this.statusCode,
      headers: this.headers,
    });
  }
}

function compilePattern(pattern: string): Pick<TRoute, "match" | "parameterNames"> {
  const parameterNames: string[] = [];
  const segments = pattern.split("/").filter(Boolean);
  const source = segments
    .map((segment) => {
      if (segment.startsWith(":")) {
        parameterNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { match: new RegExp(`^/${source}/?$`), parameterNames };
}

function queryFrom(url: URL): TApiRequest["query"] {
  const query: TApiRequest["query"] = {};
  for (const key of url.searchParams.keys()) {
    const values = url.searchParams.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }
  return query;
}

async function readBoundedBody(request: NextRequest): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim() ?? "";
  const isRawImage = contentType.startsWith("image/");
  const maxBytes = isRawImage ? RAW_BODY_MAX_BYTES : JSON_BODY_MAX_BYTES;
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpError(413, "Request body is too large.");
  }

  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(value);
  }

  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  if (isRawImage) return bytes;
  if (bytes.length === 0 || contentType !== "application/json") return undefined;
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new HttpError(400, "Malformed JSON request body.");
  }
}

export class ApiRouter {
  private readonly routes: TRoute[] = [];
  private readonly commonMiddleware: TMiddleware[] = [];

  use(...middleware: TMiddleware[]): void {
    this.commonMiddleware.push(...middleware);
  }

  get(pattern: string, ...middleware: TMiddleware[]): void {
    this.add("GET", pattern, middleware);
  }

  post(pattern: string, ...middleware: TMiddleware[]): void {
    this.add("POST", pattern, middleware);
  }

  put(pattern: string, ...middleware: TMiddleware[]): void {
    this.add("PUT", pattern, middleware);
  }

  patch(pattern: string, ...middleware: TMiddleware[]): void {
    this.add("PATCH", pattern, middleware);
  }

  delete(pattern: string, ...middleware: TMiddleware[]): void {
    this.add("DELETE", pattern, middleware);
  }

  mounted(prefix: string): TMountedRoute[] {
    return this.routes.map((route) => {
      const pattern = `${prefix}${route.pattern === "/" ? "" : route.pattern}`;
      return { ...route, pattern, ...compilePattern(pattern) };
    });
  }

  private add(method: TMethod, pattern: string, middleware: TMiddleware[]): void {
    this.routes.push({
      method,
      pattern,
      middleware: [...this.commonMiddleware, ...middleware],
      ...compilePattern(pattern),
    });
  }
}

export function Router(): ApiRouter {
  return new ApiRouter();
}

export class ApiApplication {
  private readonly routes: TMountedRoute[] = [];

  mount(prefix: string, router: ApiRouter): void {
    this.routes.push(...router.mounted(prefix));
  }

  async handle(source: NextRequest): Promise<NextResponse> {
    try {
      const url = new URL(source.url);
      const path = url.pathname;
      const pathMatches = this.routes.filter((route) => route.match.test(path));
      const route = pathMatches.find((candidate) => candidate.method === source.method);
      if (!route) {
        return NextResponse.json(
          { error: pathMatches.length > 0 ? "Method not allowed" : "Not found" },
          { status: pathMatches.length > 0 ? 405 : 404 },
        );
      }

      const match = route.match.exec(path);
      const params = Object.fromEntries(
        route.parameterNames.map((name, index) => [name, decodeURIComponent(match?.[index + 1] ?? "")]),
      );
      const headers = Object.fromEntries(source.headers.entries());
      const request: TApiRequest = {
        method: source.method,
        path,
        headers,
        params,
        query: queryFrom(url),
        body: await readBoundedBody(source),
        source,
      };
      const response = new ApiResponse();

      let index = -1;
      const run = async (nextIndex: number): Promise<void> => {
        if (nextIndex <= index) throw new Error("next() called more than once");
        index = nextIndex;
        const current = route.middleware[nextIndex];
        if (!current) return;
        let continuation: Promise<void> | null = null;
        await current(request, response, () => {
          continuation = run(nextIndex + 1);
          return continuation;
        });
        if (continuation) await continuation;
      };

      await run(0);
      return response.toResponse();
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("Unhandled API route error", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }
}

export const rawBody = (options: { type: readonly string[]; limit: number }): TMiddleware =>
  async (request, _response, next) => {
    const contentType = request.headers["content-type"]?.split(";", 1)[0].trim() ?? "";
    if (!options.type.includes(contentType)) request.body = undefined;
    return next();
  };
