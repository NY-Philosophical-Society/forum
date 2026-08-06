import { describe, expect, it } from "vitest";
import request from "../test/request";
import { app } from "../app";
import { createPost, createThread, signup, signupVerified } from "../test/helpers";

describe("GET /api/users/:id/profile", () => {
  it("returns header, threads, and replies for a logged-in viewer", async () => {
    const author = await signupVerified("author");
    const viewer = await signup("viewer");
    const threadId = await createThread(author, { title: "On the profile page" });
    await createPost(author, threadId, "A reply from the author");

    const res = await request(app)
      .get(`/api/users/${author.id}/profile`)
      .set("Authorization", `Bearer ${viewer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.previewOnly).toBe(false);
    expect(res.body.user.id).toBe(author.id);
    expect(res.body.user.displayName).toBe(author.displayName);
    expect(res.body.threadCount).toBe(1);
    expect(res.body.replyCount).toBe(1);
    expect(res.body.threads[0].title).toBe("On the profile page");
    expect(res.body.replies[0].threadTitle).toBe("On the profile page");
    expect(res.body.replies[0].body).toBe("A reply from the author");
  });

  it("gives anonymous visitors the header only (previewOnly)", async () => {
    const author = await signupVerified("anon-target");
    await createThread(author);

    const res = await request(app).get(`/api/users/${author.id}/profile`);

    expect(res.status).toBe(200);
    expect(res.body.previewOnly).toBe(true);
    expect(res.body.user.id).toBe(author.id);
    expect(res.body.threadCount).toBe(1);
    expect(res.body.threads).toEqual([]);
    expect(res.body.replies).toEqual([]);
  });

  it("paginates threads most-recent-first", async () => {
    const author = await signupVerified("paginate");
    const viewer = await signup("pviewer");
    for (let i = 1; i <= 3; i++) {
      await createThread(author, { title: `Thread number ${i}` });
    }

    const page1 = await request(app)
      .get(`/api/users/${author.id}/profile?threadsLimit=2&threadsOffset=0`)
      .set("Authorization", `Bearer ${viewer.token}`);
    expect(page1.body.threads.map((t: { title: string }) => t.title)).toEqual([
      "Thread number 3",
      "Thread number 2",
    ]);
    expect(page1.body.hasMoreThreads).toBe(true);

    const page2 = await request(app)
      .get(`/api/users/${author.id}/profile?threadsLimit=2&threadsOffset=2`)
      .set("Authorization", `Bearer ${viewer.token}`);
    expect(page2.body.threads.map((t: { title: string }) => t.title)).toEqual(["Thread number 1"]);
    expect(page2.body.hasMoreThreads).toBe(false);
  });

  it("404s for a nonexistent user", async () => {
    const viewer = await signup("no-target");
    const res = await request(app)
      .get("/api/users/does-not-exist/profile")
      .set("Authorization", `Bearer ${viewer.token}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/users/me", () => {
  it("updates bio, trimming and storing empty as null", async () => {
    const user = await signup("bio");
    const set = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ bio: "  I think, therefore I post.  " });
    expect(set.status).toBe(200);
    expect(set.body.user.bio).toBe("I think, therefore I post.");

    const clear = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ bio: "" });
    expect(clear.body.user.bio).toBeNull();
  });

  it("caps bio length", async () => {
    const user = await signup("longbio");
    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ bio: "x".repeat(501) });
    expect(res.status).toBe(400);
  });

  it("lets an UNVERIFIED user change their display name", async () => {
    const user = await signup("rename");
    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ displayName: "Corrected Name" });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe("Corrected Name");
  });

  it("blocks display-name changes for VERIFIED users — the name is tied to ID verification", async () => {
    const user = await signupVerified("locked-name");
    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ displayName: "Someone Else" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/verified/i);

    // Sending the unchanged name (as a form submit would) is not an error.
    const unchanged = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ displayName: user.displayName, bio: "Still me" });
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.user.bio).toBe("Still me");
  });
});
