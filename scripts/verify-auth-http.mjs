import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { parse } from "dotenv";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "apps/web");
const env = { ...process.env, ...parse(readFileSync(path.join(webDir, ".env.local"))) };
const apiOrigin = new URL(process.argv[2] ?? "http://127.0.0.1:3100");
for (const value of [apiOrigin, new URL(env.SUPABASE_URL), new URL(env.DIRECT_DATABASE_URL ?? env.DATABASE_URL)]) {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(value.hostname)) {
    throw new Error("Authentication verification runs only against loopback services.");
  }
}
for (const name of ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]) {
  if (!env[name]) throw new Error(`${name} is required for the local verification and cleanup.`);
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
const runId = startedAt.replace(/[:.]/g, "-") + "-auth-http-" + randomUUID().slice(0, 8);
const outputDir = path.join(root, ".verification", runId);
mkdirSync(outputDir, { recursive: true });
const report = {
  runId,
  suite: "auth-http",
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
  dependency: { app: "loopback HTTP", auth: "local Supabase" },
  checks: [],
  cleanup: { publicRows: false, authUsers: false },
  observations: {},
};
const record = (id, passed) => report.checks.push({ id, status: passed ? "passed" : "failed" });
const request = async (pathname, token) => {
  const response = await fetch(new URL(pathname, apiOrigin), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(10_000),
  });
  let body = {};
  try { body = await response.json(); } catch {}
  return { response, body };
};

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const authA = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, clientOptions);
const authB = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, clientOptions);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, clientOptions);
const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_DATABASE_URL ?? env.DATABASE_URL } } });
const createdIds = [];
let failedAt = null;

try {
  const health = await request("/health");
  record("AUTH_HTTP_01_APP_HEALTH", health.response.ok);
  if (!health.response.ok) throw new Error();

  const password = "synthetic-local-auth-28!";
  const emailA = `codex-auth-a-${randomUUID()}@test.nyphilosophy.org`;
  const signupA = await authA.auth.signUp({
    email: emailA,
    password,
    options: { data: { display_name: "Synthetic Auth A" } },
  });
  const sessionA = signupA.data.session;
  record("AUTH_HTTP_02_SIGNUP_SESSION", !signupA.error && Boolean(sessionA));
  if (signupA.error || !sessionA) throw new Error();
  createdIds.push(sessionA.user.id);

  const [encodedHeader, encodedPayload] = sessionA.access_token.split(".");
  const tokenHeader = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
  const tokenPayload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  const jwksResponse = await fetch(new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL), {
    signal: AbortSignal.timeout(5_000),
  });
  const jwks = jwksResponse.ok ? await jwksResponse.json() : { keys: [] };
  report.observations.token = {
    algorithm: tokenHeader.alg ?? null,
    issuerMatches: tokenPayload.iss === `${env.SUPABASE_URL}/auth/v1`,
    audienceMatches: tokenPayload.aud === "authenticated",
    signingKeyPublished: Array.isArray(jwks.keys) && jwks.keys.some(key => key.kid === tokenHeader.kid),
  };
  try {
    await jwtVerify(sessionA.access_token, createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)), {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
      algorithms: ["ES256", "RS256"],
    });
    report.observations.token.directVerification = true;
  } catch {
    report.observations.token.directVerification = false;
  }

  const firstMe = await request("/api/auth/me", sessionA.access_token);
  report.observations.firstAccountStatus = firstMe.response.status;
  report.observations.firstAccountErrorCategory = firstMe.body?.error === "Invalid or expired token"
    ? "invalid-token"
    : firstMe.body?.error === "User no longer exists" ? "gone" : firstMe.response.status === 401 ? "other-unauthorized" : null;
  const firstId = firstMe.body?.user?.id;
  record("AUTH_HTTP_03_LAZY_FORUM_ACCOUNT", firstMe.response.status === 200 && firstId === sessionA.user.id);
  if (firstMe.response.status !== 200 || firstId !== sessionA.user.id) throw new Error();

  await authA.auth.signOut();
  const loginA = await authA.auth.signInWithPassword({ email: emailA, password });
  const loginSession = loginA.data.session;
  const returningMe = loginSession ? await request("/api/auth/me", loginSession.access_token) : null;
  report.observations.returningAccountStatus = returningMe?.response.status ?? null;
  record("AUTH_HTTP_04_RETURNING_ACCOUNT_STABLE", !loginA.error && Boolean(loginSession) && returningMe?.body?.user?.id === firstId);
  if (loginA.error || !loginSession || returningMe?.body?.user?.id !== firstId) throw new Error();

  const emailB = `codex-auth-b-${randomUUID()}@test.nyphilosophy.org`;
  const signupB = await authB.auth.signUp({
    email: emailB,
    password,
    options: { data: { display_name: "Synthetic Auth B" } },
  });
  const sessionB = signupB.data.session;
  if (sessionB) createdIds.push(sessionB.user.id);
  const secondMe = sessionB ? await request("/api/auth/me", sessionB.access_token) : null;
  report.observations.secondAccountStatus = secondMe?.response.status ?? null;
  record("AUTH_HTTP_05_ACCOUNT_SWITCH_ISOLATED", !signupB.error && Boolean(sessionB) && secondMe?.body?.user?.id === sessionB?.user.id && secondMe?.body?.user?.id !== firstId);
  if (signupB.error || !sessionB || secondMe?.body?.user?.id !== sessionB.user.id || secondMe.body.user.id === firstId) throw new Error();

  const invalid = await request("/api/auth/me", "synthetic-invalid-token");
  report.observations.invalidSessionStatus = invalid.response.status;
  record("AUTH_HTTP_06_INVALID_SESSION_REJECTED", invalid.response.status === 401);
  if (invalid.response.status !== 401) throw new Error();

  report.status = "passed";
} catch {
  failedAt = report.checks.at(-1)?.id ?? "AUTH_HTTP_SETUP";
} finally {
  try {
    if (createdIds.length) await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
    report.cleanup.publicRows = true;
  } catch {}
  await prisma.$disconnect();
  let authCleanup = true;
  for (const id of createdIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) authCleanup = false;
  }
  report.cleanup.authUsers = authCleanup;
  if (!report.cleanup.publicRows || !report.cleanup.authUsers) {
    report.status = "failed";
    failedAt ??= "AUTH_HTTP_CLEANUP";
  }
}
report.finishedAt = new Date().toISOString();
report.reason = failedAt;
writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(report, null, 2) + "\n");
const passed = report.checks.filter(check => check.status === "passed").length;
writeFileSync(path.join(outputDir, "summary.md"), [
  "# Verification: authentication HTTP boundary", "",
  `- Status: **${report.status}**`,
  `- Started: ${report.startedAt}`,
  `- Commit: \`${report.checkout.head}\``,
  `- Working tree modified: ${report.checkout.dirty}`,
  `- Source fingerprint: \`${report.checkout.sourceSha256}\``,
  `- Checks: ${passed}/${report.checks.length} passed`,
  `- HTTP statuses: ${JSON.stringify(report.observations)}`,
  `- Synthetic cleanup: public rows=${report.cleanup.publicRows}, auth users=${report.cleanup.authUsers}`,
  ...(failedAt ? [`- Failed at: ${failedAt}`] : []),
  "",
  "This used synthetic local accounts against the built app and local Supabase.",
  "No tokens, passwords, emails, user IDs, payloads, or raw errors were persisted.",
  "This does not verify Google or any hosted provider.",
  "",
].join("\n"));
console.log(JSON.stringify({ status: report.status, checks: report.checks, cleanup: report.cleanup, evidence: path.relative(root, outputDir) }, null, 2));
process.exitCode = report.status === "passed" ? 0 : 1;
