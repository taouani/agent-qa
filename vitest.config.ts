import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    // Windows CI runners are several times slower at the file and process work many tests do (locks, temp
    // repos, fake hosts): the 5 s default failed different tests there, one at a time.
    ...(process.platform === "win32" ? { testTimeout: 20_000 } : {}),
  },
});
