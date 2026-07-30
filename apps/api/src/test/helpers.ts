import { randomUUID } from "crypto";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";

export interface TestUser {
  token: string;
  id: string;
  email: string;
  password: string;
  displayName: string;
}

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@test.nyphilosophy.org`;
}

/** Create an account through POST /api/auth/signup. Starts UNVERIFIED. */
export async function signup(prefix = "user"): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  const password = "correct-horse-battery";
  const displayName = `Test ${prefix} ${randomUUID().slice(0, 6)}`;
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ email, password, displayName });
  if (res.status !== 201) {
    throw new Error(`signup failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token, id: res.body.user.id, email, password, displayName };
}

/**
 * Walk the real verification flow: start a session, then approve it via the
 * stub provider's mock-complete route — the same way a human does locally.
 */
export async function verifyUser(user: TestUser): Promise<void> {
  const start = await request(app)
    .post("/api/verification/start")
    .set("Authorization", `Bearer ${user.token}`);
  if (start.status !== 201) {
    throw new Error(`verification start failed (${start.status}): ${JSON.stringify(start.body)}`);
  }
  const complete = await request(app)
    .post(`/api/verification/mock-complete/${start.body.sessionId}`)
    .send({ approve: true });
  if (complete.status !== 200 || complete.body.status !== "VERIFIED") {
    throw new Error(`mock-complete failed (${complete.status}): ${JSON.stringify(complete.body)}`);
  }
}

/** Signup + complete verification — a user who can post/reply/like/DM. */
export async function signupVerified(prefix = "verified"): Promise<TestUser> {
  const user = await signup(prefix);
  await verifyUser(user);
  return user;
}

/**
 * There is no API path to admin (promotion is direct DB access per the
 * README), so this fixture mirrors that documented process.
 */
export async function promoteToAdmin(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { role: "admin" } });
}

/** Redeem the standing WISDOMKEY code — the placeholder membership unlock. */
export async function makeSupporter(user: TestUser): Promise<void> {
  const res = await request(app)
    .post("/api/auth/redeem-code")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ code: "WISDOMKEY" });
  if (res.status !== 200) {
    throw new Error(`redeem-code failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
}

/** Signup + verify + redeem — a full Member who can use member features. */
export async function signupMember(prefix = "member"): Promise<TestUser> {
  const user = await signupVerified(prefix);
  await makeSupporter(user);
  return user;
}

/** Signup + verify + promote — an admin who is deliberately NOT a supporter. */
export async function signupAdmin(prefix = "admin"): Promise<TestUser> {
  const user = await signupVerified(prefix);
  await promoteToAdmin(user.id);
  return user;
}

/** Create a chapter through the API as the given admin. */
export async function createChapter(
  admin: TestUser,
  overrides: { name?: string; description?: string; location?: string } = {},
): Promise<{ id: string; slug: string }> {
  const res = await request(app)
    .post("/api/chapters")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({
      name: overrides.name ?? `Chapter ${randomUUID().slice(0, 8)}`,
      description: overrides.description ?? "A local chapter for testing.",
      ...(overrides.location ? { location: overrides.location } : {}),
    });
  if (res.status !== 201) {
    throw new Error(`createChapter failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { id: res.body.chapter.id, slug: res.body.chapter.slug };
}

/** Admin-add a user to a chapter (lands active immediately). */
export async function addChapterMember(
  admin: TestUser,
  chapterSlug: string,
  userId: string,
): Promise<void> {
  const res = await request(app)
    .post(`/api/chapters/${chapterSlug}/members`)
    .set("Authorization", `Bearer ${admin.token}`)
    .send({ userId });
  if (res.status !== 201) {
    throw new Error(`addChapterMember failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
}

/** Create a thread through the API as the given (verified) user. */
export async function createThread(
  user: TestUser,
  overrides: { title?: string; body?: string; tagIds?: string[]; chapterId?: string } = {},
): Promise<string> {
  const res = await request(app)
    .post("/api/threads")
    .set("Authorization", `Bearer ${user.token}`)
    .send({
      title: overrides.title ?? `Thread ${randomUUID().slice(0, 8)}`,
      body: overrides.body ?? "What is justice, really?",
      tagIds: overrides.tagIds ?? [],
      ...(overrides.chapterId ? { chapterId: overrides.chapterId } : {}),
    });
  if (res.status !== 201) {
    throw new Error(`createThread failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.thread.id;
}

/** Reply through the API. parentId null = top-level reply. */
export async function createPost(
  user: TestUser,
  threadId: string,
  body: string,
  parentId: string | null = null,
): Promise<string> {
  const res = await request(app)
    .post("/api/posts")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ threadId, body, parentId });
  if (res.status !== 201) {
    throw new Error(`createPost failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.post.id;
}
