import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadTypeScript, TypeCheckError, typeCheckFiles } from "../src/connectors/index.js";
import { configSchema, MemoryAuditSink, Policy } from "../src/core/index.js";

const PAGE = `export class RequestPage {
  async fill(label: string, value: string): Promise<void> {}
}
`;
// An error the repo already has: not the generated code's to fix.
const BROKEN = "export const x: number = 'nope';\n";

describe("type check with the repo's TypeScript", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-tsc-"));
    await mkdir(join(dir, "src", "pages"), { recursive: true });
    await writeFile(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, target: "ES2020", module: "commonjs", resolveJsonModule: true, esModuleInterop: true, baseUrl: ".", paths: { "@pages/*": ["src/pages/*"] } }, include: ["src", "tests"] }));
    await writeFile(join(dir, "src", "pages", "request-page.ts"), PAGE);
    await writeFile(join(dir, "src", "broken.ts"), BROKEN);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("reports errors in the generated files only, with the repo's paths and settings", () => {
    const good = { path: "tests/a.steps.ts", content: "import { RequestPage } from '@pages/request-page';\nimport data from '../test-data/a.json';\nexport const run = (p: RequestPage) => p.fill('Reason', data.reason);\n" };
    const json = { path: "test-data/a.json", content: JSON.stringify({ reason: "Restock" }) };
    expect(typeCheckFiles(ts, dir, [good, json])).toEqual([]);
    const bad = { path: "tests/b.steps.ts", content: "import { RequestPage } from '@pages/request-page';\nexport const run = (p: RequestPage) => p.fill('Reason');\n" };
    expect(typeCheckFiles(ts, dir, [bad])).toEqual([{ file: "tests/b.steps.ts", line: 2, code: 2554, message: "Expected 2 arguments, but got 1." }]);
    // A generated file that only exists in memory is found through an import too.
    const helper = { path: "tests/support/h.ts", content: "export const h = (n: number) => n;\n" };
    const user = { path: "tests/c.steps.ts", content: "import { h } from './support/h';\nexport const y: string = h(1);\n" };
    expect(typeCheckFiles(ts, dir, [helper, user]).map((d) => [d.file, d.line, d.code])).toEqual([["tests/c.steps.ts", 2, 2322]]);
    expect(typeCheckFiles(ts, dir, [{ path: "tests/d.ts", content: "const = 1;\n" }])[0]).toMatchObject({ file: "tests/d.ts", line: 1 });
  });

  it("needs a tsconfig.json", async () => {
    await rm(join(dir, "tsconfig.json"));
    expect(() => typeCheckFiles(ts, dir, [{ path: "a.ts", content: "" }])).toThrow(TypeCheckError);
  });

  it("loads only the repo's own typescript, with a grant", async () => {
    const pkg = join(dir, "node_modules", "typescript");
    await mkdir(pkg, { recursive: true });
    await writeFile(join(pkg, "index.js"), "exports.marker = 'repo';\n");
    const policy = new Policy({ rules: configSchema.parse({ version: 1, policy: { writes: { commands: "allow" } } }).policy.writes, mode: "ide", audit: new MemoryAuditSink() });
    const load = (folder = dir) => policy.guard({ target: "commands", summary: "x" }, async (grant) => loadTypeScript(grant, folder, dir));
    await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "typescript", version: "5.6.2", main: "index.js" }));
    expect(await load()).toMatchObject({ status: "done", value: { version: "5.6.2", ts: { marker: "repo" } } });
    await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "typescript", version: "4.6.0", main: "index.js" }));
    await expect(load()).rejects.toThrow(/too old/);
    await rm(join(dir, "node_modules"), { recursive: true });
    // Not in the repo: a copy above it (here, Agent-QA's own) is never used.
    await expect(load()).rejects.toThrow(/isn't installed in the repo/);
    expect(() => loadTypeScript({} as never, dir)).toThrow();
  });
});
