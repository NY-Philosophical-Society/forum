import { z } from "zod";

/**
 * Verification lifecycle. Mirrors the states a real provider (Stripe Identity /
 * Persona / Veriff) reports back via webhook, so swapping the stub for a real
 * provider later doesn't require changing anything downstream of this enum.
 */
export const VerificationStatus = {
  UNVERIFIED: "UNVERIFIED",
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const;
export type VerificationStatus =
  (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const FeedSort = {
  HOT: "hot",
  NEW: "new",
} as const;
export type FeedSort = (typeof FeedSort)[keyof typeof FeedSort];

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z
    .string()
    .min(2, "Enter your real first and last name")
    .max(80),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createThreadSchema = z.object({
  title: z.string().min(4).max(200),
  body: z.string().min(1).max(20000),
  tagIds: z.array(z.string()).max(5).optional().default([]),
});
export type CreateThreadInput = z.infer<typeof createThreadSchema>;

export const updateThreadSchema = z.object({
  title: z.string().min(4).max(200).optional(),
  body: z.string().min(1).max(20000).optional(),
  tagIds: z.array(z.string()).max(5).optional(),
});
export type UpdateThreadInput = z.infer<typeof updateThreadSchema>;

export const createPostSchema = z.object({
  threadId: z.string(),
  body: z.string().min(1).max(20000),
  parentId: z.string().nullable().optional(),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
  body: z.string().min(1).max(20000),
});
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const sendMessageSchema = z.object({
  recipientId: z.string(),
  body: z.string().min(1).max(5000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const googleAuthSchema = z.object({
  idToken: z.string().min(1),
});
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

export const appleAuthSchema = z.object({
  identityToken: z.string().min(1),
  // Apple only ever sends the user's name on their very first authorization,
  // as a separate field from the identity token itself — the client must
  // capture it then and pass it along here, or it's lost for good.
  displayName: z.string().min(2).max(80).optional(),
});
export type AppleAuthInput = z.infer<typeof appleAuthSchema>;

export const oauthDevMockSchema = z.object({
  provider: z.enum(["google", "apple"]),
  email: z.string().email(),
  displayName: z.string().min(2).max(80),
});
export type OAuthDevMockInput = z.infer<typeof oauthDevMockSchema>;

export const ReportTargetType = {
  THREAD: "thread",
  POST: "post",
  MESSAGE: "message",
  USER: "user",
} as const;
export type ReportTargetType = (typeof ReportTargetType)[keyof typeof ReportTargetType];

/**
 * Structured report reasons. The category is required so the admin queue can
 * be filtered and triaged; the note stays optional free text. Reports filed
 * before categories existed were migrated to OTHER with their original text
 * preserved as the note.
 */
export const ReportCategory = {
  HARASSMENT: "harassment",
  SPAM: "spam",
  OFF_TOPIC: "off_topic",
  MISINFORMATION: "misinformation",
  IMPERSONATION: "impersonation",
  OTHER: "other",
} as const;
export type ReportCategory = (typeof ReportCategory)[keyof typeof ReportCategory];

/** Display order in the report form and the admin filter. */
export const REPORT_CATEGORIES: ReportCategory[] = [
  "harassment",
  "spam",
  "off_topic",
  "misinformation",
  "impersonation",
  "other",
];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  harassment: "Harassment or abuse",
  spam: "Spam or advertising",
  off_topic: "Off-topic",
  misinformation: "Misinformation",
  impersonation: "Impersonation",
  other: "Other",
};

export const ReportStatus = {
  OPEN: "open",
  RESOLVED: "resolved",
  DISMISSED: "dismissed",
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const REPORT_NOTE_MAX_LENGTH = 1000;

export const createReportSchema = z.object({
  targetType: z.enum(["thread", "post", "message", "user"]),
  targetId: z.string(),
  category: z.enum(
    ["harassment", "spam", "off_topic", "misinformation", "impersonation", "other"],
    { errorMap: () => ({ message: "Choose a reason for this report" }) },
  ),
  note: z.string().max(REPORT_NOTE_MAX_LENGTH).optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

/**
 * What an admin did about a report. Resolving performs the action and closes
 * the report in one call, so a report can never be marked handled without the
 * action it claims having actually run.
 */
export const ReportAction = {
  NO_ACTION: "no_action",
  DELETE_CONTENT: "delete_content",
  WARN_AUTHOR: "warn_author",
  BAN_AUTHOR: "ban_author",
  LOCK_THREAD: "lock_thread",
} as const;
export type ReportAction = (typeof ReportAction)[keyof typeof ReportAction];

export const REPORT_ACTION_LABELS: Record<ReportAction, string> = {
  no_action: "Resolve with no action",
  delete_content: "Delete the content",
  warn_author: "Warn the author",
  ban_author: "Ban the author",
  lock_thread: "Lock the thread",
};

/** Reasons are mandatory on resolve: the moderation log is the accountability record. */
export const MODERATION_REASON_MAX_LENGTH = 500;
const moderationReason = z
  .string()
  .min(3, "Say why — this goes in the moderation log")
  .max(MODERATION_REASON_MAX_LENGTH);

export const resolveReportSchema = z.object({
  action: z.enum(["no_action", "delete_content", "warn_author", "ban_author", "lock_thread"]),
  // For warn_author this text is also what the member is shown, so write it
  // as something a person should read.
  reason: moderationReason,
});
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;

export const dismissReportSchema = z.object({
  reason: z.string().max(MODERATION_REASON_MAX_LENGTH).optional(),
});
export type DismissReportInput = z.infer<typeof dismissReportSchema>;

export const banUserSchema = z.object({ reason: moderationReason });
export type BanUserInput = z.infer<typeof banUserSchema>;

/** Unbanning restores access rather than removing it, so the note is optional. */
export const unbanUserSchema = z.object({
  reason: z.string().max(MODERATION_REASON_MAX_LENGTH).optional(),
});
export type UnbanUserInput = z.infer<typeof unbanUserSchema>;

export const warnUserSchema = z.object({
  // Delivered to the member verbatim as a notification.
  reason: moderationReason,
});
export type WarnUserInput = z.infer<typeof warnUserSchema>;

export const setUserRoleSchema = z.object({
  role: z.enum(["user", "admin"]),
  reason: moderationReason,
});
export type SetUserRoleInput = z.infer<typeof setUserRoleSchema>;

export const setSupporterSchema = z.object({
  isSupporter: z.boolean(),
  reason: moderationReason,
});
export type SetSupporterInput = z.infer<typeof setSupporterSchema>;

/** Admin deletion of someone else's content — the reason is recorded, not shown to readers. */
export const adminDeleteSchema = z.object({ reason: moderationReason });
export type AdminDeleteInput = z.infer<typeof adminDeleteSchema>;

export const toggleLockSchema = z.object({
  reason: z.string().max(MODERATION_REASON_MAX_LENGTH).optional(),
});
export type ToggleLockInput = z.infer<typeof toggleLockSchema>;

export const pinThreadSchema = z.object({
  reason: z.string().max(MODERATION_REASON_MAX_LENGTH).optional(),
});
export type PinThreadInput = z.infer<typeof pinThreadSchema>;

/**
 * How many threads may sit above the feed at once. Enforced by the API, not
 * just the UI — a buried feed is the failure mode this cap exists to prevent.
 */
export const MAX_PINNED_THREADS = 3;

/**
 * The moderation log's vocabulary. Every admin mutation writes exactly one of
 * these through the API's logModeration() helper; the log is append-only and
 * has no edit or delete path anywhere in the product.
 */
export const ModerationAction = {
  REPORT_RESOLVED: "report_resolved",
  REPORT_DISMISSED: "report_dismissed",
  CONTENT_DELETED: "content_deleted",
  USER_WARNED: "user_warned",
  USER_BANNED: "user_banned",
  USER_UNBANNED: "user_unbanned",
  THREAD_LOCKED: "thread_locked",
  THREAD_UNLOCKED: "thread_unlocked",
  THREAD_PINNED: "thread_pinned",
  THREAD_UNPINNED: "thread_unpinned",
  ROLE_GRANTED: "role_granted",
  ROLE_REVOKED: "role_revoked",
  SUPPORTER_GRANTED: "supporter_granted",
  SUPPORTER_REVOKED: "supporter_revoked",
} as const;
export type ModerationAction = (typeof ModerationAction)[keyof typeof ModerationAction];

export const MODERATION_ACTION_LABELS: Record<ModerationAction, string> = {
  report_resolved: "Resolved report",
  report_dismissed: "Dismissed report",
  content_deleted: "Deleted content",
  user_warned: "Warned member",
  user_banned: "Banned member",
  user_unbanned: "Unbanned member",
  thread_locked: "Locked thread",
  thread_unlocked: "Unlocked thread",
  thread_pinned: "Pinned thread",
  thread_unpinned: "Unpinned thread",
  role_granted: "Promoted to admin",
  role_revoked: "Demoted to member",
  supporter_granted: "Granted supporter",
  supporter_revoked: "Revoked supporter",
};

/** Actions that take something away — the UI renders these in --danger. */
export const DESTRUCTIVE_MODERATION_ACTIONS: ModerationAction[] = [
  "content_deleted",
  "user_banned",
  "role_revoked",
  "supporter_revoked",
];

export const redeemCodeSchema = z.object({
  code: z.string().min(1),
});
export type RedeemCodeInput = z.infer<typeof redeemCodeSchema>;

export const BIO_MAX_LENGTH = 500;

export const updateProfileSchema = z.object({
  // Rendered as markdown (same renderer as posts) since brief 03.
  bio: z.string().max(BIO_MAX_LENGTH, `Bio must be ${BIO_MAX_LENGTH} characters or fewer`).nullable().optional(),
  // The display name is the legal name tied to ID verification; the API
  // rejects this field for VERIFIED users (see routes/users.ts).
  displayName: z.string().min(2, "Enter your real first and last name").max(80).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  // Absent for OAuth-created accounts (passwordHash === null), which are
  // *setting* a first password rather than changing one.
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const changeEmailSchema = z.object({
  email: z.string().email(),
  // Required by the API whenever the account has a password.
  password: z.string().min(1).optional(),
});
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

export const deleteAccountSchema = z.object({
  // Required by the API whenever the account has a password; OAuth-only
  // accounts rely on the typed confirmation alone.
  password: z.string().min(1).optional(),
  confirm: z.literal("DELETE", {
    errorMap: () => ({ message: 'Type "DELETE" to confirm' }),
  }),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/**
 * Everything that creates an in-app notification. Reply/like split by target
 * (thread vs reply) so clients can word them precisely; likes collapse onto
 * one row per target and messages onto one row per sender (see the API's
 * lib/notifications.ts).
 */
export const NotificationType = {
  REPLY_THREAD: "reply_thread",
  REPLY_POST: "reply_post",
  LIKE_THREAD: "like_thread",
  LIKE_POST: "like_post",
  MENTION: "mention",
  MESSAGE: "message",
  /** A moderation warning. Deliberately has no preference key — see below. */
  WARNING: "warning",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/** User-facing preference groups — coarser than NotificationType on purpose. */
export const NotificationPrefKey = {
  REPLIES: "replies",
  LIKES: "likes",
  MENTIONS: "mentions",
  MESSAGES: "messages",
} as const;
export type NotificationPrefKey =
  (typeof NotificationPrefKey)[keyof typeof NotificationPrefKey];

/** Null for types a member cannot switch off — a moderation warning must land. */
export function prefKeyForNotificationType(
  type: NotificationType,
): NotificationPrefKey | null {
  switch (type) {
    case "reply_thread":
    case "reply_post":
      return "replies";
    case "like_thread":
    case "like_post":
      return "likes";
    case "mention":
      return "mentions";
    case "message":
      return "messages";
    case "warning":
      return null;
  }
}

export const updateNotificationPrefsSchema = z.object({
  master: z.boolean().optional(),
  replies: z.boolean().optional(),
  likes: z.boolean().optional(),
  mentions: z.boolean().optional(),
  messages: z.boolean().optional(),
});
export type UpdateNotificationPrefsInput = z.infer<typeof updateNotificationPrefsSchema>;

export const markNotificationsReadSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
});
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;

export const registerPushTokenSchema = z.object({
  token: z.string().min(1).max(400),
  platform: z.enum(["ios", "android"]),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const deregisterPushTokenSchema = z.object({
  token: z.string().min(1).max(400),
});
export type DeregisterPushTokenInput = z.infer<typeof deregisterPushTokenSchema>;

export const SearchResultType = {
  ALL: "all",
  THREADS: "threads",
  POSTS: "posts",
  USERS: "users",
} as const;
export type SearchResultType = (typeof SearchResultType)[keyof typeof SearchResultType];

export const SEARCH_MIN_QUERY_LENGTH = 2;

export const createBookmarkSchema = z.object({
  threadId: z.string(),
});
export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const confirmPasswordResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;
