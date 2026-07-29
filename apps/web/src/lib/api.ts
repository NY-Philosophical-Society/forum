export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
  delete: <T>(path: string, token?: string | null) => request<T>(path, { method: "DELETE", token }),
  /** DELETE with a JSON body (account deletion sends password + confirmation). */
  deleteWithBody: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: "DELETE", body: JSON.stringify(body), token }),
  /** Raw binary upload (avatars) — Content-Type comes from the blob itself. */
  upload: <T>(path: string, body: Blob, token?: string | null) =>
    request<T>(path, { method: "POST", body, headers: { "Content-Type": body.type }, token }),
};
