import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Inject failures at fetch without a database or hosted credentials.
export default defineConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/lib/**/*.test.ts", "src/app/showcase/**/*.test.ts"],
  },
});
