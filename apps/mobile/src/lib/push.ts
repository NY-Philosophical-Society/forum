import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "./api";

/**
 * Device-side half of push notifications (server half:
 * apps/web/src/server/push-provider.ts — a log-only stub until real APNs/FCM
 * credentials exist, so nothing here can be verified end-to-end locally
 * beyond token registration).
 *
 * Permission is requested from the Alerts screen the first time it's opened
 * — the moment someone is demonstrably interested in notifications — never
 * cold on first launch.
 */

const STORAGE = { lastToken: null as string | null };

// Show foreground notifications as banners rather than silently dropping.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export async function pushPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

/**
 * Ask for permission (if needed), fetch the Expo token, and register it with
 * the API. Safe to call repeatedly; a denied permission is a quiet no-op.
 * Returns whether push ended up active.
 */
export async function registerForPush(authToken: string, ask: boolean): Promise<boolean> {
  try {
    let status = await pushPermissionStatus();
    if (status === "undetermined" && ask) {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status === "granted" ? "granted" : "denied";
    }
    if (status !== "granted") return false;

    const { data: token } = await Notifications.getExpoPushTokenAsync();
    await api.post(
      "/api/push-tokens",
      { token, platform: Platform.OS === "android" ? "android" : "ios" },
      authToken,
    );
    STORAGE.lastToken = token;
    return true;
  } catch {
    // No Expo project / simulator without push support — the app must never
    // surface an error for a missing nicety.
    return false;
  }
}

/** Deregister this device's token — called on logout while still authenticated. */
export async function deregisterPush(authToken: string): Promise<void> {
  try {
    const token = STORAGE.lastToken ?? (await Notifications.getExpoPushTokenAsync()).data;
    await api.deleteWithBody("/api/push-tokens", { token }, authToken);
    STORAGE.lastToken = null;
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // Best effort; a stale token is also pruned server-side on first
    // DeviceNotRegistered receipt.
  }
}

/** Mirror the in-app unread count on the app icon. */
export async function syncAppBadge(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // Badges are unsupported on some launchers — fine.
  }
}

export interface PushDeepLink {
  type: string;
  threadId?: string;
  postId?: string;
  actorId?: string;
}

/**
 * Subscribe to notification taps. The payload mirrors what the API's
 * notify() puts in `data`; returns an unsubscribe function.
 */
export function onPushOpened(handler: (link: PushDeepLink) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    if (data && typeof data.type === "string") {
      handler({
        type: data.type,
        threadId: typeof data.threadId === "string" ? data.threadId : undefined,
        postId: typeof data.postId === "string" ? data.postId : undefined,
        actorId: typeof data.actorId === "string" ? data.actorId : undefined,
      });
    }
  });
  return () => sub.remove();
}
