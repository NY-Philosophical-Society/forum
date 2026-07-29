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

/** Create a thread through the API as the given (verified) user. */
export async function createThread(
  user: TestUser,
  overrides: { title?: string; body?: string; tagIds?: string[] } = {},
): Promise<string> {
  const res = await request(app)
    .post("/api/threads")
    .set("Authorization", `Bearer ${user.token}`)
    .send({
      title: overrides.title ?? `Thread ${randomUUID().slice(0, 8)}`,
      body: overrides.body ?? "What is justice, really?",
      tagIds: overrides.tagIds ?? [],
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
