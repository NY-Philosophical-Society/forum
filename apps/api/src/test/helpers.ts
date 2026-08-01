import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
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

/**
 * The suite's single point of contact with Supabase Auth. Everything else in
 * here — and every test — goes through the API, which is the point: the
 * authorization bugs live in middleware, so tests must exercise real tokens
 * against real routes rather than writing rows directly.
 */
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/**
 * Create an account through real Supabase Auth. Starts UNVERIFIED, and has no
 * local User row yet — the API creates that on the first authenticated request
 * (middleware/auth.ts resolveUser), exactly as it does for a real signup.
 */
export async function signup(prefix = "user"): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  const password = "correct-horse-battery";
  const displayName = `Test ${prefix} ${randomUUID().slice(0, 6)}`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error || !data.session) {
    throw new Error(`signup failed: ${error?.message ?? "no session returned"}`);
  }

  const token = data.session.access_token;
  // Force the local row into existence now, so tests can rely on the id and on
  // fixtures like promoteToAdmin that address the account directly.
  const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
  if (me.status !== 200) {
    throw new Error(`could not load the new account (${me.status}): ${JSON.stringify(me.body)}`);
  }

  return { token, id: me.body.user.id, email, password, displayName };
}

/**
 * A Supabase account the API has never seen — no local User row exists yet.
 * For testing the lazy-creation path itself; everything else wants signup().
 */
export async function signupUnseen(
  prefix = "unseen",
): Promise<{ token: string; email: string; displayName: string }> {
  const email = uniqueEmail(prefix);
  const displayName = `Test ${prefix} ${randomUUID().slice(0, 6)}`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: "correct-horse-battery",
    options: { data: { display_name: displayName } },
  });
  if (error || !data.session) {
    throw new Error(`signup failed: ${error?.message ?? "no session returned"}`);
  }
  return { token: data.session.access_token, email, displayName };
}

/**
 * A token minted right now. Account deletion requires a freshly-authenticated
 * session (see routes/users.ts), which is what a client gets after prompting
 * for the password again.
 */
export async function reauthenticate(user: TestUser): Promise<string> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data.session) {
    throw new Error(`re-authentication failed: ${error?.message ?? "no session"}`);
  }
  return data.session.access_token;
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
