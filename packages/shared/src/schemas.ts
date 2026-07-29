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

export const createPostSchema = z.object({
  threadId: z.string(),
  body: z.string().min(1).max(20000),
  parentId: z.string().nullable().optional(),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

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

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const confirmPasswordResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;
