/**
 * Push notification delivery, behind the same provider pattern as
 * verification and storage: an interface, a zero-credential local stub, and
 * the real path gated behind env vars.
 *
 * The real provider targets Expo's push service (https://docs.expo.dev/push-notifications/sending-notifications/),
 * which fans out to APNs (iOS) and FCM (Android) — clients register
 * `ExponentPushToken[...]` device tokens via POST /api/push-tokens. To go to
 * production:
 *
 *   1. An Apple Developer account with an APNs key uploaded to your Expo
 *      project (`eas credentials`), and an FCM server key for Android. The
 *      mobile app must also be a real EAS build — Expo Go tokens work for
 *      testing but the credentials above are what make store builds
 *      deliverable.
 *   2. Create an Expo access token (https://expo.dev/settings/access-tokens).
 *   3. Set PUSH_PROVIDER=expo and EXPO_ACCESS_TOKEN in .env.
 *
 * None of that can be tested end-to-end without those accounts; locally the
 * stub logs what would have been sent and the product behaves identically.
 */

export interface PushMessage {
  /** Expo push token of the target device. */
  to: string;
  title: string;
  body: string;
  /** Deep-link payload the app reads when the notification is tapped. */
  data: Record<string, string>;
  /** App icon badge count (recipient's total unread notifications). */
  badge: number;
}

export interface PushProvider {
  readonly name: string;
  /** Invalid/expired device tokens are returned so callers can prune them. */
  send(messages: PushMessage[]): Promise<{ staleTokens: string[] }>;
}

/** Logs instead of sending. Local dev/demo only — no device ever buzzes. */
class StubPushProvider implements PushProvider {
  readonly name = "stub";

  constructor() {
    // Same safety rule as the other stubs: with real credentials present,
    // silently logging instead of sending would mask a misconfiguration.
    if (process.env.EXPO_ACCESS_TOKEN) {
      throw new Error(
        "EXPO_ACCESS_TOKEN is set but PUSH_PROVIDER is not \"expo\" — refusing to run the " +
          "log-only stub with real push credentials configured. Set PUSH_PROVIDER=expo or " +
          "remove the token.",
      );
    }
  }

  async send(messages: PushMessage[]): Promise<{ staleTokens: string[] }> {
    for (const m of messages) {
      console.log(`[push:stub] to=${m.to} badge=${m.badge} "${m.title}" — ${m.body}`);
    }
    return { staleTokens: [] };
  }
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Real delivery via Expo's push HTTP API. Requires EXPO_ACCESS_TOKEN. */
class ExpoPushProvider implements PushProvider {
  readonly name = "expo";

  constructor(private readonly accessToken: string) {}

  async send(messages: PushMessage[]): Promise<{ staleTokens: string[] }> {
    const staleTokens: string[] = [];
    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(
          chunk.map((m) => ({
            to: m.to,
            title: m.title,
            body: m.body,
            data: m.data,
            badge: m.badge,
            sound: "default",
          })),
        ),
      });
      if (!res.ok) {
        throw new Error(`Expo push request failed (${res.status})`);
      }
      const payload = (await res.json()) as {
        data?: { status: string; details?: { error?: string } }[];
      };
      payload.data?.forEach((ticket, idx) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          staleTokens.push(chunk[idx].to);
        }
      });
    }
    return { staleTokens };
  }
}

function loadProvider(): PushProvider {
  const configured = process.env.PUSH_PROVIDER ?? "stub";
  if (configured === "stub") return new StubPushProvider();
  if (configured === "expo") {
    const accessToken = process.env.EXPO_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("PUSH_PROVIDER=expo requires EXPO_ACCESS_TOKEN to be set.");
    }
    return new ExpoPushProvider(accessToken);
  }
  throw new Error(`PUSH_PROVIDER="${configured}" is not implemented.`);
}

export const pushProvider = loadProvider();
