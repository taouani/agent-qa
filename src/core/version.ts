import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Walk up from this file to the package's own package.json (works from src and from any dist bundle). */
function readVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string; version?: string };
      if (pkg.name === "sf-agent-qa" && pkg.version) return pkg.version;
    } catch {
      // no package.json here; keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) return "0.0.0-unknown";
    dir = parent;
  }
}

/** Package version, read from package.json at runtime. */
export const VERSION: string = readVersion();
