import type { VerificationStatus } from "./schemas";

export interface PublicUser {
  id: string;
  displayName: string;
  verificationStatus: VerificationStatus;
  role: "user" | "admin";
  isSupporter: boolean;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
  /** True when this sign-in attached a new provider (Google/Apple) to an existing password account. */
  linked?: boolean;
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
  locked: boolean;
}

export interface ThreadFeedResponse {
  threads: ThreadSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
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
  repliesTotal: number;
  repliesLimit: number;
  repliesOffset: number;
  hasMoreReplies: boolean;
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

export interface ConversationResponse {
  otherUser: PublicUser;
  messages: DirectMessage[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface OAuthConfig {
  google: { enabled: boolean; webClientId: string | null; iosClientId: string | null };
  apple: { enabled: boolean; servicesId: string | null };
}

export interface ReportSummary {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  createdAt: string;
}
