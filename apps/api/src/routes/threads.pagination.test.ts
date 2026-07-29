import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { createPost, createThread, signupVerified, TestUser } from "../test/helpers";

interface WirePost {
  id: string;
  parentId: string | null;
  body: string;
}

/**
 * Replies paginate by top-level reply, but a paginated top-level reply must
 * always bring its whole descendant tree with it — a nested reply whose
 * parent didn't make the page would render orphaned.
 */
describe("reply pagination", () => {
  let author: TestUser;
  let threadId: string;
  // Five top-level replies; #1 has a child and a grandchild, #3 has two
  // children, #4 has one. Created sequentially with a small delay so
  // createdAt ordering (which drives the pagination) is unambiguous.
  const topLevel: string[] = [];
  const childrenOf = new Map<string, string[]>();

  async function reply(body: string, parentId: string | null): Promise<string> {
    await new Promise((r) => setTimeout(r, 3));
    const id = await createPost(author, threadId, body, parentId);
    if (parentId) {
      childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), id]);
    } else {
      topLevel.push(id);
    }
    return id;
  }

  beforeAll(async () => {
    author = await signupVerified("page-author");
    threadId = await createThread(author, { title: "Pagination fixture" });

    const t1 = await reply("T1", null);
    const t1child = await reply("T1 > child", t1);
    await reply("T1 > child > grandchild", t1child);
    await reply("T2", null);
    const t3 = await reply("T3", null);
    await reply("T3 > child A", t3);
    await reply("T3 > child B", t3);
    const t4 = await reply("T4", null);
    await reply("T4 > child", t4);
    await reply("T5", null);
  });

  async function getPage(limit: number, offset: number) {
    const res = await request(app)
      .get(`/api/threads/${threadId}?repliesLimit=${limit}&repliesOffset=${offset}`)
      .set("Authorization", `Bearer ${author.token}`);
    expect(res.status).toBe(200);
    return res.body.thread;
  }

  function assertNoOrphans(posts: WirePost[]) {
    const ids = new Set(posts.map((p) => p.id));
    for (const p of posts) {
      if (p.parentId !== null) {
        expect(ids.has(p.parentId), `reply ${p.body} arrived without its parent`).toBe(true);
      }
    }
  }

  it("returns everything when the page is large enough", async () => {
    const thread = await getPage(20, 0);
    expect(thread.repliesTotal).toBe(5); // top-level count, not all 10 posts
    expect(thread.postCount).toBe(10);
    expect(thread.posts).toHaveLength(10);
    expect(thread.hasMoreReplies).toBe(false);
    assertNoOrphans(thread.posts);
  });

  it("first page: two top-level replies plus their full descendant trees", async () => {
    const thread = await getPage(2, 0);
    const pageTop = thread.posts.filter((p: WirePost) => p.parentId === null).map((p: WirePost) => p.id);
    expect(pageTop).toEqual(topLevel.slice(0, 2));
    // T1's chain came along in full: child and grandchild.
    expect(thread.posts.map((p: WirePost) => p.body).sort()).toEqual(
      ["T1", "T1 > child", "T1 > child > grandchild", "T2"].sort(),
    );
    expect(thread.hasMoreReplies).toBe(true);
    assertNoOrphans(thread.posts);
  });

  it("middle page keeps multi-child trees intact", async () => {
    const thread = await getPage(2, 2);
    expect(thread.posts.map((p: WirePost) => p.body).sort()).toEqual(
      ["T3", "T3 > child A", "T3 > child B", "T4", "T4 > child"].sort(),
    );
    expect(thread.hasMoreReplies).toBe(true);
    assertNoOrphans(thread.posts);
  });

  it("last page reports no more replies", async () => {
    const thread = await getPage(2, 4);
    expect(thread.posts.map((p: WirePost) => p.body)).toEqual(["T5"]);
    expect(thread.hasMoreReplies).toBe(false);
  });

  it("pages are disjoint and their union is the whole tree", async () => {
    const pages = [await getPage(2, 0), await getPage(2, 2), await getPage(2, 4)];
    const allIds = pages.flatMap((t) => t.posts.map((p: WirePost) => p.id));
    expect(allIds).toHaveLength(10);
    expect(new Set(allIds).size).toBe(10);
  });

  it("an offset past the end returns an empty page, not an error", async () => {
    const thread = await getPage(2, 40);
    expect(thread.posts).toEqual([]);
    expect(thread.hasMoreReplies).toBe(false);
  });
});

describe("feed pagination", () => {
  it("pages the feed with stable totals and hasMore", async () => {
    const author = await signupVerified("feed-page");
    for (let i = 0; i < 3; i += 1) {
      await new Promise((r) => setTimeout(r, 3));
      await createThread(author, { title: `Feed thread ${i}` });
    }

    const page1 = await request(app).get("/api/threads?sort=new&limit=2&offset=0");
    const page2 = await request(app).get("/api/threads?sort=new&limit=2&offset=2");
    expect(page1.body.threads).toHaveLength(2);
    expect(page1.body.hasMore).toBe(true);
    expect(page2.body.hasMore).toBe(false);
    expect(page1.body.total).toBe(page2.body.total);

    const ids = [...page1.body.threads, ...page2.body.threads].map((t: { id: string }) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
