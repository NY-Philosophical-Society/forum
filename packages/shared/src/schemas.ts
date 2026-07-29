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

export const createReportSchema = z.object({
  targetType: z.enum(["thread", "post", "message", "user"]),
  targetId: z.string(),
  reason: z.string().min(3).max(1000),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

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

export function prefKeyForNotificationType(type: NotificationType): NotificationPrefKey {
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
