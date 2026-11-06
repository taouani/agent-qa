import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunStore, WorkflowEngine } from "../src/core/index.js";
import { ProfileError, type FrameworkProfile, type SavedProfile } from "../src/data/index.js";
import { AUDIT_ARTIFACT, auditRoleOf, auditWorkflow, checkAudit, rankFindings, scoreAreas, type AuditDeps, type AuditOutput } from "../src/workflows/index.js";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const SPEC = (n: number) => `import { test, expect } from '@playwright/test';

test('submits request ${n} of <PERSON_1>', async ({ page }) => {
  await page.goto('/requests');
  await page.locator('#submit').click();
  await page.waitForTimeout(2000);
  await expect(page.getByRole('status')).toHaveText('Submitted');
});
`;
const PAGE = `export class RequestPage {
  constructor(private readonly page: Page) {}
  async submit() {
    await this.page.locator("xpath=//button[@id='submit']").click();
  }
}
`;
const SAVED = { version: 1, folder: ".", kind: "playwright", reviewedAt: "2026-11-06T00:00:00.000Z" } as unknown as SavedProfile;
const PROFILE = { kind: "playwright", locatorRanking: ["locator", "getByRole"], locators: { locator: 13, getByRole: 12 }, pages: [{ name: "RequestPage", file: "tests/pages/request-page.ts" }], fixtures: [{ name: "test", file: "tests/fixtures.ts" }], steps: [], features: [], testData: { faker: false } } as unknown as FrameworkProfile;

const OUT: AuditOutput = {
  findings: [
    {
      key: "inline-locators",
      area: "layering",
      title: "Specs pick elements themselves",
      severity: "medium",
      impact: "high",
      risk: "medium",
      effort: 12,
      occurrences: 12,
      problem: "Every spec calls page.locator() although a page object exists",
      good: "Specs call page-object methods; locators live in the page object",
      evidence: [{ path: "tests/s01.spec.ts", line: 5 }],
      dependsOn: ["locator-order"],
    },
    { key: "locator-order", area: "locators", title: "No locator order", severity: "low", impact: "medium", risk: "low", effort: 1, problem: "CSS ids and XPath next to roles", good: "One order: role, label, test id", evidence: [{ path: "tests/pages/request-page.ts", line: 4 }] },
  ],
  notAssessed: ["Whether tests share accounts: no sign-in code in the sample"],
};

describe("audit workflow (S3-5)", () => {
  let dir: string;
  let runs: RunStore;
  let files: Map<string, string>;
  const reads: string[] = [];
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-audit-"));
    runs = new RunStore(dir);
    files = new Map<string, string>([
      ...Array.from({ length: 12 }, (_, i) => [`tests/s${String(i + 1).padStart(2, "0")}.spec.ts`, SPEC(i + 1)] as [string, string]),
      ["tests/pages/request-page.ts", PAGE],
      ["tests/fixtures.ts", "import { test as base } from '@playwright/test';\nexport const test = base;\n"],
      ["tests/auth.setup.ts", "export {};\n"],
      ["test-data/requests.json", '{ "name": "<PERSON_1>" }\n'],
      ["playwright.config.ts", "export default {};\n"],
      ["package.json", "{}\n"],
      ["README.md", "# suite\n"],
    ]);
    reads.length = 0;
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const fake = (over: Partial<AuditDeps["data"]> = {}): AuditDeps["data"] => ({
    savedProfile: async () => SAVED,
    frameworkProfile: async () => PROFILE,
    frameworkFiles: async () => ({ files: [...files.keys()].sort(), links: [] }) as never,
    readTestFiles: async (_r, _t, _f, paths) =>
      paths.map((p) => {
        reads.push(p);
        if (/auth/.test(p)) throw new ProfileError(`${p} is a sign-in file: Agent-QA never reads it`);
        const content = files.get(p)!;
        return { path: p, content, sha256: sha(content), gitBlob: "b" };
      }),
    ...over,
  });
  const engine = (data = fake()) => new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(auditWorkflow({ data, runs }));

  it("inventories the suite, scans every file, shows a sample and ranks the findings", async () => {
    const e = engine();
    const first = await e.start("audit", {});
    expect(first.stepId).toBe("audit");
    const context = first.context ?? "";
    // Configs are never read; the sign-in file is refused and said so.
    expect(reads).not.toContain("playwright.config.ts");
    expect(reads).not.toContain("package.json");
    expect(context).toContain("Entry points (configs are never read): package.json, playwright.config.ts");
    expect(context).toMatch(/rule:fixed-wait: Fixed waits, 12 in 12 file\(s\)/);
    expect(context).toMatch(/rule:xpath: XPath locators, 1 in 1 file\(s\)/);
    expect(context).toContain("tests/auth.setup.ts: tests/auth.setup.ts is a sign-in file");
    // The sample: the fixture, the largest files, then ten specs drawn; the eleventh and twelfth spec left out.
    const shown = [...context.matchAll(/^### (\S+)\n\((\w+), ([^)]+)\)/gm)].map((m) => [m[1], m[2], m[3]]);
    expect(shown).toContainEqual(["tests/fixtures.ts", "fixture", "every fixture"]);
    expect(shown).toContainEqual(["test-data/requests.json", "data", "drawn"]);
    expect(shown.filter((s) => s[1] === "spec")).toHaveLength(12);

    expect((await e.submit(first.runId, "audit", OUT)).next.kind).toBe("done");
    const a = (await runs.readArtifact(first.runId, AUDIT_ARTIFACT))!.data;
    expect(a.findings.map((f) => [f.id, f.source, f.title, f.dependsOn])).toEqual([
      ["AF-001", "rule", "Fixed waits", []],
      ["AF-002", "model", "No locator order", []],
      ["AF-003", "model", "Specs pick elements themselves", ["AF-002"]],
      ["AF-004", "rule", "XPath locators", []],
    ]);
    expect(a.findings[0]).toMatchObject({ area: "waits", effort: 12, occurrences: 12 });
    expect(a.counts).toEqual({ critical: 0, high: 1, medium: 2, low: 1 });
    expect(a.scores.find((s) => s.area === "locators")).toEqual({ area: "locators", score: 8.5, findings: 2 });
    expect(a.inventory.roles.find((r) => r.role === "spec")).toEqual({ role: "spec", files: 12, lines: 12 * 8 });
    expect(a.inventory.unread).toEqual(["tests/auth.setup.ts: tests/auth.setup.ts is a sign-in file: Agent-QA never reads it"]);
    expect(a.notAssessed).toContain("Whether tests share accounts: no sign-in code in the sample");
    const md = await readFile(join(dir, first.runId, "audit.md"), "utf8");
    expect(md).toContain("### AF-003: Specs pick elements themselves");
    expect(md).toContain("after AF-002");
    expect(md).toContain("- Not read: tests/auth.setup.ts");
  });

  it("refuses evidence outside the sample, unknown or circular dependencies, and keys used twice", () => {
    const sample = [{ path: "a.spec.ts", content: "one\ntwo\n" }];
    const f = OUT.findings[1]!;
    const msgs = (o: AuditOutput) => checkAudit(o, sample, ["rule:fixed-wait"]).map((x) => x.message).join();
    const at = (path: string, line: number) => ({ ...f, evidence: [{ path, line }] });
    expect(msgs({ findings: [at("a.spec.ts", 2)] })).toBe("");
    expect(msgs({ findings: [at("b.spec.ts", 1)] })).toMatch(/b.spec.ts isn't in the sample/);
    expect(msgs({ findings: [at("a.spec.ts", 3)] })).toMatch(/has 2 lines/);
    expect(msgs({ findings: [at("a.spec.ts", 1), at("a.spec.ts", 1)] })).toMatch(/used twice/);
    expect(msgs({ findings: [{ ...at("a.spec.ts", 1), dependsOn: ["nope"] }] })).toMatch(/nope isn't a finding/);
    expect(msgs({ findings: [{ ...at("a.spec.ts", 1), dependsOn: ["rule:fixed-wait"] }] })).toBe("");
    expect(msgs({ findings: [{ ...at("a.spec.ts", 1), key: "x", dependsOn: ["y"] }, { ...at("a.spec.ts", 1), key: "y", dependsOn: ["x"] }] })).toMatch(/cycle \(x → y → x\)/);
  });

  it("ranks by impact, then risk, severity and effort, each finding after what it depends on", () => {
    const d = (key: string, impact: "high" | "medium" | "low", risk: "high" | "medium" | "low", dependsOn: string[] = []) => ({ key, source: "model" as const, area: "reuse" as const, title: key, severity: "medium" as const, impact, risk, effort: 1, problem: "p", good: "g", evidence: [], dependsOn });
    expect(rankFindings([d("a", "low", "low"), d("b", "high", "high"), d("c", "high", "low")]).map((f) => f.title)).toEqual(["c", "b", "a"]);
    // c ranks first but waits for a.
    expect(rankFindings([d("a", "low", "low"), d("c", "high", "low", ["a"])]).map((f) => [f.id, f.title, f.dependsOn])).toEqual([
      ["AF-001", "a", []],
      ["AF-002", "c", ["AF-001"]],
    ]);
    expect(scoreAreas([{ area: "waits", severity: "critical" }, { area: "waits", severity: "critical" }, { area: "waits", severity: "high" }]).find((s) => s.area === "waits")!.score).toBe(0);
  });

  it("gives each file a role from the profile, then its name", () => {
    expect(auditRoleOf("tests/pages/request-page.ts", PROFILE)).toBe("page");
    expect(auditRoleOf("src/pages/home.ts", undefined)).toBe("page");
    expect(auditRoleOf("tests/a.spec.ts", undefined)).toBe("spec");
    expect(auditRoleOf("tests/steps/login.ts", undefined)).toBe("steps");
    expect(auditRoleOf("tests/fixtures/index.ts", undefined)).toBe("fixture");
    expect(auditRoleOf("tests/utils/dates.ts", undefined)).toBe("code");
    expect(auditRoleOf("features/a.feature", undefined)).toBe("feature");
    expect(auditRoleOf("test-data/a.json", undefined)).toBe("data");
    expect(auditRoleOf("tsconfig.json", undefined)).toBe("config");
    expect(auditRoleOf("playwright.config.ts", undefined)).toBe("config");
    expect(auditRoleOf("types/global.d.ts", undefined)).toBe("config");
    expect(auditRoleOf(".env.local", undefined)).toBe("config");
  });
});
