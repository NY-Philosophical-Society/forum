import type { VerificationStatus } from "./schemas";

export interface PublicUser {
  id: string;
  displayName: string;
  verificationStatus: VerificationStatus;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

export interface Tag {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export interface TagWithCount extends Tag {
  threadCount: number;
}

export interface ThreadSummary {
  id: string;
  title: string;
  author: PublicUser;
  createdAt: string;
  tags: Tag[];
  likeCount: number;
  myLiked: boolean;
  postCount: number;
}

export interface Post {
  id: string;
  threadId: string;
  parentId: string | null;
  body: string;
  author: PublicUser;
  createdAt: string;
  likeCount: number;
  myLiked: boolean;
}

export interface ThreadDetail extends ThreadSummary {
  body: string;
  posts: Post[];
  /** True when this response is a truncated preview for an anonymous (not-logged-in) visitor. */
  previewOnly: boolean;
}

export interface VerificationSessionResponse {
  sessionId: string;
  status: VerificationStatus;
  /** In production this is the provider-hosted verification URL (Stripe Identity, Persona, etc). */
  verificationUrl: string;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface ConversationSummary {
  otherUser: PublicUser;
  lastMessage: DirectMessage;
  unreadCount: number;
}

export interface OAuthConfig {
  google: { enabled: boolean; webClientId: string | null; iosClientId: string | null };
  apple: { enabled: boolean; servicesId: string | null };
}
