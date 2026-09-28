import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

// Runs the original suites, not replicas. Persist only allow-listed result
// metadata: never console output, environment values, HTTP bodies, or traces.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suite = process.argv[2];
const selection = {
  shared: { cwd: "packages/shared", config: [] },
  client: { cwd: "apps/web", config: ["--config", "vitest.client.config.ts"] },
  api: { cwd: "apps/web", config: [] },
}[suite];
if (!selection) {
  console.error("Usage: node scripts/verify.mjs shared|client|api");
  process.exit(2);
}
const cwd = path.join(root, selection.cwd);
const git = (...args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Cannot identify the checkout");
  return result.stdout.trim();
};
const startedAt = new Date().toISOString();
const runId = startedAt.replace(/[:.]/g, "-") + "-" + suite + "-" + randomUUID().slice(0, 8);
const outputDir = path.join(root, ".verification", runId);
mkdirSync(outputDir, { recursive: true });
const files = git("ls-files", "--cached", "--others", "--exclude-standard")
  .split("\n")
  .filter(file => /^(apps|packages|scripts|supabase)\//.test(file) || /^(package(?:-lock)?\.json|tsconfig\.json)$/.test(file))
  .sort();
const hash = createHash("sha256");
for (const file of files) {
  // Fingerprint executable/test/config source, not evidence reports or prose.
  if (/(^|\/)\.env(?:\.|$)/.test(file) || /(^|\/)signing_keys\.json$/.test(file)) continue;
  hash.update(file + "\0");
  try { hash.update(readFileSync(path.join(root, file))); }
  catch (error) { if (error.code === "ENOENT") hash.update("<deleted>"); else throw error; }
}
const summary = {
  runId, suite, startedAt, finishedAt: null,
  command: "node scripts/verify.mjs " + suite,
  checkout: {
    head: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"),
    comparedTo: git("rev-parse", "origin/main"),
    dirty: Boolean(git("status", "--porcelain")),
    sourceSha256: hash.digest("hex"),
  },
  runtime: { node: process.version, platform: process.platform },
  status: "blocked", reason: null, exitCode: null, durationMs: 0,
  counts: null, tests: [],
};
let env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
if (suite === "api") {
  try { env = { ...env, ...parse(readFileSync(path.join(cwd, ".env.local"))) }; }
  catch { summary.reason = "Missing local API test configuration"; }
  if (!summary.reason) {
    try {
      for (const [name, protocols] of [
        ["SUPABASE_URL", ["http:", "https:"]],
        ["DATABASE_URL", ["postgres:", "postgresql:"]],
        ["DIRECT_DATABASE_URL", ["postgres:", "postgresql:"]],
      ]) {
        if (name === "DIRECT_DATABASE_URL" && !env[name]) continue;
        const url = new URL(env[name]);
        if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !protocols.includes(url.protocol)) throw new Error();
      }
      if (!env.SUPABASE_PUBLISHABLE_KEY) throw new Error();
    } catch { summary.reason = "API tests require loopback-only Supabase and database URLs plus the local publishable key"; }
  }
  if (!summary.reason) {
    try {
      const health = await fetch(new URL("/auth/v1/health", env.SUPABASE_URL), {
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(3000),
      });
      if (!health.ok) throw new Error();
    } catch { summary.reason = "Local Supabase Auth is unavailable; no API tests executed"; }
  }
}
const temporary = mkdtempSync(path.join(tmpdir(), "forum-verification-"));
try {
  if (!summary.reason) {
    const jsonFile = path.join(temporary, "vitest.json");
    const args = [
      path.join(root, "node_modules/vitest/vitest.mjs"), "run", ...selection.config,
      "--reporter=json", "--outputFile=" + jsonFile,
    ];
    summary.runner = ["vitest", "run", ...selection.config, "--reporter=json"];
    const start = performance.now();
    const result = spawnSync(process.execPath, args, {
      cwd, env, encoding: "utf8", timeout: 10 * 60 * 1000, maxBuffer: 20 * 1024 * 1024,
    });
    summary.durationMs = Math.round(performance.now() - start);
    summary.exitCode = result.status;
    try {
      const report = JSON.parse(readFileSync(jsonFile, "utf8"));
      summary.counts = {
        total: report.numTotalTests, passed: report.numPassedTests,
        failed: report.numFailedTests, pending: report.numPendingTests,
        todo: report.numTodoTests ?? 0,
      };
      summary.tests = (report.testResults ?? []).flatMap(file =>
        (file.assertionResults ?? []).map((test, index) => ({
          file: path.relative(root, file.name), caseNumber: index + 1,
          testId: createHash("sha256").update(path.relative(root, file.name) + "\\0" + test.fullName).digest("hex"),
          status: test.status, durationMs: test.duration ?? null,
        })),
      );
      summary.status = result.status === 0 && report.success && report.numTotalTests > 0
        ? (report.numPendingTests || report.numTodoTests ? "incomplete" : "passed")
        : "failed";
      if (summary.status !== "passed") summary.reason = "See per-test statuses; inspect failures locally before sharing diagnostics";
    } catch {
      summary.status = "blocked";
      summary.reason = result.error?.code === "ETIMEDOUT"
        ? "Runner exceeded the ten-minute limit"
        : "Runner did not produce test results; investigate setup locally";
    }
  }
} finally {
  // Exact temporary directory created by this invocation, never a repo path.
  rmSync(temporary, { recursive: true, force: true });
}
summary.finishedAt = new Date().toISOString();
writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(summary, null, 2) + "\n");
const lines = [
  "# Verification: " + suite, "",
  "- Status: **" + summary.status + "**",
  "- Started: " + summary.startedAt,
  "- Command: `" + summary.command + "`",
  "- Commit: `" + summary.checkout.head + "`",
  "- Working tree modified: " + summary.checkout.dirty,
  "- Source fingerprint: `" + summary.checkout.sourceSha256 + "`",
  "- Runtime: " + process.version + " on " + process.platform,
  "- Runner duration: " + summary.durationMs + " ms",
  "- Counts: " + (summary.counts ? JSON.stringify(summary.counts) : "No test results"),
  ...(summary.reason ? ["- Reason: " + summary.reason] : []),
  "",
  "See results.json for source files, case numbers, hashed test IDs, statuses, and durations.",
  "Test names, console output, payloads, environment values, and failure traces are intentionally omitted.",
  "This report establishes only the named suite; it is not proof of OAuth or production readiness.",
  "",
];
writeFileSync(path.join(outputDir, "summary.md"), lines.join("\n"));
console.log(JSON.stringify({ status: summary.status, counts: summary.counts, reason: summary.reason, evidence: path.relative(root, outputDir) }, null, 2));
process.exitCode = summary.status === "passed" ? 0 : summary.status === "blocked" ? 2 : 1;
