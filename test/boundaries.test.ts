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
});
