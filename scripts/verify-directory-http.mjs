import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { parse } from "dotenv";

// A disposable, loopback-only journey. It logs outcome metadata, never
// credentials, names, directory text, response bodies, or database records.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, ...parse(readFileSync(path.join(root, "apps/web/.env.local"))) };
const origin = new URL(process.argv[2] ?? "http://127.0.0.1:3100");
for (const address of [origin, new URL(env.SUPABASE_URL), new URL(env.DIRECT_DATABASE_URL ?? env.DATABASE_URL)]) {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(address.hostname)) {
    throw new Error("Directory verification requires loopback-only services.");
  }
}
for (const name of ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]) {
  if (!env[name]) throw new Error(`Missing local ${name} for verification and exact cleanup.`);
}

function git(...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Cannot identify the local checkout.");
  return result.stdout.trim();
}
const fingerprint = createHash("sha256");
for (const file of git("ls-files", "--cached", "--others", "--exclude-standard").split("\n").filter((file) =>
  /^(apps|packages|scripts|supabase)\//.test(file) || /^(package(?:-lock)?\.json|tsconfig\.json)$/.test(file)).sort()) {
  if (/(^|\/)\.env(?:\.|$)/.test(file) || /(^|\/)signing_keys\.json$/.test(file)) continue;
  fingerprint.update(file + "\0");
  try { fingerprint.update(readFileSync(path.join(root, file))); }
  catch (error) { if (error.code === "ENOENT") fingerprint.update("<deleted>"); else throw error; }
}
const startedAt = new Date().toISOString();
const outputDir = path.join(root, ".verification", `${startedAt.replace(/[:.]/g, "-")}-directory-http-${randomUUID().slice(0, 8)}`);
mkdirSync(outputDir, { recursive: true });
const report = {
  suite: "directory-http", startedAt, finishedAt: null, status: "failed", failedAt: null,
  checkout: { head: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"), dirty: Boolean(git("status", "--porcelain")), sourceSha256: fingerprint.digest("hex") },
  dependency: { app: "loopback HTTP", auth: "local Supabase", database: "local Postgres" },
  checks: [], cleanup: { publicRows: false, authUsers: false },
};
function record(id, condition) {
  report.checks.push({ id, status: condition ? "passed" : "failed" });
  if (!condition) throw new Error(id);
}
async function request(route, { token, method = "GET", body } = {}) {
  const response = await fetch(new URL(route, origin), {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  let data = {};
  try { data = await response.json(); } catch {}
  return { status: response.status, data };
}
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, clientOptions);
const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_DATABASE_URL ?? env.DATABASE_URL } } });
const authIds = [];
const publicIds = [];

try {
  const health = await request("/health");
  record("DIRECTORY_HTTP_01_APP_HEALTH", health.status === 200);

  async function signup(label) {
    const auth = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, clientOptions);
    const result = await auth.auth.signUp({
      email: `codex-directory-${label}-${randomUUID()}@test.nyphilosophy.org`,
      password: "synthetic-local-directory-28!",
      options: { data: { display_name: `Synthetic Directory ${label} ${randomUUID().slice(0, 6)}` } },
    });
    if (result.error || !result.data.session) throw new Error("DIRECTORY_HTTP_SIGNUP");
    authIds.push(result.data.session.user.id);
    const token = result.data.session.access_token;
    const me = await request("/api/auth/me", { token });
    if (me.status === 200) publicIds.push(result.data.session.user.id);
    return { token, id: result.data.session.user.id, displayName: me.data?.user?.displayName, status: me.status };
  }
  const viewer = await signup("viewer");
  const listed = await signup("listed");
  const free = await signup("free");
  record("DIRECTORY_HTTP_02_THREE_LOCAL_ACCOUNTS", [viewer, listed, free].every((account) => account.status === 200));

  const denied = await request("/api/directory", { token: free.token });
  record("DIRECTORY_HTTP_03_FREE_ACCOUNT_DENIED", denied.status === 403);

  for (const account of [viewer, listed]) {
    const redeemed = await request("/api/auth/redeem-code", { token: account.token, method: "POST", body: { code: "WISDOMKEY" } });
    record(account === viewer ? "DIRECTORY_HTTP_04_VIEWER_MEMBER" : "DIRECTORY_HTTP_05_LISTED_MEMBER", redeemed.status === 200 && redeemed.data?.user?.isSupporter === true);
  }
  const search = encodeURIComponent(listed.displayName);
  const before = await request(`/api/directory?q=${search}`, { token: viewer.token });
  record("DIRECTORY_HTTP_06_DEFAULT_PRIVATE", before.status === 200 && !before.data?.entries?.some?.((entry) => entry.user.id === listed.id));

  const optIn = await request("/api/users/me", { token: listed.token, method: "PATCH", body: { directoryVisible: true, directoryBio: "Synthetic interest in ethics", openToPartners: true } });
  record("DIRECTORY_HTTP_07_OPT_IN_SAVED", optIn.status === 200);
  const visible = await request(`/api/directory?q=${search}`, { token: viewer.token });
  record("DIRECTORY_HTTP_08_SEARCH_READ_AFTER_WRITE", visible.status === 200 && visible.data?.entries?.some?.((entry) => entry.user.id === listed.id && entry.directoryBio === "Synthetic interest in ethics"));
  const partners = await request(`/api/directory?q=${search}&partners=1`, { token: viewer.token });
  record("DIRECTORY_HTTP_09_PARTNER_FILTER", partners.status === 200 && partners.data?.entries?.some?.((entry) => entry.user.id === listed.id && entry.openToPartners === true));

  const optOut = await request("/api/users/me", { token: listed.token, method: "PATCH", body: { directoryVisible: false } });
  record("DIRECTORY_HTTP_10_OPT_OUT_SAVED", optOut.status === 200);
  const after = await request(`/api/directory?q=${search}`, { token: viewer.token });
  record("DIRECTORY_HTTP_11_OPT_OUT_REMOVED", after.status === 200 && !after.data?.entries?.some?.((entry) => entry.user.id === listed.id));
  report.status = "passed";
} catch (error) {
  report.failedAt = typeof error?.message === "string" && error.message.startsWith("DIRECTORY_HTTP_") ? error.message : report.checks.at(-1)?.id ?? "DIRECTORY_HTTP_SETUP";
} finally {
  try {
    if (publicIds.length) await prisma.user.deleteMany({ where: { id: { in: publicIds } } });
    report.cleanup.publicRows = true;
  } catch {}
  await prisma.$disconnect();
  let authCleanup = true;
  for (const id of authIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) authCleanup = false;
  }
  report.cleanup.authUsers = authCleanup;
  if (!report.cleanup.publicRows || !report.cleanup.authUsers) {
    report.status = "failed";
    report.failedAt ??= "DIRECTORY_HTTP_CLEANUP";
  }
}

report.finishedAt = new Date().toISOString();
writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(path.join(outputDir, "summary.md"), [
  "# Verification: directory HTTP boundary", "",
  `- Status: **${report.status}**`,
  `- Started: ${report.startedAt}`,
  `- Source fingerprint: \`${report.checkout.sourceSha256}\``,
  `- Checks: ${report.checks.filter((check) => check.status === "passed").length}/${report.checks.length} passed`,
  `- Synthetic cleanup: public rows=${report.cleanup.publicRows}, Auth users=${report.cleanup.authUsers}`,
  ...(report.failedAt ? [`- Failed at: ${report.failedAt}`] : []), "",
  "Three synthetic local accounts exercised membership denial, opt-in, search, partner filtering, and opt-out.",
  "No tokens, passwords, emails, names, user IDs, directory text, payloads, or raw errors were persisted.", "",
].join("\n"));
console.log(JSON.stringify({ status: report.status, checks: report.checks, cleanup: report.cleanup, evidence: path.relative(root, outputDir) }, null, 2));
process.exitCode = report.status === "passed" ? 0 : 1;
