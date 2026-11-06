import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunStore, WorkflowEngine } from "../src/core/index.js";
import { ProfileError, type FrameworkProfile, type SavedProfile, type TypeDiagnostic } from "../src/data/index.js";
import { checkReview, FINDINGS_ARTIFACT, globRegExp, reviewWorkflow, type ReviewDeps, type ReviewOutput } from "../src/workflows/index.js";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const SPEC = `import { test, expect } from '@playwright/test';
import { RequestPage } from './pages/request-page';

test('submits the request of <PERSON_1>', async ({ page }) => {
  const request = new RequestPage(page);
  await request.open('<PERSON_1>');
  await page.waitForTimeout(2000);
  await request.submit();
  await expect(page.getByRole('status')).toHaveText('Submitted');
});
`;
const PAGE = `import { expect, type Page } from '@playwright/test';

export class RequestPage {
  constructor(private readonly page: Page) {}

  async open(name: string) {
    await this.page.goto('/requests');
    await this.page.getByRole('link', { name }).click();
  }

  async submit() {
    await this.page.locator('#submit').click();
    await expect(this.page.getByText('Saving')).toBeHidden();
  }
}
`;
const SAVED = { version: 1, folder: ".", kind: "playwright", commands: { test: ["npx", "playwright", "test"] }, reviewedAt: "2026-11-06T00:00:00.000Z" } as unknown as SavedProfile;
const PROFILE = { kind: "playwright", locatorRanking: ["getByRole", "locator"], pages: [{ name: "RequestPage" }], fixtures: [] } as unknown as FrameworkProfile;

const WAIT_FIX = { old: "  await page.waitForTimeout(2000);\n", new: "  await expect(page.getByRole('link', { name: '<PERSON_1>' })).toBeHidden();\n" };
const OUT: ReviewOutput = {
  findings: [
    { path: "tests/submit.spec.ts", line: 7, severity: "high", kind: "fixed-wait", problem: "waits two seconds for the page to change", why: "flaky on a slow org, slow on a fast one", fix: WAIT_FIX },
    { path: "tests/pages/request-page.ts", line: 13, severity: "medium", kind: "assertion-in-page-object", problem: "checks inside a page object", why: "a spec can't see what is checked" },
    { path: "tests/pages/request-page.ts", line: 12, severity: "low", kind: "locator", problem: "picks the button by CSS id", why: "the repo picks by role", fix: { old: "this.page.locator('#submit')", new: "this.page.getByRole('button', { name: 'Submit' })" } },
  ],
};

describe("review workflow (S3-4)", () => {
  let dir: string;
  let runs: RunStore;
  let files: Map<string, string>;
  let diagnostics: (f: ReadonlyArray<{ path: string; content: string }>) => TypeDiagnostic[];
  const edits: Array<ReadonlyArray<{ path: string; content: string; sha256: string }>> = [];
  const checked: string[][] = [];
  const prs: Array<{ files: ReadonlyArray<{ path: string; sha256: string; gitBlob?: string | undefined }>; draft: boolean; body: string }> = [];
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-review-"));
    runs = new RunStore(dir);
    files = new Map([
      ["tests/submit.spec.ts", SPEC],
      ["tests/pages/request-page.ts", PAGE],
      ["tests/auth.setup.ts", "export {};\n"],
      ["tests/notes.md", "# notes\n"],
    ]);
    diagnostics = () => [];
    edits.length = 0;
    checked.length = 0;
    prs.length = 0;
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const fake = (over: Partial<ReviewDeps["data"]> = {}): ReviewDeps["data"] => ({
    savedProfile: async () => SAVED,
    frameworkProfile: async () => PROFILE,
    frameworkFiles: async () => ({ files: [...files.keys()].sort(), links: [] }) as never,
    readTestFiles: async (_r, _t, _f, paths) =>
      paths.map((p) => {
        if (/auth/.test(p)) throw new ProfileError(`${p} is a sign-in file: Agent-QA never reads it`);
        const content = files.get(p);
        if (content === undefined) throw new ProfileError(`${p} isn't in the repo`);
        return { path: p, content, sha256: sha(content), gitBlob: `blob-${sha(content).slice(0, 8)}` };
      }),
    editTestFiles: async (_r, _t, _f, e) => {
      edits.push(e);
      for (const x of e) if (sha(files.get(x.path)!) !== x.sha256) throw new ProfileError(`${x.path} changed since Agent-QA read it: it is never overwritten. Nothing was changed.`);
      for (const x of e) files.set(x.path, x.content);
      return { status: "done", written: e.map((x) => ({ path: x.path, sha256: sha(x.content) })) };
    },
    typeCheckReadiness: async () => ({ ready: true }),
    typeCheck: async (_r, _t, f) => {
      checked.push(f.map((x) => x.path));
      return { status: "done", diagnostics: diagnostics(f) };
    },
    pullRequestReadiness: async () => ({ ready: false, reason: "pull requests are opened from CI only" }),
    openPullRequest: async (_r, _t, _f, pr) => {
      prs.push(pr);
      return { status: "done", number: 3, url: "https://github.com/o/r/pull/3", base: "main", branch: "agent-qa/x", draft: pr.draft, created: true };
    },
    ...over,
  });
  const engine = (data = fake()) => new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(reviewWorkflow({ data, runs }));
  const report = async (runId: string) => (await runs.readArtifact(runId, FINDINGS_ARTIFACT))!.data;

  it("reviews the files a glob matches, adds the scan's findings, and writes the fixes on the person's own yes", async () => {
    const e = engine();
    const first = await e.start("review", { paths: ["tests/**/*.ts"] });
    expect(first.stepId).toBe("review");
    expect(first.context).toContain("### tests/submit.spec.ts");
    expect(first.context).toContain("### tests/pages/request-page.ts");
    expect(first.context).toContain("- tests/submit.spec.ts:7: uses a fixed wait");
    expect(first.context).toMatch(/Not reviewed:\n- tests\/auth\.setup\.ts: .*sign-in file/);
    expect(first.context).not.toContain("notes.md");
    expect(first.context).toContain("locators it uses, most used first: getByRole, locator");

    const apply = (await e.submit(first.runId, "review", OUT)).next;
    expect(apply.stepId).toBe("apply");
    const r = await report(first.runId);
    expect(r).toMatchObject({ status: "proposed", counts: { critical: 0, high: 2, medium: 1, low: 1 }, left: [expect.stringContaining("tests/auth.setup.ts")] });
    expect(r.findings.map((f) => [f.id, f.source, f.path, f.line])).toEqual([
      ["F-1", "model", "tests/pages/request-page.ts", 12],
      ["F-2", "model", "tests/pages/request-page.ts", 13],
      ["F-3", "rule", "tests/submit.spec.ts", 7],
      ["F-4", "model", "tests/submit.spec.ts", 7],
    ]);
    expect(r.proposal!.findings).toEqual(["F-1", "F-4"]);
    const question = (await e.approval(first.runId, "apply"))?.question ?? "";
    expect(question).toMatch(/^Write the fixes for F-1, F-4 to 2 file\(s\) of your repo \(\+2 −2 lines\)/);
    expect(question).toContain("+    await this.page.getByRole('button', { name: 'Submit' }).click();");
    await expect(e.submit(first.runId, "apply", { apply: true })).rejects.toMatchObject({ code: "NEEDS_PERSON" });
    expect(edits).toEqual([]);

    expect((await e.submit(first.runId, "apply", { apply: true }, { byPerson: true })).next.kind).toBe("done");
    // Type-checked before and after, then written as shown.
    expect(checked).toHaveLength(2);
    expect(files.get("tests/submit.spec.ts")).toBe(SPEC.replace(WAIT_FIX.old, WAIT_FIX.new));
    const done = await report(first.runId);
    expect(done).toMatchObject({ status: "fixed", changes: [{ path: "tests/pages/request-page.ts", added: 1, removed: 1 }, { path: "tests/submit.spec.ts", added: 1, removed: 1 }] });
    expect(done.findings.filter((f) => f.applied).map((f) => f.id)).toEqual(["F-1", "F-4"]);
    expect(await readFile(join(dir, first.runId, "findings.md"), "utf8")).toContain("- **F-3** line 7, high, fixed-wait (rule)");
  });

  it("refuses fixes that don't apply, or that hide what a test checks", async () => {
    const shown = [{ path: "tests/submit.spec.ts", content: SPEC }];
    const one = (fix: { old: string; new: string }, path = "tests/submit.spec.ts", line = 7) => checkReview({ findings: [{ path, line, severity: "low", kind: "other", problem: "p", why: "w", fix }] }, shown).errors.map((x) => x.message).join();
    expect(one(WAIT_FIX)).toBe("");
    expect(one({ old: "waitForTimeout(3000)", new: "x" })).toMatch(/isn't in the file as shown/);
    expect(one({ old: "<PERSON_1>", new: "x" })).toMatch(/more than once/);
    expect(one(WAIT_FIX, "tests/other.spec.ts")).toMatch(/isn't one of the files shown/);
    expect(checkReview({ findings: [{ path: "tests/submit.spec.ts", line: 99, severity: "low", kind: "other", problem: "p", why: "w" }] }, shown).errors[0]!.message).toMatch(/has 11 lines/);
    expect(one({ old: "  await expect(page.getByRole('status')).toHaveText('Submitted');\n", new: "" })).toMatch(/removes a check/);
    expect(one({ old: "await expect(page.getByRole('status'))", new: "await expect.soft(page.getByRole('status'))" })).toMatch(/makes a check soft/);
    expect(one({ old: "await request.submit();", new: "await request.submit();\n  await page.waitForTimeout(500);" })).toMatch(/adds what the review reports \(uses a fixed wait/);
    expect(one({ old: "test('submits", new: "test.skip('submits" })).toMatch(/adds what the review reports|title/);
    expect(one({ old: "submits the request of", new: "sends the request of" })).toMatch(/changes a test's title/);
    expect(one({ old: "request.open('<PERSON_1>')", new: "request.open('<PERSON_2>')" })).toMatch(/holds <PERSON_2>, which the file doesn't/);
    expect(one({ old: "await request.submit();", new: "await request.submit(" })).toMatch(/doesn't parse/);
  });

  it("writes nothing when a fix adds type errors, when the person says no, or when a file changed since it was read", async () => {
    diagnostics = (f) => (f.some((x) => x.content.includes("getByRole('button'")) ? [{ file: "tests/pages/request-page.ts", line: 12, code: 2345, message: "No overload matches this call." }] : []);
    const e = engine();
    const typed = await e.start("review", { paths: ["tests/submit.spec.ts", "tests/pages/request-page.ts"] });
    await e.submit(typed.runId, "review", OUT);
    await e.submit(typed.runId, "apply", { apply: true }, { byPerson: true });
    expect(await report(typed.runId)).toMatchObject({ status: "type-errors", typeErrors: [{ file: "tests/pages/request-page.ts", line: 12 }] });
    expect(edits).toEqual([]);

    diagnostics = () => [];
    const no = await e.start("review", { paths: ["tests/submit.spec.ts"] });
    await e.submit(no.runId, "review", { findings: [OUT.findings[0]!] });
    await e.submit(no.runId, "apply", { apply: false });
    const declined = await report(no.runId);
    expect(declined.status).toBe("declined");
    expect(declined.proposal!.diff).toContain("+  await expect(page.getByRole('link', { name: '<PERSON_1>' })).toBeHidden();");
    expect(edits).toEqual([]);

    const stale = await e.start("review", { paths: ["tests/submit.spec.ts"] });
    await e.submit(stale.runId, "review", { findings: [OUT.findings[0]!] });
    files.set("tests/submit.spec.ts", `${SPEC}// edited\n`);
    await e.submit(stale.runId, "apply", { apply: true }, { byPerson: true });
    expect(await report(stale.runId)).toMatchObject({ status: "stale", reason: expect.stringContaining("changed since Agent-QA read it") });
    expect(files.get("tests/submit.spec.ts")).toBe(`${SPEC}// edited\n`);
  });

  it("records a review without fixes, and refuses paths that aren't reviewable code", async () => {
    const e = engine();
    const first = await e.start("review", { paths: ["tests/submit.spec.ts"] });
    expect((await e.submit(first.runId, "review", { findings: [OUT.findings[1]!].map((f) => ({ ...f, path: "tests/submit.spec.ts", line: 9 })) })).next.kind).toBe("done");
    expect(await report(first.runId)).toMatchObject({ status: "reviewed", counts: { high: 1, medium: 1 } });
    await expect(e.start("review", { paths: ["tests/notes.md"] })).rejects.toThrow(/isn't test code/);
    await expect(e.start("review", { paths: ["src/**/*.ts"] })).rejects.toThrow(/no test code matches/);
    // A file named outright must be readable: the review stops at its first step.
    const auth = await e.start("review", { paths: ["tests/auth.setup.ts"] }).catch((error: Error) => error);
    expect(String(auth)).toMatch(/sign-in file/);
  });

  it("in CI, opens the fixes as a draft pull request", async () => {
    const base = fake();
    const e = engine({ ...base, editTestFiles: async (...a) => ({ ...(await base.editTestFiles(...a)), pullRequest: true }), pullRequestReadiness: async () => ({ ready: true, repo: "o/r" }) });
    const first = await e.start("review", { paths: ["tests/submit.spec.ts"] });
    await e.submit(first.runId, "review", { findings: [OUT.findings[0]!] });
    const pr = (await e.submit(first.runId, "apply", { apply: true }, { byPerson: true })).next;
    expect(pr.stepId).toBe("pr");
    expect((await e.submit(first.runId, "pr", { open: true })).next.kind).toBe("done");
    expect(prs).toEqual([{ files: [{ path: "tests/submit.spec.ts", sha256: sha(SPEC.replace(WAIT_FIX.old, WAIT_FIX.new)), gitBlob: `blob-${sha(SPEC).slice(0, 8)}` }], title: "Agent-QA: review fixes in 1 test file(s)", body: expect.stringContaining("| F-2 | `tests/submit.spec.ts:7` | high |"), draft: true }]);
    expect((await report(first.runId)).pr).toMatchObject({ status: "opened", number: 3 });
  });
});

describe("review globs", () => {
  it("match within a folder with *, across folders with **", () => {
    const g = globRegExp("tests/**/*.spec.ts");
    expect(["tests/a.spec.ts", "tests/x/y/a.spec.ts"].every((p) => g.test(p))).toBe(true);
    expect(["src/a.spec.ts", "tests/a.spec.tsx", "tests/a_spec.ts"].some((p) => g.test(p))).toBe(false);
    expect(globRegExp("tests/*.ts").test("tests/x/a.ts")).toBe(false);
    expect(globRegExp("tests/a?.ts").test("tests/ab.ts")).toBe(true);
  });
});
