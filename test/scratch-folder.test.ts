import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withScratchFolder } from "../src/connectors/index.js";
import { MemoryAuditSink, Policy, type WriteGrant } from "../src/core/index.js";

let outside: string;
beforeEach(async () => {
  outside = await mkdtemp(join(tmpdir(), "agent-qa-scratch-test-"));
  await mkdir(join(outside, "node_modules", "pkg"), { recursive: true });
  await writeFile(join(outside, "node_modules", "pkg", "index.js"), "module.exports = 1;\n");
});
afterEach(() => rm(outside, { recursive: true, force: true }));

function withGrant<T>(fn: (g: WriteGrant) => Promise<T>, mode: "ide" | "ci" = "ide") {
  const policy = new Policy({ rules: { xray: "ask", confluence: "ask", testCode: "allow", jira: "deny", commands: "ask" }, mode, audit: new MemoryAuditSink() });
  return policy.guard({ target: "testCode", summary: "t" }, fn);
}

const exists = (p: string) => lstat(p).then(() => true, () => false);

describe("withScratchFolder", () => {
  it("gives a real, empty folder with node_modules linked, then removes the folder and never what the link points to", async () => {
    let seen = "";
    await withGrant((g) =>
      withScratchFolder(
        g,
        async (dir) => {
          seen = dir;
          expect(await realpath(dir)).toBe(dir);
          expect(await readdir(dir)).toEqual(["node_modules"]);
          expect(await readFile(join(dir, "node_modules", "pkg", "index.js"), "utf8")).toBe("module.exports = 1;\n");
          await writeFile(join(dir, "a.txt"), "x");
        },
        join(outside, "node_modules"),
      ),
    );
    expect(await exists(seen)).toBe(false);
    expect(await readFile(join(outside, "node_modules", "pkg", "index.js"), "utf8")).toBe("module.exports = 1;\n");
  });

  it("removes the folder when the work throws", async () => {
    let seen = "";
    await expect(
      withGrant((g) =>
        withScratchFolder(g, async (dir) => {
          seen = dir;
          throw new Error("boom");
        }),
      ),
    ).rejects.toThrow("boom");
    expect(seen).not.toBe("");
    expect(await exists(seen)).toBe(false);
  });

  it("is never made from CI's checkout", async () => {
    let ran = false;
    await expect(
      withGrant(
        (g) =>
          withScratchFolder(g, async () => {
            ran = true;
          }),
        "ci",
      ),
    ).rejects.toThrow(/never made from CI/);
    expect(ran).toBe(false);
  });
});
