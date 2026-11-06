import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunStore, WorkflowEngine } from "../src/core/index.js";
import type { SavedProfile, TestRunOutcome, TestSelection } from "../src/data/index.js";
import { checkDebugFix, DEBUG_REPORT_ARTIFACT, debugWorkflow, roleOf, type DebugDeps, type RunAttempt } from "../src/workflows/index.js";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const SPEC = `import { test, expect } from '@playwright/test';

test('TC-ABC-1-001 saves a request for <PERSON_1>', async ({ page }) => {
  await page.goto('/requests');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
});
`;
const FIXED = SPEC.replace("name: 'Save' }", "name: 'Save draft' }");
const TITLE = "TC-ABC-1-001 saves a request for <PERSON_1>";
const SAVED = { version: 1, folder: ".", kind: "playwright", commands: { test: ["npx", "playwright", "test"] }, reviewedAt: "2026-11-06T00:00:00.000Z" } as unknown as SavedProfile;

const result = (outcome: "passed" | "failed" | "flaky" | "skipped", message = "TimeoutError: locator.click: Timeout 5000ms exceeded.\n  - waiting for getByRole('button', { name: 'Save' })", title = TITLE) => ({
  title,
  tags: [],
  file: "tests/a.spec.ts",
  line: 3,
  outcome,
  runs: 1,
  failedRuns: outcome === "passed" || outcome === "skipped" ? 0 : 1,
  ...(outcome === "failed" || outcome === "flaky" ? { failure: { message, at: { file: "tests/a.spec.ts", line: 5 }, snapshot: '- button "Save draft"' } } : {}),
});
const done = (...tests: ReturnType<typeof result>[]): TestRunOutcome => ({ status: "done", exitCode: tests.some((t) => t.outcome === "failed") ? 1 : 0, timedOut: false, durationMs: 5, errors: [], tests });

describe("debug workflow (S3-3)", () => {
  let dir: string;
  let runs: RunStore;
  let files: Map<string, string>;
  let outcomes: TestRunOutcome[];
  const ran: TestSelection[] = [];
  const edits: Array<ReadonlyArray<{ path: string; content: string; sha256: string }>> = [];
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-debug-"));
    runs = new RunStore(dir);
    files = new Map([["tests/a.spec.ts", SPEC]]);
    outcomes = [];
    ran.length = 0;
    edits.length = 0;
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const fake = (over: Partial<DebugDeps["data"]> = {}): DebugDeps["data"] => ({
    savedProfile: async () => SAVED,
    maskTexts: async (_r, texts) => texts.map((t) => t.replaceAll("jane.doe@example.com", "<EMAIL_1>")),
    testRunReadiness: async () => ({ ready: true }),
    selectTests: async (_r, _f, s) => {
      if (!s.files && !s.grep && !s.tag && !s.failedIn) throw new Error("pick the tests");
      return { command: ["npx", "playwright", "test"], args: ["--reporter=json", ...(s.grep ? [`--grep=${s.grep}`] : []), ...(s.files ?? [])] };
    },
    runTests: async (_r, _t, _f, s) => {
      ran.push(s);
      const next = outcomes.shift();
      if (!next) throw new Error("no more runs planned");
      return next;
    },
    readTestFiles: async (_r, _t, _f, paths) =>
      paths.map((p) => {
        const content = files.get(p);
        if (content === undefined) throw new Error(`${p} isn't in the repo`);
        return { path: p, content, sha256: sha(content), gitBlob: `blob-${sha(content).slice(0, 8)}` };
      }),
    editTestFiles: async (_r, _t, _f, e) => {
      edits.push(e);
      for (const x of e) {
        if (sha(files.get(x.path)!) !== x.sha256) throw new Error(`${x.path} changed since it was read`);
        files.set(x.path, x.content);
      }
      return { status: "done", written: e.map((x) => ({ path: x.path, sha256: sha(x.content) })) };
    },
    ...over,
  });
  const engine = (data = fake()) => new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(debugWorkflow({ data, runs }));
  const report = async (runId: string) => (await runs.readArtifact(runId, DEBUG_REPORT_ARTIFACT))!.data;
  const FIX = { failures: [{ test: TITLE, kind: "selector", reason: "the button is now called Save draft" }], files: [{ path: "tests/a.spec.ts", content: FIXED }] };

  it("runs, proposes a selector fix as a diff, writes it on the person's own yes, then proves it stable", async () => {
    const e = engine();
    const first = await e.start("debug", { files: ["tests/a.spec.ts"], stabilityRuns: 2 });
    expect(first.stepId).toBe("run");
    // Running the person's suite takes their own yes.
    await expect(e.submit(first.runId, "run", { run: true })).rejects.toMatchObject({ code: "NEEDS_PERSON" });
    outcomes.push(done(result("failed"), result("skipped", "", "TC-ABC-1-009 later")));
    const fix = (await e.submit(first.runId, "run", { run: true }, { byPerson: true })).next;
    expect(fix.stepId).toBe("fix-1");
    const shown = fix.context;
    expect(shown).toContain("locator.click: Timeout");
    expect(shown).toContain("### tests/a.spec.ts (spec)");
    expect(shown).toContain("name: 'Save' }");
    // The skipped test isn't a failure to classify.
    expect(shown).not.toContain("TC-ABC-1-009");

    const apply = (await e.submit(first.runId, "fix-1", FIX)).next;
    expect(apply.stepId).toBe("apply-1");
    expect(apply.context).toContain("+  await page.getByRole('button', { name: 'Save draft' }).click();");
    expect((await report(first.runId)).status).toBe("proposed");
    expect(edits).toEqual([]);
    expect((await e.approval(first.runId, "apply-1"))?.question).toMatch(/Write this change to 1 file\(s\) of your repo \(\+1 −1 lines\): tests\/a\.spec\.ts\?/);
    await expect(e.submit(first.runId, "apply-1", { apply: true })).rejects.toMatchObject({ code: "NEEDS_PERSON" });

    outcomes.push(done(result("passed")), done({ ...result("passed"), runs: 2 }));
    expect((await e.submit(first.runId, "apply-1", { apply: true }, { byPerson: true })).next.kind).toBe("done");
    expect(edits).toEqual([[{ path: "tests/a.spec.ts", content: FIXED, sha256: sha(SPEC) }]]);
    expect(ran.map((s) => s.repeatEach)).toEqual([undefined, undefined, 2]);
    const r = await report(first.runId);
    expect(r).toMatchObject({ status: "passed", rounds: 1, changes: [{ round: 1, path: "tests/a.spec.ts", sha256: sha(FIXED), gitBlob: `blob-${sha(SPEC).slice(0, 8)}`, added: 1, removed: 1 }] });
    expect(r.proposal).toBeUndefined();
    expect(r.attempts.map((a) => a.kind)).toEqual(["run", "run", "stability"]);
    expect(await readFile(join(dir, first.runId, "debug-report.md"), "utf8")).toContain("round 1: tests/a.spec.ts (+1 −1)");
  });

  it("reports a defect or a broken environment, and changes nothing for it", async () => {
    for (const kind of ["defect", "environment"] as const) {
      const e = engine();
      const first = await e.start("debug", { grep: "jane.doe@example.com" });
      outcomes.push(done(result("failed", 'expect(received).toHaveText(expected)\nExpected: "Saved"\nReceived: "Error"')));
      await e.submit(first.runId, "run", { run: true }, { byPerson: true });
      // A fix sent with a stop is refused: a defect is reported, not fixed in the test.
      const both = await e.submit(first.runId, "fix-1", { ...FIX, failures: [{ test: TITLE, kind, reason: "the app says Error" }] });
      expect(both.status).toBe("rejected");
      expect(JSON.stringify(both)).toMatch(/never fixed in the test/);
      expect((await e.submit(first.runId, "fix-1", { failures: [{ test: TITLE, kind, reason: "the app says Error" }] })).next.kind).toBe("done");
      const r = await report(first.runId);
      expect(r).toMatchObject({ status: kind, stoppedOn: [{ kind }], changes: [], selection: { grep: "<EMAIL_1>" } });
      expect(JSON.stringify(r)).not.toContain("jane");
    }
    expect(edits).toEqual([]);
    expect(files.get("tests/a.spec.ts")).toBe(SPEC);
  });

  it("keeps a declined change as a diff, and writes nothing", async () => {
    const e = engine();
    const first = await e.start("debug", { files: ["tests/a.spec.ts"] });
    outcomes.push(done(result("failed")));
    await e.submit(first.runId, "run", { run: true }, { byPerson: true });
    await e.submit(first.runId, "fix-1", FIX);
    expect((await e.submit(first.runId, "apply-1", { apply: false }, { byPerson: true })).next.kind).toBe("done");
    const r = await report(first.runId);
    expect(r.status).toBe("declined");
    expect(r.proposal?.diff).toContain("+  await page.getByRole('button', { name: 'Save draft' }).click();");
    expect(await readFile(join(dir, first.runId, "debug-report.md"), "utf8")).toContain("## The change you declined (round 1)");
    expect(edits).toEqual([]);
  });

  it("stops when every test passes at once, or none ran, or the person says no", async () => {
    const e = engine();
    const green = await e.start("debug", { tag: "@smoke" });
    outcomes.push(done(result("passed")));
    await e.submit(green.runId, "run", { run: true }, { byPerson: true });
    expect((await report(green.runId)).status).toBe("nothing-to-fix");

    const none = await e.start("debug", { tag: "@smoke" });
    outcomes.push({ status: "done", exitCode: 1, timedOut: false, durationMs: 1, tests: [], errors: ["Error: No tests found"] });
    await e.submit(none.runId, "run", { run: true }, { byPerson: true });
    expect((await report(none.runId)).status).toBe("no-tests");

    const no = await e.start("debug", { tag: "@smoke" });
    await e.submit(no.runId, "run", { run: false }, { byPerson: true });
    expect((await report(no.runId)).status).toBe("declined");
    expect(ran).toHaveLength(2);

    // A selection the suite can't take stops at the start.
    await expect(e.start("debug", { project: "chromium" })).rejects.toThrow();
    await expect(e.start("debug", { grep: "a", tag: "@b" })).rejects.toThrow();
  });

  it("runs again for a flake, and gives up after the last round", async () => {
    const e = engine();
    const first = await e.start("debug", { files: ["tests/a.spec.ts"], fixRounds: 1 });
    outcomes.push(done(result("failed")), done(result("failed")));
    await e.submit(first.runId, "run", { run: true }, { byPerson: true });
    expect((await e.submit(first.runId, "fix-1", { failures: [{ test: TITLE, kind: "flake", reason: "it passed yesterday" }] })).next.kind).toBe("done");
    expect(await report(first.runId)).toMatchObject({ status: "gave-up", rounds: 1 });
    expect(ran).toHaveLength(2);
  });

  it("doesn't write a file that changed since it was read, and keeps the step open", async () => {
    const e = engine();
    const first = await e.start("debug", { files: ["tests/a.spec.ts"] });
    outcomes.push(done(result("failed")));
    await e.submit(first.runId, "run", { run: true }, { byPerson: true });
    await e.submit(first.runId, "fix-1", FIX);
    files.set("tests/a.spec.ts", `${SPEC}// edited by hand\n`);
    await expect(e.submit(first.runId, "apply-1", { apply: true }, { byPerson: true })).rejects.toThrow(/changed since it was read/);
    expect(files.get("tests/a.spec.ts")).toBe(`${SPEC}// edited by hand\n`);
    expect((await report(first.runId)).status).toBe("proposed");
  });
});

describe("what a debug fix may change", () => {
  const last: RunAttempt = { kind: "run", changed: [], classified: [], exitCode: 1, timedOut: false, durationMs: 1, errors: [], tests: [{ ...result("failed"), tags: [] }, { ...result("skipped", "", "TC-ABC-1-009 later"), tags: [] }] };
  const shown = [
    { path: "tests/a.spec.ts", content: SPEC },
    { path: "tests/features/a.feature", content: "Feature: A\n  Scenario: B\n    Given x\n" },
    { path: "tests/test-data/a.json", content: '{"name":"Ann"}' },
  ];
  const kinds = (out: Parameters<typeof checkDebugFix>[0]) => checkDebugFix(out, last, shown).map((x) => x.message);

  it("allows a locator change for a selector failure, nothing else", () => {
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/a.spec.ts", content: FIXED }] })).toEqual([]);
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/a.spec.ts", content: SPEC.replace("toHaveText('Saved')", "toHaveText('Error')") }] }).join()).toMatch(/changes more than locators and waits/);
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/a.spec.ts", content: SPEC.replace("saves a request", "saves") }] }).join()).toMatch(/title|changes more than locators/);
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/features/a.feature", content: "Feature: A\n" }] }).join()).toMatch(/never changes a feature file/);
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/other.spec.ts", content: SPEC }] }).join()).toMatch(/isn't one of the files shown/);
    expect(kinds({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/test-data/a.json", content: '{"name":"Bob"}' }] }).join()).toMatch(/only for a data failure/);
    // expect(locator).toBeVisible() checks the element itself: its texts stay, even through a variable.
    const shownCheck = `import { test, expect } from '@playwright/test';

test('${TITLE}', async ({ page }) => {
  const done = page.getByText('Saved');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Saved/)).toBeVisible();
  await expect(done).toBeVisible({ timeout: 5000 });
});
`;
    const visible = (content: string) => checkDebugFix({ failures: [{ test: TITLE, kind: "selector", reason: "r" }], files: [{ path: "tests/a.spec.ts", content }] }, last, [{ path: "tests/a.spec.ts", content: shownCheck }]).map((x) => x.message).join();
    expect(visible(shownCheck.replace("/Saved/", "/Error/"))).toMatch(/changes more than locators and waits/);
    expect(visible(shownCheck.replace("getByText('Saved')", "getByText('Error')"))).toMatch(/changes more than locators and waits/);
    expect(visible(shownCheck.replace("getByText(/Saved/)", "getByRole('status').getByText(/Saved/)"))).toMatch(/changes more than locators and waits/);
    expect(visible(shownCheck.replace("name: 'Save' }", "name: 'Save draft' }"))).toBe("");
    // Each failure classified once; the skipped test isn't one.
    expect(kinds({ failures: [], files: [] }).join()).toMatch(/say what kind of failure/);
    expect(kinds({ failures: [{ test: TITLE, kind: "flake", reason: "r" }, { test: "TC-ABC-1-009 later", kind: "flake", reason: "r" }], files: [] }).join()).toMatch(/isn't a failure of the last run/);
  });

  it("names each file's part from its path", () => {
    expect(["tests/a.spec.ts", "tests/a.feature", "test-data/a.json", "tests/steps/login.ts", "tests/step-definitions/x.ts", "src/pages/login-page.ts"].map(roleOf)).toEqual(["spec", "feature", "data", "steps", "steps", "page"]);
  });
});
