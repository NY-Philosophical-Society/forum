import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: "./src/server/test/global-setup.ts",
    setupFiles: ["./src/server/test/setup.ts"],
    // One shared throwaway Postgres database; files run one at a time (each in
    // a fresh fork, wiped by setup.ts) so they can't race each other on the
    // same tables.
    pool: "forks",
    fileParallelism: false,
    // Raised from 15s because authentication is a real network service now:
    // every fixture user costs a round trip to the local GoTrue, and a test
    // building four of them costs a dozen.
    //
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@nyps-forum/shared": fileURLToPath(new URL("../../packages/shared/src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/server/test/server-only.ts", import.meta.url)),
    },
  },
});
