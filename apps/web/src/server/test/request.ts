import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import type { ApiApplication } from "../router";
import { LOCAL_UPLOADS_DIR } from "../storage-provider";

export type TTestResponse = {
  status: number;
  // The compatibility harness keeps the response body dynamic; individual
  // tests assert each endpoint-specific shape.
  body: any;
  headers: Record<string, string>;
};

type TParser = (response: never, callback: (error: Error | null, body: Buffer) => void) => void;

export class Test implements PromiseLike<TTestResponse> {
  private readonly headers = new Headers();
  private body: BodyInit | null = null;
  private expectedStatus: number | null = null;
  private binary = false;

  readonly url: string;

  constructor(
    private readonly application: ApiApplication,
    private readonly method: string,
    private readonly path: string,
  ) {
    this.url = path;
  }

  set(name: string, value: string): Test {
    this.headers.set(name, value);
    return this;
  }

  send(value: unknown = {}): Test {
    if (Buffer.isBuffer(value)) {
      this.body = new Blob([new Uint8Array(value)]);
      if (!this.headers.has("Content-Type")) this.headers.set("Content-Type", "application/octet-stream");
    } else {
      this.body = JSON.stringify(value);
      this.headers.set("Content-Type", "application/json");
    }
    return this;
  }

  expect(status: number): Test {
    this.expectedStatus = status;
    return this;
  }

  buffer(enabled: boolean): Test {
    this.binary = enabled;
    return this;
  }

  parse(_parser: TParser): Test {
    this.binary = true;
    return this;
  }

  then<TResult1 = TTestResponse, TResult2 = never>(
    onfulfilled?: ((value: TTestResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<TTestResponse> {
    if (this.method === "GET" && this.path.startsWith("/uploads/")) {
      const relativePath = this.path.slice("/uploads/".length);
      const filePath = path.resolve(LOCAL_UPLOADS_DIR, relativePath);
      const root = path.resolve(LOCAL_UPLOADS_DIR) + path.sep;
      if (!filePath.startsWith(root)) return { status: 404, body: {}, headers: {} };
      try {
        return { status: 200, body: await readFile(filePath), headers: {} };
      } catch {
        return { status: 404, body: {}, headers: {} };
      }
    }

    const request = new NextRequest(`http://test.local${this.path}`, {
      method: this.method,
      headers: this.headers,
      body: this.method === "GET" || this.method === "HEAD" ? null : this.body,
    });
    const response = await this.application.handle(request);
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const contentType = response.headers.get("content-type") ?? "";
    const body = this.binary || !contentType.includes("application/json")
      ? Buffer.from(await response.arrayBuffer())
      : await response.json();
    if (this.expectedStatus !== null && response.status !== this.expectedStatus) {
      throw new Error(`Expected HTTP ${this.expectedStatus}, received ${response.status}`);
    }
    return { status: response.status, body, headers: responseHeaders };
  }
}

type TRequestClient = {
  delete(path: string): Test;
  get(path: string): Test;
  patch(path: string): Test;
  post(path: string): Test;
  put(path: string): Test;
};

function request(application: ApiApplication): TRequestClient {
  return {
    delete: (path) => new Test(application, "DELETE", path),
    get: (path) => new Test(application, "GET", path),
    patch: (path) => new Test(application, "PATCH", path),
    post: (path) => new Test(application, "POST", path),
    put: (path) => new Test(application, "PUT", path),
  };
}

namespace request {
  export type Response = TTestResponse;
  export type Test = import("./request").Test;
}

export default request;
