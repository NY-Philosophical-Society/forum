import type {
  CreatePostInput,
  CreateThreadInput,
  ChapterSummary,
  Post,
  TagWithCount,
  ThreadDetail,
  ThreadFeedResponse,
  ThreadSummary,
} from "@nyps-forum/shared";
import { z } from "zod";
import { api, ApiError, type ApiRequestOptions } from "~/lib/api";

const verificationStatusSchema = z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]);
export const publicUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  verificationStatus: verificationStatusSchema,
  canWrite: z.boolean(),
  canMessage: z.boolean(),
  role: z.enum(["user", "admin"]),
  isSupporter: z.boolean(),
  isSocietyMember: z.boolean(),
  createdAt: z.string(),
});
const tagSchema = z.object({ id: z.string(), slug: z.string(), name: z.string(), description: z.string() });
const chapterSchema = z.object({ id: z.string(), slug: z.string(), name: z.string() });
const threadSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  topicLabel: z.string().nullable().optional(),
  author: publicUserSchema,
  createdAt: z.string(),
  chapter: chapterSchema.nullable().optional(),
  kind: z.enum(["discussion", "event"]).optional(),
  eventDate: z.string().nullable().optional(),
  tags: z.array(tagSchema),
  likeCount: z.number().int().nonnegative(),
  myLiked: z.boolean(),
  postCount: z.number().int().nonnegative(),
  locked: z.boolean(),
  pinnedAt: z.string().nullable(),
  myBookmarked: z.boolean().optional(),
});
const postSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  parentId: z.string().nullable(),
  body: z.string(),
  author: publicUserSchema,
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  deleted: z.boolean(),
  likeCount: z.number().int().nonnegative(),
  myLiked: z.boolean(),
  wasThere: z.boolean().optional(),
});
const feedSchema = z.object({
  threads: z.array(threadSummarySchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
const detailSchema = z.object({
  thread: threadSummarySchema.extend({
    body: z.string(),
    editedAt: z.string().nullable(),
    deleted: z.boolean(),
    posts: z.array(postSchema),
    previewOnly: z.boolean(),
    attendeeCount: z.number().int().nonnegative().optional(),
    myAttended: z.boolean().optional(),
    eventCode: z.string().nullable().optional(),
    canPost: z.boolean().optional(),
    repliesTotal: z.number().int().nonnegative(),
    repliesLimit: z.number().int().positive(),
    repliesOffset: z.number().int().nonnegative(),
    hasMoreReplies: z.boolean(),
  }),
});
const tagsSchema = z.object({
  tags: z.array(tagSchema.extend({ threadCount: z.number().int().nonnegative() })),
});
const chapterSummarySchema = chapterSchema.extend({
  description: z.string().nullable(),
  location: z.string().nullable(),
  createdAt: z.string(),
  memberCount: z.number().int().nonnegative(),
  myMembership: z.enum(["none", "pending", "active"]),
  pendingCount: z.number().int().nonnegative().optional(),
});
const chaptersSchema = z.object({ chapters: z.array(chapterSummarySchema) });
const membershipSchema = z.object({ state: z.enum(["pending", "active"]) });
const createdThreadSchema = z.object({ thread: z.object({ id: z.string().min(1) }) });
const createdPostSchema = z.object({ post: z.object({ id: z.string().min(1) }) });
const likedSchema = z.object({ liked: z.boolean() });

function parseContract<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError("The forum returned data this version cannot safely display.", "invalid-response");
  }
  return parsed.data;
}

export type ForumFeedQuery = {
  sort: "hot" | "new";
  tag?: string;
  chapterSlug?: string;
  kind?: "event";
  period?: "upcoming" | "past";
  limit?: number;
  offset?: number;
};

export const forumApi = {
  async feed(query: ForumFeedQuery, token: string | null, options?: ApiRequestOptions): Promise<ThreadFeedResponse> {
    const params = new URLSearchParams({
      sort: query.sort,
      limit: String(query.limit ?? 20),
      offset: String(query.offset ?? 0),
    });
    if (query.tag && !query.chapterSlug) params.set("tag", query.tag);
    if (query.kind && !query.chapterSlug) params.set("kind", query.kind);
    if (query.kind === "event" && query.period && !query.chapterSlug) params.set("period", query.period);
    const path = query.chapterSlug
      ? `/api/chapters/${encodeURIComponent(query.chapterSlug)}/threads?${params}`
      : `/api/threads?${params}`;
    return parseContract(feedSchema, await api.get<unknown>(path, token, options));
  },

  async chapters(token: string, options?: ApiRequestOptions): Promise<ChapterSummary[]> {
    const result = parseContract(chaptersSchema, await api.get<unknown>("/api/chapters", token, options));
    return result.chapters;
  },

  async requestChapterJoin(slug: string, token: string, options?: ApiRequestOptions): Promise<"pending" | "active"> {
    const result = parseContract(
      membershipSchema,
      await api.post<unknown>(`/api/chapters/${encodeURIComponent(slug)}/join`, {}, token, options),
    );
    return result.state;
  },

  async tags(options?: ApiRequestOptions): Promise<TagWithCount[]> {
    const result = parseContract(tagsSchema, await api.get<unknown>("/api/tags", null, options));
    return result.tags;
  },

  async detail(
    id: string,
    token: string | null,
    options?: ApiRequestOptions,
    replies: { limit?: number; offset?: number } = {},
  ): Promise<ThreadDetail> {
    const params = new URLSearchParams({
      repliesLimit: String(replies.limit ?? 20),
      repliesOffset: String(replies.offset ?? 0),
    });
    const result = parseContract(
      detailSchema,
      await api.get<unknown>(`/api/threads/${encodeURIComponent(id)}?${params}`, token, options),
    );
    return result.thread;
  },

  async createThread(input: CreateThreadInput, token: string, options?: ApiRequestOptions): Promise<string> {
    const result = parseContract(createdThreadSchema, await api.post<unknown>("/api/threads", input, token, options));
    return result.thread.id;
  },

  async createReply(input: CreatePostInput, token: string, options?: ApiRequestOptions): Promise<string> {
    const result = parseContract(createdPostSchema, await api.post<unknown>("/api/posts", input, token, options));
    return result.post.id;
  },

  async toggleThreadLike(id: string, token: string, options?: ApiRequestOptions): Promise<boolean> {
    const result = parseContract(
      likedSchema,
      await api.post<unknown>(`/api/threads/${encodeURIComponent(id)}/like`, {}, token, options),
    );
    return result.liked;
  },
};

export function optimisticThreadLike(thread: ThreadSummary): ThreadSummary {
  const myLiked = !thread.myLiked;
  return {
    ...thread,
    myLiked,
    likeCount: Math.max(0, thread.likeCount + (myLiked ? 1 : -1)),
  };
}

export function forumFailureMessage(error: unknown, action = "load the forum"): string {
  if (!(error instanceof ApiError)) return `We couldn't ${action}. Please try again.`;
  if (error.kind === "cancelled") return "";
  if (error.kind === "timeout") return error.message;
  if (error.kind === "network") return "The forum is unreachable. Check your connection and try again.";
  if (error.kind === "invalid-response") return error.message;
  if (error.status === 401) return "Your session expired. Sign in again to continue.";
  if (error.status === 403) return "Your account does not have permission for that action.";
  if (error.status === 404) return "That discussion is no longer available.";
  if (error.status === 429) return "Too many requests. Wait a moment, then try again.";
  return error.message || `We couldn't ${action}. Please try again.`;
}

export type ReplyRow = { post: Post; depth: number };

export function orderReplyRows(posts: Post[]): ReplyRow[] {
  const children = new Map<string | null, Post[]>();
  for (const post of posts) {
    const list = children.get(post.parentId) ?? [];
    list.push(post);
    children.set(post.parentId, list);
  }
  const rows: ReplyRow[] = [];
  const visited = new Set<string>();
  const visit = (post: Post, depth: number) => {
    if (visited.has(post.id)) return;
    visited.add(post.id);
    rows.push({ post, depth });
    for (const child of children.get(post.id) ?? []) visit(child, depth + 1);
  };
  for (const root of children.get(null) ?? []) visit(root, 0);
  // A malformed orphan should remain visible for diagnosis, not disappear.
  for (const post of posts) if (!visited.has(post.id)) visit(post, 0);
  return rows;
}
