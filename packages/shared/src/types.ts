import type { NotificationType, VerificationStatus } from "./schemas";

export interface PublicUser {
  id: string;
  displayName: string;
  /** Public photo URL from the storage provider; null renders as initials. */
  avatarUrl: string | null;
  bio: string | null;
  verificationStatus: VerificationStatus;
  role: "user" | "admin";
  isSupporter: boolean;
  createdAt: string;
}

/** A user's reply as shown on their profile page, with enough thread context to link to. */
export interface ProfileReply {
  id: string;
  threadId: string;
  threadTitle: string;
  body: string;
  createdAt: string;
  likeCount: number;
}

export interface UserProfileResponse {
  user: PublicUser;
  threadCount: number;
  replyCount: number;
  threads: ThreadSummary[];
  hasMoreThreads: boolean;
  replies: ProfileReply[];
  hasMoreReplies: boolean;
  /** True for anonymous (not-logged-in) web visitors — profile header only, no content lists. */
  previewOnly: boolean;
}

export interface DataExport {
  exportedAt: string;
  account: {
    id: string;
    email: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    verificationStatus: string;
    isSupporter: boolean;
    createdAt: string;
  };
  threads: { id: string; title: string; body: string; createdAt: string }[];
  posts: { id: string; threadId: string; body: string; createdAt: string }[];
  messagesSent: { id: string; recipientId: string; body: string; createdAt: string }[];
  messagesReceived: { id: string; senderId: string; body: string; createdAt: string }[];
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
  /** Present on feed/detail/bookmark responses; absent where no viewer exists. */
  myBookmarked?: boolean;
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
  /** Set on every author/admin edit; clients show an "edited" note. */
  editedAt: string | null;
  /** Soft-deleted tombstone: body is empty and author is anonymized, kept so replies below it don't orphan. */
  deleted: boolean;
  likeCount: number;
  myLiked: boolean;
}

export interface ThreadDetail extends ThreadSummary {
  body: string;
  editedAt: string | null;
  /** Soft-deleted: title/body/author are tombstoned but surviving replies still render. */
  deleted: boolean;
  posts: Post[];
  /** True when this response is a truncated preview for an anonymous (not-logged-in) visitor. */
  previewOnly: boolean;
  repliesTotal: number;
  repliesLimit: number;
  repliesOffset: number;
  hasMoreReplies: boolean;
}

export interface ImageUploadResponse {
  /** Public URL from the storage provider; final (re-encoded) pixel size follows in width/height. */
  url: string;
  width: number;
  height: number;
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

export interface NotificationItem {
  id: string;
  type: NotificationType;
  /** Most recent actor. Null only if the actor's account no longer exists. */
  actor: PublicUser | null;
  /** Distinct actors for collapsed likes; message count for collapsed DMs; 1 otherwise. */
  count: number;
  threadId: string | null;
  postId: string | null;
  /** Title of the thread the event happened in ("[deleted]" if it was removed). */
  threadTitle: string | null;
  snippet: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  unreadCount: number;
}

export interface NotificationPreferences {
  master: boolean;
  replies: boolean;
  likes: boolean;
  mentions: boolean;
  messages: boolean;
}

export interface ThreadSearchResult {
  id: string;
  title: string;
  snippet: string;
  author: PublicUser;
  createdAt: string;
  likeCount: number;
  postCount: number;
}

export interface PostSearchResult {
  id: string;
  threadId: string;
  threadTitle: string;
  snippet: string;
  author: PublicUser;
  createdAt: string;
}

export interface SearchSection<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export interface SearchResponse {
  q: string;
  threads: SearchSection<ThreadSearchResult>;
  posts: SearchSection<PostSearchResult>;
  users: SearchSection<PublicUser>;
  limit: number;
  offset: number;
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
