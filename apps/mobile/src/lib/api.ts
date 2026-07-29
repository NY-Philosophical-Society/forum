// On a physical device, "localhost" refers to the device itself, not your
// dev machine. Set EXPO_PUBLIC_API_URL in .env to your machine's LAN IP
// (e.g. http://192.168.1.23:4000) when testing on a real device. The iOS
// Simulator can usually still reach localhost directly.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

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
};
