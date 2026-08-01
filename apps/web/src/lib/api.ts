/**
 * Where this app looks for the API.
 *
 * The localhost fallback is a DEVELOPMENT convenience and a production trap:
 * a build deployed with NEXT_PUBLIC_API_URL unset will happily call
 * "localhost:4000", which on a visitor's machine is *their* computer, where
 * nothing is running. The page loads, every request fails, and the forum
 * looks empty rather than broken — so nobody notices.
 *
 * That exact bug shipped once. The guard below makes it impossible to repeat:
 * a production build without an explicit API URL fails at build time instead.
 */
const configured = process.env.NEXT_PUBLIC_API_URL;

if (process.env.NODE_ENV === "production") {
  // Both failure modes matter, and the second is the one that actually
  // happened: unset falls back to localhost, and explicitly *setting* it to
  // localhost is just as broken. Reject both.
  const isLocal =
    !configured ||
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(configured);

  if (isLocal) {
    throw new Error(
      `NEXT_PUBLIC_API_URL is ${configured ? `"${configured}"` : "not set"}. ` +
        "A production build must point at a real, publicly reachable API. " +
        "'localhost' on a visitor's machine is THEIR computer, where nothing " +
        "is running — the site loads but every request fails silently, so it " +
        "looks empty rather than broken. Set this in the Vercel project's " +
        "Environment Variables and redeploy.",
    );
  }
}

export const API_URL = configured ?? "http://localhost:4000";

class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, token?: string | null) => request<T>(path, { token }),
  post: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body), token }),
  patch: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body), token }),
  put: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body), token }),
  delete: <T>(path: string, token?: string | null) => request<T>(path, { method: "DELETE", token }),
  /** DELETE with a JSON body (account deletion sends password + confirmation). */
  deleteWithBody: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: "DELETE", body: JSON.stringify(body), token }),
  /** Raw binary upload (avatars) — Content-Type comes from the blob itself. */
  upload: <T>(path: string, body: Blob, token?: string | null) =>
    request<T>(path, { method: "POST", body, headers: { "Content-Type": body.type }, token }),
};
