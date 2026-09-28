import path from "node:path";
import { defineConfig } from "@playwright/test";

const web = __dirname;
const baseURL = "http://127.0.0.1:3109";

// A direct `playwright test` must not create accounts or discussions on a
// developer's ordinary database, let alone a hosted project.
const database = process.env.DATABASE_URL ?? "";
const auth = process.env.SUPABASE_URL ?? "";
if (!/^postgres(?:ql)?:\/\/[^/]+@(?:127\.0\.0\.1|localhost):54422\/nyps_browser_test_[a-f0-9]{12}(?:\?|$)/.test(database) ||
    !/^http:\/\/(?:127\.0\.0\.1|localhost):54421\/?$/.test(auth)) {
  throw new Error("Browser tests require the isolated local database and Auth stack created by scripts/run-browser-smoke.mjs.");
}

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: { baseURL, browserName: "chromium", actionTimeout: 10_000, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "node ../../node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3109",
    cwd: web,
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  outputDir: path.join(web, "test-results"),
});
