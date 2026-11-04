import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();

async function lint(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: file });
  return (result?.messages ?? []).map((m) => m.ruleId ?? m.message);
}

describe("module boundaries", () => {
  it("lets data import connectors", async () => {
    expect(await lint("src/data/x.ts", 'export * from "../connectors/index.js";\n')).toEqual([]);
  });

  it("forbids a front door importing connectors", async () => {
    expect(await lint("src/cli/x.ts", 'export * from "../connectors/index.js";\n')).toContain("boundaries/element-types");
    expect(await lint("src/mcp/x.ts", 'export * from "../connectors/index.js";\n')).toContain("boundaries/element-types");
  });

  it("forbids workflows bypassing the masked data service", async () => {
    expect(await lint("src/workflows/x.ts", 'export * from "../connectors/index.js";\n')).toContain("boundaries/element-types");
    expect(await lint("src/workflows/x.ts", 'export * from "../masking/index.js";\n')).toContain("boundaries/element-types");
  });

  it("keeps core free of other modules", async () => {
    expect(await lint("src/core/x.ts", 'export * from "../data/index.js";\n')).toContain("boundaries/element-types");
  });

  it("keeps the public entry point away from connectors and masking", async () => {
    expect(await lint("src/index.ts", 'export * from "./connectors/index.js";\n')).toContain("boundaries/element-types");
    expect(await lint("src/index.ts", 'export * from "./masking/index.js";\n')).toContain("boundaries/element-types");
  });

  it("checks .js files too", async () => {
    expect(await lint("src/cli/x.js", 'export * from "../connectors/index.js";\n')).toContain("boundaries/element-types");
  });

  it("checks .mts files too", async () => {
    expect(await lint("src/cli/x.mts", 'export * from "../connectors/index.js";\n')).toContain("boundaries/element-types");
  });

  it("lets only the browser connector load CommonJS from the user's repo", async () => {
    const code = 'import { createRequire } from "node:module";\nexport { createRequire };\n';
    expect(await lint("src/connectors/browser.ts", code)).toEqual([]);
    expect(await lint("src/connectors/other.ts", code)).toContain("@typescript-eslint/no-restricted-imports");
    expect(await lint("src/data/x.ts", code)).toContain("@typescript-eslint/no-restricted-imports");
    expect(await lint("src/connectors/browser.ts", 'import spawn from "cross-spawn";\nexport { spawn };\n')).toContain("@typescript-eslint/no-restricted-imports");
  });

  it("lets only the host command runner start processes", async () => {
    expect(await lint("src/connectors/host.ts", 'import spawn from "cross-spawn";\nexport { spawn };\n')).toEqual([]);
    expect(await lint("src/connectors/other.ts", 'import spawn from "cross-spawn";\nexport { spawn };\n')).toContain("@typescript-eslint/no-restricted-imports");
    expect(await lint("src/data/x.ts", 'import { spawn } from "node:child_process";\nexport { spawn };\n')).toContain("@typescript-eslint/no-restricted-imports");
    expect(await lint("src/connectors/host.ts", 'import { spawn } from "node:child_process";\nexport { spawn };\n')).toContain("@typescript-eslint/no-restricted-imports");
    // Deep and dynamic imports reach the same code.
    for (const path of ["cross-spawn/index.js", "cross-spawn/lib/parse.js"]) {
      expect(await lint("src/data/x.ts", `import s from "${path}";\nexport { s };\n`), path).toContain("@typescript-eslint/no-restricted-imports");
    }
    expect(await lint("src/data/x.ts", 'export const s = import("cross-spawn");\n')).toContain("no-restricted-syntax");
    expect(await lint("src/data/x.ts", 'export const s = import("cross-spawn/lib/parse.js");\n')).toContain("no-restricted-syntax");
  });

  it("forbids dynamic imports with computed paths", async () => {
    expect(await lint("src/cli/x.ts", "const p = 'x';\nexport const m = import(p);\n")).toContain("no-restricted-syntax");
  });
});
