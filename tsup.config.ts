import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", "cli/bin": "src/cli/bin.ts" },
  format: ["esm"],
  target: "node20",
  platform: "node",
  dts: { entry: { index: "src/index.ts" } },
  sourcemap: true,
  clean: true,
  splitting: false,
  // Optional native dependency, loaded lazily at runtime; never bundle it.
  external: ["@napi-rs/keyring"],
});
