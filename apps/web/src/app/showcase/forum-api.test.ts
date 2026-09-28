import { afterEach, describe, expect, it, vi } from "vitest";
import type { Post, ThreadSummary } from "@nyps-forum/shared";
import { ApiError } from "~/lib/api";
import { forumApi, forumFailureMessage, optimisticThreadLike, orderReplyRows } from "./forum-api";

const user = {
  id: "user-1",
  displayName: "Ada Example",
  avatarUrl: null,
  bio: null,
  verificationStatus: "VERIFIED" as const,
  canWrite: true,
  canMessage: true,
  role: "user" as const,
  isSupporter: false,
  isSocietyMember: false,
  createdAt: "2026-09-20T00:00:00.000Z",
};
const thread: ThreadSummary = {
  id: "thread-1",
  title: "A sufficiently long question?",
  author: user,
  createdAt: "2026-09-20T00:00:00.000Z",
  tags: [],
  likeCount: 0,
  myLiked: false,
  postCount: 0,
  locked: false,
  pinnedAt: null,
};

function json(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }));
}

afterEach(() => vi.unstubAllGlobals());

describe("showcase forum API boundary", () => {
  it("encodes feed filters and accepts the production response contract", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () => json({ threads: [thread], total: 1, limit: 20, offset: 0, hasMore: false }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await forumApi.feed({ sort: "new", tag: "mind & body" }, "token");
    expect(result.threads[0].id).toBe(thread.id);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/threads?sort=new&limit=20&offset=0&tag=mind+%26+body");
  });

  it("uses the chapter feed without sending unsupported tag filters", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () => json({ threads: [], total: 0, limit: 20, offset: 0, hasMore: false }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await forumApi.feed({ sort: "hot", chapterSlug: "New York / West", tag: "ethics" }, "token");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/chapters/New%20York%20%2F%20West/threads?sort=hot&limit=20&offset=0");
  });

  it("requests only upcoming event threads in calendar order", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () => json({ threads: [], total: 0, limit: 20, offset: 0, hasMore: false }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await forumApi.feed({ sort: "new", kind: "event", period: "upcoming" }, "token");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/threads?sort=new&limit=20&offset=0&kind=event&period=upcoming");
  });

  it("keeps pending chapter membership distinct from active access", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () => json({ state: "pending" }, 201),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await forumApi.requestChapterJoin("nyc", "token")).toBe("pending");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/chapters/nyc/join");
  });

  it("rejects chapter summaries without explicit membership state", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ chapters: [{ id: "chapter-1", slug: "nyc", name: "New York" }] })));
    await expect(forumApi.chapters("member-token")).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("rejects a successful response that violates the runtime contract", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ threads: [{ id: "partial" }] })));
    await expect(forumApi.feed({ sort: "hot" }, null)).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("requests reply pages explicitly instead of truncating large discussions silently", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () => json({
        thread: {
          ...thread, body: "Context", editedAt: null, deleted: false, posts: [], previewOnly: false,
          repliesTotal: 25, repliesLimit: 10, repliesOffset: 10, hasMoreReplies: true,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await forumApi.detail("thread/unsafe", "token", undefined, { limit: 10, offset: 10 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/threads/thread%2Funsafe?repliesLimit=10&repliesOffset=10");
  });

  it("does not alter the write contract for a new discussion", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () => json({ thread: { id: "created" } }, 201),
    );
    vi.stubGlobal("fetch", fetchMock);
    const id = await forumApi.createThread({ title: "A real question", body: "Some context", topicLabel: "Moral luck", tagIds: ["tag-1"] }, "token");
    expect(id).toBe("created");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ title: "A real question", body: "Some context", topicLabel: "Moral luck", tagIds: ["tag-1"] });
  });

  it("preserves the parent when creating a nested reply", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () => json({ post: { id: "reply-2" } }, 201),
    );
    vi.stubGlobal("fetch", fetchMock);
    await forumApi.createReply({ threadId: "thread-1", body: "A reply", parentId: "reply-1" }, "token");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ parentId: "reply-1" });
  });

  it("applies optimistic like state without allowing negative counts", () => {
    expect(optimisticThreadLike(thread)).toMatchObject({ myLiked: true, likeCount: 1 });
    expect(optimisticThreadLike({ ...thread, myLiked: true })).toMatchObject({ myLiked: false, likeCount: 0 });
  });

  it("orders nested replies and keeps an orphan visible", () => {
    const post = (id: string, parentId: string | null): Post => ({
      id, parentId, threadId: "thread-1", body: id, author: user,
      createdAt: "2026-09-20T00:00:00.000Z", editedAt: null, deleted: false,
      likeCount: 0, myLiked: false,
    });
    const rows = orderReplyRows([post("child", "root"), post("root", null), post("orphan", "missing")]);
    expect(rows.map(({ post: item, depth }) => [item.id, depth])).toEqual([["root", 0], ["child", 1], ["orphan", 0]]);
  });

  it("gives actionable messages without exposing response details", () => {
    expect(forumFailureMessage(new ApiError("raw", "http", 401))).toContain("session expired");
    expect(forumFailureMessage(new ApiError("raw", "http", 429))).toContain("Wait a moment");
    expect(forumFailureMessage(new ApiError("Request cancelled", "cancelled"))).toBe("");
  });
});
