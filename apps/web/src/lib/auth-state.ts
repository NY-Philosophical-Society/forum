import { ApiError } from "./api";

export type AuthLoadError = "session-rejected" | "account-unavailable";

export function classifyAccountLoadError(error: unknown): AuthLoadError {
  return error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)
    ? "session-rejected"
    : "account-unavailable";
}

export function oauthRedirectUrl(path: string, origin: string): string {
  const base = new URL(origin);
  const redirect = new URL(path, base);
  if (redirect.origin !== base.origin) {
    throw new Error("OAuth redirects must stay on the same origin as this application.");
  }
  return redirect.toString();
}

export function authenticatedAccountKey(userId: string): string {
  return `auth:${userId}`;
}

export type RequestTicket = { signal: AbortSignal; isCurrent: () => boolean };

/** Cancels superseded profile loads and prevents late responses changing accounts. */
export function createLatestRequestGate() {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    next(): RequestTicket {
      controller?.abort();
      controller = new AbortController();
      const mine = ++generation;
      return { signal: controller.signal, isCurrent: () => mine === generation };
    },
    invalidate() {
      generation += 1;
      controller?.abort();
      controller = null;
    },
  };
}
