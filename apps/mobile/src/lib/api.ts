// On a physical device, "localhost" refers to the device itself, not your
// dev machine. Set EXPO_PUBLIC_API_URL in .env to your machine's LAN IP
// (e.g. http://192.168.1.23:4000) when testing on a real device. The iOS
// Simulator can usually still reach localhost directly.
//
// This value is BAKED IN AT BUILD TIME — an installed app cannot be
// re-pointed later. A release build made with this unset ships pointing at
// "localhost", which on a user's phone is their own phone: every screen
// fails to load, and only a new App Store submission can fix it. That has
// happened once already, so release builds now refuse to start rather than
// ship broken. eas.json sets this per profile.
const configured = process.env.EXPO_PUBLIC_API_URL;

if (!__DEV__) {
  // Unset and "explicitly set to localhost" are equally broken in a release
  // build — a phone's localhost is the phone itself.
  const isLocal =
    !configured ||
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(configured);

  if (isLocal) {
    throw new Error(
      `EXPO_PUBLIC_API_URL was ${configured ? `"${configured}"` : "unset"} when ` +
        "this build was created. A release build must be built with a real, " +
        "publicly reachable API URL — 'localhost' on a user's phone is their " +
        "own phone. See apps/mobile/eas.json.",
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
  /** Raw binary upload (avatars). RN blobs often lack a type, so it's explicit. */
  upload: <T>(path: string, body: Blob, contentType: string, token?: string | null) =>
    request<T>(path, { method: "POST", body, headers: { "Content-Type": contentType }, token }),
};
