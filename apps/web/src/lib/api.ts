export const API_URL = "";

export type ApiErrorKind = "http" | "network" | "timeout" | "cancelled" | "invalid-response";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: ApiErrorKind,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiRequestOptions = { signal?: AbortSignal; timeoutMs?: number };
const TRANSIENT_STATUSES = new Set([408, 429, 502, 503, 504]);

function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const milliseconds = /^\d+(\.\d+)?$/.test(value.trim())
    ? Number(value) * 1000
    : Date.parse(value) - Date.now();
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : undefined;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null; timeoutMs?: number } = {},
): Promise<T> {
  const isRead = !options.method || options.method === "GET";
  const { token, headers, signal, timeoutMs = isRead ? 10_000 : 30_000, ...rest } = options;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError("timeoutMs must be positive and finite");
  const controller = new AbortController();
  const cancel = () => controller.abort(new ApiError("Request cancelled", "cancelled"));
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  // One deadline covers fetching headers, reading the body, and retry delays.
  const deadline = Date.now() + timeoutMs;
  const uncertainWrite = "We could not confirm the result. Check whether your change was saved before trying again.";
  const timer = setTimeout(() => controller.abort(new ApiError(
    isRead ? "Request timed out. Please try again." : uncertainWrite, "timeout",
  )), timeoutMs);

  try {
    for (let attempt = 0; ; attempt++) {
      controller.signal.throwIfAborted();
      try {
        const res = await fetch(`${API_URL}${path}`, {
          ...rest,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers,
          },
        });
        if (res.ok && res.status === 204) return undefined as T;
        let data: unknown;
        try {
          data = await res.json();
        } catch (error) {
          controller.signal.throwIfAborted();
          if (res.ok) {
            // A broken response stream is a network failure, not malformed
            // complete JSON. Safe reads may recover on a fresh connection.
            if (!(error instanceof SyntaxError)) throw error;
            throw new ApiError("The server returned an unreadable response.", "invalid-response", res.status);
          }
        }
        if (!res.ok) {
          const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error : `Request failed (${res.status})`;
          throw new ApiError(message, "http", res.status, retryAfter(res.headers.get("Retry-After")));
        }
        return data as T;
      } catch (error) {
        controller.signal.throwIfAborted();
        const failure = error instanceof ApiError
          ? error : new ApiError(isRead ? "Unable to reach the server. Check your connection." : uncertainWrite, "network");
        const transient = failure.kind === "network" || (failure.status !== undefined && TRANSIENT_STATUSES.has(failure.status));
        // Writes can commit before their response is lost. Never replay a
        // post, message, like toggle, upload, or deletion automatically.
        if (!isRead || !transient || attempt >= 2) throw failure;
        const delay = Math.max(failure.retryAfterMs ?? 0, 250 * 2 ** attempt * (0.5 + Math.random()));
        if (delay >= deadline - Date.now()) throw failure;
        await wait(delay, controller.signal);
      }
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

export const api = {
  get: <T>(path: string, token?: string | null, options?: ApiRequestOptions) => request<T>(path, { ...options, token }),
  post: <T>(path: string, body: unknown, token?: string | null, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: "POST", body: JSON.stringify(body), token }),
  patch: <T>(path: string, body: unknown, token?: string | null, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body: JSON.stringify(body), token }),
  put: <T>(path: string, body: unknown, token?: string | null, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body: JSON.stringify(body), token }),
  delete: <T>(path: string, token?: string | null, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: "DELETE", token }),
  deleteWithBody: <T>(path: string, body: unknown, token?: string | null, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: "DELETE", body: JSON.stringify(body), token }),
  upload: <T>(path: string, body: Blob, token?: string | null, options?: ApiRequestOptions) =>
    request<T>(path, { timeoutMs: 60_000, ...options, method: "POST", body, headers: { "Content-Type": body.type }, token }),
};
