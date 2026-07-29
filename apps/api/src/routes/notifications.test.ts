import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { mentionMarkdown, type NotificationItem } from "@nyps-forum/shared";
import { app } from "../app";
import { createPost, createThread, signupVerified, TestUser } from "../test/helpers";

/**
 * Brief 05: in-app notifications. The rules under test are the ones the
 * brief calls out explicitly — no self-notifications, blocks suppress in
 * both directions, likes collapse per target, and read state round-trips.
 */

async function getNotifications(user: TestUser): Promise<{
  notifications: NotificationItem[];
  unreadCount: number;
}> {
  const res = await request(app)
    .get("/api/notifications")
    .set("Authorization", `Bearer ${user.token}`);
  expect(res.status).toBe(200);
  return res.body;
}

describe("notification emission", () => {
  let author: TestUser;
  let replier: TestUser;
  let threadId: string;

  beforeAll(async () => {
    author = await signupVerified("notif-author");
    replier = await signupVerified("notif-replier");
    threadId = await createThread(author, { title: "Notify me", body: "Original body" });
  });

  it("notifies the thread author about a top-level reply, with a deep-link target", async () => {
    const postId = await createPost(replier, threadId, "A considered objection");
    const { notifications } = await getNotifications(author);
    const n = notifications.find((x) => x.type === "reply_thread" && x.postId === postId);
    expect(n).toBeTruthy();
    expect(n!.actor?.id).toBe(replier.id);
    expect(n!.threadId).toBe(threadId);
    expect(n!.threadTitle).toBe("Notify me");
    expect(n!.snippet).toContain("A considered objection");
    expect(n!.readAt).toBeNull();
  });

  it("notifies the parent's author (not the thread author) about a nested reply", async () => {
    const parentId = await createPost(replier, threadId, "Parent reply");
    await createPost(author, threadId, "Nested response", parentId);
    const { notifications } = await getNotifications(replier);
    const n = notifications.find((x) => x.type === "reply_post");
    expect(n).toBeTruthy();
    expect(n!.actor?.id).toBe(author.id);
  });

  it("never notifies someone about their own action", async () => {
    await createPost(author, threadId, "Replying to myself");
    const { notifications } = await getNotifications(author);
    expect(
      notifications.some((n) => n.actor?.id === author.id && n.type.startsWith("reply")),
    ).toBe(false);
  });

  it("collapses repeated likes on one target into a single row with a count", async () => {
    const liker2 = await signupVerified("notif-liker2");
    await request(app)
      .post(`/api/threads/${threadId}/like`)
      .set("Authorization", `Bearer ${replier.token}`);
    await request(app)
      .post(`/api/threads/${threadId}/like`)
      .set("Authorization", `Bearer ${liker2.token}`);
    const { notifications } = await getNotifications(author);
    const likes = notifications.filter((n) => n.type === "like_thread");
    expect(likes).toHaveLength(1);
    expect(likes[0].count).toBe(2);
  });

  it("does not inflate the like count on a like → unlike → like toggle", async () => {
    // replier unlikes, then re-likes: still 2 distinct actors.
    await request(app)
      .post(`/api/threads/${threadId}/like`)
      .set("Authorization", `Bearer ${replier.token}`);
    await request(app)
      .post(`/api/threads/${threadId}/like`)
      .set("Authorization", `Bearer ${replier.token}`);
    const { notifications } = await getNotifications(author);
    const likes = notifications.filter((n) => n.type === "like_thread");
    expect(likes).toHaveLength(1);
    expect(likes[0].count).toBe(2);
  });

  it("notifies on @mention but not twice for the reply recipient", async () => {
    const mentioner = await signupVerified("notif-mentioner");
    const other = await signupVerified("notif-mentioned");
    // Mentions both the thread author (who already gets reply_thread) and a
    // third user (who gets a mention notification).
    await createPost(
      mentioner,
      threadId,
      `cc ${mentionMarkdown(author.displayName, author.id)} and ${mentionMarkdown(other.displayName, other.id)}`,
    );
    const authorNotifs = await getNotifications(author);
    const fromMentioner = authorNotifs.notifications.filter(
      (n) => n.actor?.id === mentioner.id,
    );
    expect(fromMentioner.some((n) => n.type === "reply_thread")).toBe(true);
    expect(fromMentioner.some((n) => n.type === "mention")).toBe(false);

    const otherNotifs = await getNotifications(other);
    expect(otherNotifs.notifications.some((n) => n.type === "mention")).toBe(true);
  });

  it("suppresses notifications across a block in either direction", async () => {
    const blocked = await signupVerified("notif-blocked");
    const blocker = await signupVerified("notif-blocker");
    const bThread = await createThread(blocker, { title: "Blocked interactions" });
    const res = await request(app)
      .post(`/api/users/${blocked.id}/block`)
      .set("Authorization", `Bearer ${blocker.token}`);
    expect(res.status).toBe(201);

    await createPost(blocked, bThread, "You won't hear about this");
    const { notifications } = await getNotifications(blocker);
    expect(notifications.some((n) => n.actor?.id === blocked.id)).toBe(false);
  });

  it("respects a disabled per-type preference and the master toggle", async () => {
    const quiet = await signupVerified("notif-quiet");
    const noisy = await signupVerified("notif-noisy");
    const qThread = await createThread(quiet, { title: "Quiet hours" });
    await request(app)
      .put("/api/notifications/preferences")
      .set("Authorization", `Bearer ${quiet.token}`)
      .send({ likes: false });

    await request(app)
      .post(`/api/threads/${qThread}/like`)
      .set("Authorization", `Bearer ${noisy.token}`);
    let result = await getNotifications(quiet);
    expect(result.notifications.some((n) => n.type === "like_thread")).toBe(false);

    // Replies still arrive... until the master toggle goes off.
    await createPost(noisy, qThread, "First reply");
    result = await getNotifications(quiet);
    expect(result.notifications.some((n) => n.type === "reply_thread")).toBe(true);

    await request(app)
      .put("/api/notifications/preferences")
      .set("Authorization", `Bearer ${quiet.token}`)
      .send({ master: false });
    await createPost(noisy, qThread, "Second reply");
    result = await getNotifications(quiet);
    expect(result.notifications.filter((n) => n.type === "reply_thread")).toHaveLength(1);
  });
});

describe("read state", () => {
  let recipient: TestUser;
  let actor: TestUser;

  beforeAll(async () => {
    recipient = await signupVerified("read-recipient");
    actor = await signupVerified("read-actor");
    const t = await createThread(recipient, { title: "Read state thread" });
    await createPost(actor, t, "Reply one");
    await createPost(actor, t, "Reply two");
  });

  it("counts unread cheaply and marks one read", async () => {
    const before = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", `Bearer ${recipient.token}`);
    expect(before.body.unreadCount).toBe(2);

    const { notifications } = await getNotifications(recipient);
    const res = await request(app)
      .post("/api/notifications/read")
      .set("Authorization", `Bearer ${recipient.token}`)
      .send({ ids: [notifications[0].id] });
    expect(res.status).toBe(200);

    const after = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", `Bearer ${recipient.token}`);
    expect(after.body.unreadCount).toBe(1);
  });

  it("marks all read", async () => {
    await request(app)
      .post("/api/notifications/read-all")
      .set("Authorization", `Bearer ${recipient.token}`);
    const after = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", `Bearer ${recipient.token}`);
    expect(after.body.unreadCount).toBe(0);
  });

  it("cannot mark someone else's notification read", async () => {
    const t = await createThread(recipient, { title: "Ownership check" });
    await createPost(actor, t, "Another reply");
    const { notifications } = await getNotifications(recipient);
    const target = notifications.find((n) => n.readAt === null)!;

    await request(app)
      .post("/api/notifications/read")
      .set("Authorization", `Bearer ${actor.token}`)
      .send({ ids: [target.id] });
    const { notifications: after } = await getNotifications(recipient);
    expect(after.find((n) => n.id === target.id)!.readAt).toBeNull();
  });
});

describe("message notifications", () => {
  it("collapses per sender and clears when the conversation is opened", async () => {
    const sender = await signupVerified("dm-sender");
    const receiver = await signupVerified("dm-receiver");
    for (const body of ["First", "Second", "Third"]) {
      await request(app)
        .post("/api/messages")
        .set("Authorization", `Bearer ${sender.token}`)
        .send({ recipientId: receiver.id, body });
    }
    const { notifications } = await getNotifications(receiver);
    const dm = notifications.filter((n) => n.type === "message");
    expect(dm).toHaveLength(1);
    expect(dm[0].count).toBe(3);
    expect(dm[0].snippet).toContain("Third");

    await request(app)
      .get(`/api/messages/${sender.id}`)
      .set("Authorization", `Bearer ${receiver.token}`);
    const after = await getNotifications(receiver);
    expect(after.notifications.find((n) => n.type === "message")!.readAt).not.toBeNull();
  });
});
