import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { createPost, createThread, signupVerified, TestUser } from "../test/helpers";

/**
 * Brief 05: search and bookmarks. Search must never serve anonymous
 * visitors — snippets would leak the full-body content the read-preview
 * wall exists to withhold.
 */

describe("search", () => {
  let author: TestUser;
  let threadId: string;

  beforeAll(async () => {
    author = await signupVerified("search-author");
    threadId = await createThread(author, {
      title: "The trolley problem revisited",
      body: "A runaway trolley approaches a fork in the track.",
    });
    await createPost(author, threadId, "Utilitarian answers feel unsatisfying here.");
  });

  it("rejects anonymous searches — snippets would breach the preview wall", async () => {
    const res = await request(app).get("/api/search?q=trolley");
    expect(res.status).toBe(401);
  });

  /**
   * Postgres LIKE is case-sensitive where SQLite's was not, so every `contains`
   * over human-typed text goes through containsInsensitive (src/db.ts).
   * Dropping it doesn't throw — search just quietly returns nothing, which
   * reads as "no results" rather than as a bug. Hence this test.
   */
  it("matches regardless of case", async () => {
    const res = await request(app)
      .get("/api/search?q=TROLLEY")
      .set("Authorization", `Bearer ${author.token}`);
    expect(res.status).toBe(200);
    expect(res.body.threads.items.some((t: { id: string }) => t.id === threadId)).toBe(true);

    const posts = await request(app)
      .get("/api/search?q=UTILITARIAN")
      .set("Authorization", `Bearer ${author.token}`);
    expect(
      posts.body.posts.items.some((p: { threadId: string }) => p.threadId === threadId),
    ).toBe(true);
  });

  it("finds threads, replies, and users, each shaped for its destination", async () => {
    const res = await request(app)
      .get("/api/search?q=trolley")
      .set("Authorization", `Bearer ${author.token}`);
    expect(res.status).toBe(200);
    expect(res.body.threads.items.some((t: any) => t.id === threadId)).toBe(true);

    const posts = await request(app)
      .get("/api/search?q=utilitarian")
      .set("Authorization", `Bearer ${author.token}`);
    const hit = posts.body.posts.items.find((p: any) => p.threadId === threadId);
    expect(hit).toBeTruthy();
    expect(hit.threadTitle).toBe("The trolley problem revisited");
    expect(hit.snippet.toLowerCase()).toContain("utilitarian");

    const users = await request(app)
      .get(`/api/search?q=${encodeURIComponent(author.displayName.slice(0, 12))}&type=users`)
      .set("Authorization", `Bearer ${author.token}`);
    expect(users.body.users.items.some((u: any) => u.id === author.id)).toBe(true);
    // type=users leaves the other sections empty
    expect(users.body.threads.items).toHaveLength(0);
  });

  it("excludes deleted threads from results", async () => {
    const doomed = await createThread(author, { title: "Ephemeral zeugma discussion" });
    await request(app)
      .delete(`/api/threads/${doomed}`)
      .set("Authorization", `Bearer ${author.token}`);
    const res = await request(app)
      .get("/api/search?q=zeugma")
      .set("Authorization", `Bearer ${author.token}`);
    expect(res.body.threads.items).toHaveLength(0);
  });

  it("paginates a section with limit/offset and reports hasMore", async () => {
    for (let i = 0; i < 3; i++) {
      await createThread(author, { title: `Sorites paradox case ${i}` });
    }
    const page1 = await request(app)
      .get("/api/search?q=sorites&type=threads&limit=2&offset=0")
      .set("Authorization", `Bearer ${author.token}`);
    expect(page1.body.threads.items).toHaveLength(2);
    expect(page1.body.threads.hasMore).toBe(true);

    const page2 = await request(app)
      .get("/api/search?q=sorites&type=threads&limit=2&offset=2")
      .set("Authorization", `Bearer ${author.token}`);
    expect(page2.body.threads.items).toHaveLength(1);
    expect(page2.body.threads.hasMore).toBe(false);
  });

  it("rejects queries below the minimum length", async () => {
    const res = await request(app)
      .get("/api/search?q=a")
      .set("Authorization", `Bearer ${author.token}`);
    expect(res.status).toBe(400);
  });
});

describe("bookmarks", () => {
  let user: TestUser;
  let threadId: string;

  beforeAll(async () => {
    user = await signupVerified("bm-user");
    threadId = await createThread(user, { title: "Worth saving" });
  });

  it("saves, lists, and unsaves a thread", async () => {
    const save = await request(app)
      .post("/api/bookmarks")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ threadId });
    expect(save.status).toBe(201);

    const list = await request(app)
      .get("/api/bookmarks")
      .set("Authorization", `Bearer ${user.token}`);
    expect(list.body.threads).toHaveLength(1);
    expect(list.body.threads[0].id).toBe(threadId);
    expect(list.body.threads[0].myBookmarked).toBe(true);

    // The feed reflects the saved state for this viewer.
    const feed = await request(app)
      .get("/api/threads")
      .set("Authorization", `Bearer ${user.token}`);
    expect(feed.body.threads.find((t: any) => t.id === threadId).myBookmarked).toBe(true);

    const unsave = await request(app)
      .delete(`/api/bookmarks/${threadId}`)
      .set("Authorization", `Bearer ${user.token}`);
    expect(unsave.status).toBe(200);
    const after = await request(app)
      .get("/api/bookmarks")
      .set("Authorization", `Bearer ${user.token}`);
    expect(after.body.threads).toHaveLength(0);
  });

  it("drops deleted threads from the saved list without unsaving", async () => {
    const doomed = await createThread(user, { title: "Saved then deleted" });
    await request(app)
      .post("/api/bookmarks")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ threadId: doomed });
    await request(app)
      .delete(`/api/threads/${doomed}`)
      .set("Authorization", `Bearer ${user.token}`);
    const list = await request(app)
      .get("/api/bookmarks")
      .set("Authorization", `Bearer ${user.token}`);
    expect(list.body.threads.some((t: any) => t.id === doomed)).toBe(false);
  });
});
