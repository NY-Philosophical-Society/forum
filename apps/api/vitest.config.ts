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
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@nyps-forum/shared": fileURLToPath(new URL("../../packages/shared/src", import.meta.url)),
    },
  },
});
