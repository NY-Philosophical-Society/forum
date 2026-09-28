import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { parse } from "dotenv";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "apps/web");
const env = { ...process.env, ...parse(readFileSync(path.join(webDir, ".env.local"))) };
const appOrigin = new URL(process.argv[2] ?? "http://127.0.0.1:3100");
for (const value of [appOrigin, new URL(env.SUPABASE_URL), new URL(env.DIRECT_DATABASE_URL ?? env.DATABASE_URL)]) {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(value.hostname)) {
    throw new Error("Forum verification runs only against loopback services.");
  }
}
for (const name of ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]) {
  if (!env[name]) throw new Error(`${name} is required for local verification and exact cleanup.`);
}

const git = (...args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Cannot identify the checkout.");
  return result.stdout.trim();
};
const files = git("ls-files", "--cached", "--others", "--exclude-standard")
  .split("\n")
  .filter(file => /^(apps|packages|scripts|supabase)\//.test(file) || /^(package(?:-lock)?\.json|tsconfig\.json)$/.test(file))
  .sort();
const fingerprint = createHash("sha256");
for (const file of files) {
  if (/(^|\/)\.env(?:\.|$)/.test(file) || /(^|\/)signing_keys\.json$/.test(file)) continue;
  fingerprint.update(file + "\0");
  try { fingerprint.update(readFileSync(path.join(root, file))); }
  catch (error) { if (error.code === "ENOENT") fingerprint.update("<deleted>"); else throw error; }
}

const startedAt = new Date().toISOString();
const runId = startedAt.replace(/[:.]/g, "-") + "-forum-http-" + randomUUID().slice(0, 8);
const outputDir = path.join(root, ".verification", runId);
mkdirSync(outputDir, { recursive: true });
const report = {
  runId,
  suite: "forum-http",
  startedAt,
  finishedAt: null,
  status: "failed",
  checkout: {
    head: git("rev-parse", "HEAD"),
    branch: git("branch", "--show-current"),
    comparedTo: git("rev-parse", "origin/main"),
    dirty: Boolean(git("status", "--porcelain")),
    sourceSha256: fingerprint.digest("hex"),
  },
  runtime: { node: process.version, platform: process.platform },
  dependency: { app: "loopback HTTP", auth: "local Supabase", database: "local Postgres" },
  checks: [],
  cleanup: { contentRows: false, publicRows: false, authUsers: false },
  observations: {},
};
const record = (id, passed, status) => {
  report.checks.push({ id, status: passed ? "passed" : "failed" });
  if (status !== undefined) report.observations[id] = { httpStatus: status };
  if (!passed) throw new Error(id);
};
const request = async (pathname, { token, method = "GET", body } = {}) => {
  const response = await fetch(new URL(pathname, appOrigin), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  let data = {};
  try { data = await response.json(); } catch {}
  return { response, body: data };
};

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const authA = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, clientOptions);
const authB = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, clientOptions);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, clientOptions);
const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_DATABASE_URL ?? env.DATABASE_URL } } });
const authIds = [];
const publicIds = [];
let threadId = null;
let postId = null;
let failedAt = null;

try {
  const health = await request("/health");
  record("FORUM_HTTP_01_APP_HEALTH", health.response.ok, health.response.status);

  const password = "synthetic-local-forum-28!";
  const signup = async (client, suffix) => {
    const result = await client.auth.signUp({
      email: `codex-forum-${suffix}-${randomUUID()}@test.nyphilosophy.org`,
      password,
      options: { data: { display_name: `Synthetic Forum ${suffix}` } },
    });
    if (result.error || !result.data.session) throw new Error("FORUM_HTTP_SIGNUP");
    authIds.push(result.data.session.user.id);
    const me = await request("/api/auth/me", { token: result.data.session.access_token });
    if (me.response.status === 200) publicIds.push(result.data.session.user.id);
    return { token: result.data.session.access_token, id: result.data.session.user.id, me };
  };
  const author = await signup(authA, "author");
  const reader = await signup(authB, "reader");
  record("FORUM_HTTP_02_TWO_ACCOUNTS_READY", author.me.response.status === 200 && reader.me.response.status === 200);

  const initialFeed = await request("/api/threads?sort=new&limit=20&offset=0", { token: author.token });
  record("FORUM_HTTP_03_FEED_CONTRACT", initialFeed.response.status === 200 && Array.isArray(initialFeed.body.threads) && typeof initialFeed.body.hasMore === "boolean", initialFeed.response.status);

  const marker = randomUUID().slice(0, 8);
  const title = `Synthetic connection question ${marker}`;
  const body = `Synthetic context for the forum connection ${marker}.`;
  const created = await request("/api/threads", {
    token: author.token,
    method: "POST",
    body: { title, body, tagIds: [] },
  });
  threadId = created.body?.thread?.id ?? null;
  record("FORUM_HTTP_04_CREATE_THREAD", created.response.status === 201 && Boolean(threadId), created.response.status);

  const feedAfterCreate = await request("/api/threads?sort=new&limit=100&offset=0", { token: author.token });
  const feedThread = feedAfterCreate.body?.threads?.find?.((item) => item.id === threadId);
  record("FORUM_HTTP_05_FEED_READ_AFTER_WRITE", feedAfterCreate.response.status === 200 && feedThread?.title === title && feedThread?.postCount === 0, feedAfterCreate.response.status);

  const detail = await request(`/api/threads/${encodeURIComponent(threadId)}`, { token: author.token });
  record("FORUM_HTTP_06_DETAIL_PERSISTED", detail.response.status === 200 && detail.body?.thread?.body === body && detail.body?.thread?.previewOnly === false, detail.response.status);

  const replyBody = `Synthetic reply ${marker}.`;
  const reply = await request("/api/posts", {
    token: reader.token,
    method: "POST",
    body: { threadId, body: replyBody, parentId: null },
  });
  postId = reply.body?.post?.id ?? null;
  record("FORUM_HTTP_07_CREATE_REPLY", reply.response.status === 201 && Boolean(postId), reply.response.status);

  const like = await request(`/api/threads/${encodeURIComponent(threadId)}/like`, { token: reader.token, method: "POST", body: {} });
  record("FORUM_HTTP_08_TOGGLE_LIKE", like.response.status === 200 && like.body?.liked === true, like.response.status);

  const readerReload = await request(`/api/threads/${encodeURIComponent(threadId)}`, { token: reader.token });
  const authorReload = await request(`/api/threads/${encodeURIComponent(threadId)}`, { token: author.token });
  const replyPersisted = readerReload.body?.thread?.posts?.some?.((item) => item.id === postId && item.body === replyBody);
  record("FORUM_HTTP_09_RELOAD_PERSISTENCE", readerReload.response.status === 200 && replyPersisted && readerReload.body.thread.postCount === 1);
  record("FORUM_HTTP_10_ACCOUNT_LIKE_ISOLATION", readerReload.body?.thread?.myLiked === true && authorReload.body?.thread?.myLiked === false && authorReload.body?.thread?.likeCount === 1);

  const finalFeed = await request("/api/threads?sort=new&limit=100&offset=0", { token: author.token });
  const finalThread = finalFeed.body?.threads?.find?.((item) => item.id === threadId);
  record("FORUM_HTTP_11_FEED_CONVERGENCE", finalThread?.postCount === 1 && finalThread?.likeCount === 1, finalFeed.response.status);
  report.status = "passed";
} catch (error) {
  failedAt = typeof error?.message === "string" && error.message.startsWith("FORUM_HTTP_")
    ? error.message : report.checks.at(-1)?.id ?? "FORUM_HTTP_SETUP";
} finally {
  try {
    if (publicIds.length || threadId || postId) {
      await prisma.$transaction(async (tx) => {
        await tx.notification.deleteMany({ where: { OR: [
          ...(publicIds.length ? [{ actorId: { in: publicIds } }, { recipientId: { in: publicIds } }] : []),
          ...(threadId ? [{ threadId }] : []),
        ] } });
        await tx.mention.deleteMany({ where: { OR: [
          ...(publicIds.length ? [{ authorId: { in: publicIds } }, { userId: { in: publicIds } }] : []),
          ...(threadId ? [{ threadId }] : []),
        ] } });
        if (postId) await tx.postLike.deleteMany({ where: { postId } });
        if (threadId) {
          await tx.threadLike.deleteMany({ where: { threadId } });
          await tx.bookmark.deleteMany({ where: { threadId } });
          await tx.post.deleteMany({ where: { threadId } });
          await tx.thread.deleteMany({ where: { id: threadId } });
        }
        if (publicIds.length) await tx.user.deleteMany({ where: { id: { in: publicIds } } });
      });
    }
    report.cleanup.contentRows = true;
    report.cleanup.publicRows = true;
  } catch {}
  await prisma.$disconnect();
  let authCleanup = true;
  for (const id of authIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) authCleanup = false;
  }
  report.cleanup.authUsers = authCleanup;
  if (!Object.values(report.cleanup).every(Boolean)) {
    report.status = "failed";
    failedAt ??= "FORUM_HTTP_CLEANUP";
  }
}

report.finishedAt = new Date().toISOString();
report.reason = failedAt;
writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(report, null, 2) + "\n");
const passed = report.checks.filter((check) => check.status === "passed").length;
writeFileSync(path.join(outputDir, "summary.md"), [
  "# Verification: forum HTTP boundary", "",
  `- Status: **${report.status}**`,
  `- Started: ${report.startedAt}`,
  `- Commit: \`${report.checkout.head}\``,
  `- Working tree modified: ${report.checkout.dirty}`,
  `- Source fingerprint: \`${report.checkout.sourceSha256}\``,
  `- Checks: ${passed}/${report.checks.length} passed`,
  `- Synthetic cleanup: content rows=${report.cleanup.contentRows}, public rows=${report.cleanup.publicRows}, auth users=${report.cleanup.authUsers}`,
  ...(failedAt ? [`- Failed at: ${failedAt}`] : []), "",
  "This used two synthetic local accounts against the running app, local Supabase, and local Postgres.",
  "It exercised feed, create, detail, reply, like, reload, convergence, and account isolation.",
  "No tokens, passwords, emails, user IDs, content, payloads, or raw errors were persisted.", "",
].join("\n"));
console.log(JSON.stringify({ status: report.status, checks: report.checks, cleanup: report.cleanup, evidence: path.relative(root, outputDir) }, null, 2));
process.exitCode = report.status === "passed" ? 0 : 1;
