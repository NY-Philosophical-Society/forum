import type {
  ModerationAction,
  NotificationType,
  ReportAction,
  ReportCategory,
  ReportStatus,
  ReportTargetType,
  VerificationStatus,
} from "./schemas";

export interface PublicUser {
  id: string;
  displayName: string;
  /** Public photo URL from the storage provider; null renders as initials. */
  avatarUrl: string | null;
  bio: string | null;
  verificationStatus: VerificationStatus;
  /**
   * Whether this account may currently do write actions (post, reply, like,
   * DM). Under the honor-system default this is true regardless of
   * verificationStatus; once the club requires real ID verification
   * (REQUIRE_ID_VERIFICATION=true on the API), it tracks
   * `verificationStatus === "VERIFIED"`. Always check this rather than
   * verificationStatus directly when gating a write action in the UI — the
   * two are deliberately not the same thing.
   */
  canWrite: boolean;
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

/** Where a thread lives when it isn't in the main feed. */
export interface ChapterRef {
  id: string;
  slug: string;
  name: string;
}

export interface ThreadSummary {
  id: string;
  title: string;
  author: PublicUser;
  createdAt: string;
  /** Set only for chapter threads — responses carrying it are already access-checked. */
  chapter?: ChapterRef | null;
  /** "event" for an event's afterlife thread; absent/"discussion" otherwise. */
  kind?: "discussion" | "event";
  /** The event's date — set exactly when kind === "event". */
  eventDate?: string | null;
  tags: Tag[];
  likeCount: number;
  myLiked: boolean;
  postCount: number;
  locked: boolean;
  /**
   * Set by an admin pin. Pinned threads sort above everything in both hot and
   * new; the value is separate from hotScore so pinning never distorts ranking.
   */
  pinnedAt: string | null;
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
  /** In event threads: the author was at the event ("was there" marker). */
  wasThere?: boolean;
}

export interface ThreadDetail extends ThreadSummary {
  body: string;
  editedAt: string | null;
  /** Soft-deleted: title/body/author are tombstoned but surviving replies still render. */
  deleted: boolean;
  posts: Post[];
  /** True when this response is a truncated preview for an anonymous (not-logged-in) visitor. */
  previewOnly: boolean;
  /** Event threads only: how many people were in the room. */
  attendeeCount?: number;
  /** Event threads only: the viewer has the "was there" marker. */
  myAttended?: boolean;
  /** Event threads, admins only: the per-event attendance code to share. */
  eventCode?: string | null;
  /** Event threads only: posting requires membership; true when the viewer may reply. */
  canPost?: boolean;
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

/**
 * The reported content, inlined into the admin queue so a report can be judged
 * without navigating away. `missing` covers a target that has since been hard-
 * deleted or never existed (reports carry a bare id, not a foreign key).
 */
export interface ReportTargetPreview {
  kind: ReportTargetType;
  /** Deep-link coordinates: both null for a user report. */
  threadId: string | null;
  postId: string | null;
  title: string | null;
  /** Markdown for thread/post/message targets; the bio for a user target. */
  body: string | null;
  author: PublicUser | null;
  createdAt: string | null;
  /** Already soft-deleted — an admin may still want the record of it. */
  deleted: boolean;
  locked: boolean;
  missing: boolean;
}

export interface ReportSummary {
  id: string;
  /** Null only if the reporter's account has since been deleted. */
  reporter: PublicUser | null;
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  /** The reporter's optional free-text note. */
  note: string | null;
  status: ReportStatus;
  createdAt: string;
  resolvedBy: PublicUser | null;
  resolvedAt: string | null;
  /** The action taken at resolution; null while the report is still open. */
  resolutionAction: ReportAction | null;
  resolutionNote: string | null;
  target: ReportTargetPreview;
}

export interface ReportsResponse {
  reports: ReportSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  /** Open reports overall, regardless of the current filter — drives the nav count. */
  openCount: number;
}

export interface AdminUserSummary {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  verificationStatus: VerificationStatus;
  role: "user" | "admin";
  isSupporter: boolean;
  bannedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  threadCount: number;
  replyCount: number;
  /** Open reports filed against this member or their content. */
  openReportCount: number;
}

export interface AdminUsersResponse {
  users: AdminUserSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  /** Live admin count, so the UI can grey out the demote that would empty the role. */
  adminCount: number;
}

export interface AdminThreadSummary {
  id: string;
  title: string;
  author: PublicUser;
  createdAt: string;
  locked: boolean;
  pinnedAt: string | null;
  deleted: boolean;
  likeCount: number;
  postCount: number;
}

export interface AdminThreadsResponse {
  threads: AdminThreadSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  pinnedCount: number;
  pinLimit: number;
}

export interface ModerationLogEntry {
  id: string;
  /** Null only if the acting admin's account has since been deleted. */
  actor: PublicUser | null;
  action: ModerationAction;
  targetType: string;
  targetId: string;
  /** Label captured when the action ran, so the entry still reads after a delete. */
  targetLabel: string | null;
  reason: string | null;
  createdAt: string;
}

/** One chapter as the viewer sees it in the directory. */
export interface ChapterSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
  createdAt: string;
  memberCount: number;
  myMembership: "none" | "pending" | "active";
  /** Present for admins only: join requests awaiting review. */
  pendingCount?: number;
}

export interface ChaptersResponse {
  chapters: ChapterSummary[];
}

export interface ChapterDetailResponse {
  chapter: ChapterSummary;
}

export interface ChapterMemberItem {
  user: PublicUser;
  state: "pending" | "active";
  createdAt: string;
}

export interface ChapterMembersResponse {
  members: ChapterMemberItem[];
  /** Admin-only: pending join requests, oldest first. */
  pending?: ChapterMemberItem[];
}

/** One row of the member directory (opt-in, member-only). */
export interface DirectoryEntry {
  user: PublicUser;
  /** Short free-text interests — plain text, not markdown. */
  directoryBio: string | null;
  openToPartners: boolean;
  /** Chapters this member is an active member of. */
  chapters: ChapterRef[];
}

export interface DirectoryResponse {
  entries: DirectoryEntry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** The caller's own directory settings (Settings screen). */
export interface DirectorySettings {
  directoryVisible: boolean;
  directoryBio: string | null;
  openToPartners: boolean;
}

export interface ModerationLogResponse {
  entries: ModerationLogEntry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
