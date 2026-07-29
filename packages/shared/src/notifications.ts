import type { NotificationItem } from "./types";

/**
 * The sentence after the actor's name in a notification row — clients render
 * the name themselves (bolded, linked) and append this. Collapsed rows fold
 * the extra actors/messages into the phrasing: "and 2 others liked …".
 */
export function describeNotification(n: Pick<NotificationItem, "type" | "count">): string {
  const others = n.count - 1;
  switch (n.type) {
    case "reply_thread":
      return "replied to your thread";
    case "reply_post":
      return "replied to your reply";
    case "like_thread":
      return others > 0
        ? `and ${others} ${others === 1 ? "other" : "others"} liked your thread`
        : "liked your thread";
    case "like_post":
      return others > 0
        ? `and ${others} ${others === 1 ? "other" : "others"} liked your reply`
        : "liked your reply";
    case "mention":
      return "mentioned you";
    case "message":
      return n.count > 1 ? `sent you ${n.count} messages` : "sent you a message";
    case "warning":
      return "sent you a moderation warning";
  }
}
