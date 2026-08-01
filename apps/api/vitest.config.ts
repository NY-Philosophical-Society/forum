import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: "./src/test/global-setup.ts",
    setupFiles: ["./src/test/setup.ts"],
    // One shared throwaway Postgres database; files run one at a time (each in
    // a fresh fork, wiped by setup.ts) so they can't race each other on the
    // same tables.
    pool: "forks",
    fileParallelism: false,
    // Raised from 15s because authentication is a real network service now:
    // every fixture user costs a round trip to the local GoTrue, and a test
    // building four of them costs a dozen.
    //
    // Note this does NOT cure the occasional hung test (~1 run in 5). That is a
    // supertest issue, not a slow one: supertest opens an ephemeral server per
    // request and has no timeout, and roughly one request in a thousand never
    // completes. It reproduces on a bare Express app with none of this
    // codebase loaded, so no timeout value fixes it — raising this only changes
    // how long the run waits before giving up. See docs/TESTING.md.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@nyps-forum/shared": fileURLToPath(new URL("../../packages/shared/src", import.meta.url)),
    },
  },
});
