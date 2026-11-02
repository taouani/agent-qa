// Fallback build with the TypeScript compiler, for machines where esbuild (used by tsup)
// fails to read a parent folder. Writes the same entry points as `npm run build`:
// dist/index.js, dist/index.d.ts and dist/cli/bin.js.
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

rmSync("dist", { recursive: true, force: true });
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const result = spawnSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], { stdio: "inherit" });
process.exit(result.status ?? 1);
