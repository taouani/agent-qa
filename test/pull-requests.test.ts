import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GitHost, JiraCollection, JiraInput, JiraIssue, PullRequestDiff, PullRequestRef } from "../src/connectors/index.js";
import { configSchema, RunStore, WorkflowEngine } from "../src/core/index.js";
import { DataAccess, PULL_REQUEST_BYTES, PULL_REQUESTS_ARTIFACT } from "../src/data/index.js";
import { ConnectorError } from "../src/connectors/http.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";
import { documentWorkflow, REQUIREMENTS_ARTIFACT, requirementsWorkflow, testCasesWorkflow } from "../src/workflows/index.js";
import { inputFingerprint } from "../src/workflows/requirements/workflow.js";

const SITE = "https://acme.atlassian.net";
const adf = (text: string) => ({ text, mentions: [], links: [] });
const base = { id: "1", type: "Story", subtask: false, extraFields: {}, labels: [], components: [], fixVersions: [], children: [], links: [], remoteLinks: [], updated: "2026-11-01T10:00:00.000+0000", role: "root" as const, depth: 0 };
const ISSUES: JiraIssue[] = [
  { ...base, key: "ABC-1", summary: "Escalate old cases", description: adf("Escalate cases older than 2 days."), people: [{ role: "reporter", displayName: "Marguerite Quillfeather", accountId: "a1" }], children: ["ABC-2"] },
  { ...base, key: "ABC-2", type: "Sub-task", role: "child", depth: 1, parent: "ABC-1", summary: "Email the owner", description: adf("Email the case owner."), people: [] },
];
const jira = { collect: async (input: JiraInput): Promise<JiraCollection> => ({ input, issues: structuredClone(ISSUES), truncated: false, unreachable: [], extraFields: [] }) };

const ref = (id: number, title: string): PullRequestRef => ({ id, url: `https://github.com/acme/app/pull/${id}`, title, sourceBranch: `feature/ABC-1-for-marguerite`, targetBranch: "main", state: "merged", matchedIn: ["title"] });

class FakeHost implements Pick<GitHost, "platform" | "findPullRequests" | "pullRequestDiff"> {
  readonly platform = "github" as const;
  searches: string[] = [];
  diffs: number[] = [];
  big = false;
  async findPullRequests(key: string) {
    this.searches.push(key);
    // PR 7 names both issues.
    return key === "ABC-1" ? [ref(7, "ABC-1 ABC-2: escalate, asked by Marguerite Quillfeather"), ref(8, "ABC-1 fix")] : key === "ABC-2" ? [ref(7, "ABC-1 ABC-2: escalate, asked by Marguerite Quillfeather")] : [];
  }
  async pullRequestDiff(id: number): Promise<PullRequestDiff> {
    this.diffs.push(id);
    if (id === 8) return { files: [{ path: "src/big.ts", status: "modified", patch: this.big ? "+x\n".repeat(PULL_REQUEST_BYTES) : "+y" }, { path: "src/small.ts", status: "added", patch: "+z" }], truncated: false };
    return {
      files: [
        { path: "src/escalation.ts", status: "modified", patch: "@@ -1 +1 @@\n-const days = 3;\n+const days = 2; // asked by mq@example.com" },
        { path: "assets/logo.png", status: "added" },
      ],
      truncated: false,
    };
  }
}

let dir: string;
let runs: RunStore;
let host: FakeHost;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-qa-pr-"));
  runs = new RunStore(join(dir, "runs"));
  host = new FakeHost();
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function setup(over: { git?: boolean; reader?: Pick<GitHost, "platform" | "findPullRequests" | "pullRequestDiff"> } = {}) {
  const key = randomBytes(32);
  const config = configSchema.parse({ version: 1, atlassian: { site: SITE, email: "${env:E}", token: "${env:T}" } });
  const data = new DataAccess({
    root: dir,
    store: runs,
    config,
    vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => key } }),
    jira,
    confluence: { pages: async () => ({ pages: [], skipped: [] }) },
    ...(over.git === false ? {} : { gitReader: over.reader ?? host }),
  });
  const engine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId })
    .register(requirementsWorkflow({ data, runs }))
    .register(testCasesWorkflow({ data, runs }))
    .register(documentWorkflow({ data, runs }));
  return { data, engine };
}

const answer = (codeNotes?: Array<{ file: string; note: string }>) => ({
  issues: [
    { key: "ABC-1", quality: { score: 70, missing: [] }, openQuestions: ["Is it 2 or 3 days?"], inferredCriteria: ["A case older than 2 days is escalated"], ...(codeNotes ? { codeNotes } : {}) },
    { key: "ABC-2", quality: { score: 50, missing: ["acceptance-criteria"] }, openQuestions: [], inferredCriteria: ["The owner gets an email"] },
  ],
});

describe("pull requests in the requirements analysis (S4-6)", () => {
  it("reads each issue's pull requests once, masks them and keeps them in the run", async () => {
    const { data, engine } = setup();
    const { runId } = await engine.start("requirements", { key: "ABC-1", withPullRequests: true });
    const prs = await data.pullRequests(runId, ["ABC-2", "abc-1"]);
    expect(prs.keys).toEqual(["ABC-1", "ABC-2"]);
    expect(host.diffs).toEqual([7, 8]);
    const [seven] = prs.byIssue["ABC-1"]!;
    expect(seven).toMatchObject({ id: 7, url: "https://github.com/acme/app/pull/7", state: "merged", truncated: false });
    expect(seven!.title).toMatch(/^ABC-1 ABC-2: escalate, asked by <PERSON_\d+>$/);
    expect(seven!.files[0]!.patch).toContain("// asked by <EMAIL_1>");
    expect(seven!.files[1]).toEqual({ path: "assets/logo.png", status: "added" });
    expect(prs.byIssue["ABC-2"]![0]!.hash).toBe(seven!.hash);
    expect(prs.masked.byField["git.diff"]).toBe(2);
    const stored = await readFile(join(dir, "runs", runId, "pull-requests.json"), "utf8");
    for (const s of ["Marguerite", "Quillfeather", "mq@example.com"]) expect(stored).not.toContain(s);
    expect((await readFile(join(dir, "runs", runId, "pull-requests.md"), "utf8"))).toContain("- #8 ABC-1 fix (merged, 2 file(s))");
    // The same keys come from the run folder.
    await data.pullRequests(runId, ["ABC-1", "ABC-2"]);
    expect(host.searches).toEqual(["ABC-1", "ABC-2"]);
    expect((await runs.readArtifact(runId, PULL_REQUESTS_ARTIFACT))!.inputs.map((i) => i.ref)).toEqual(["github:pr/7", "github:pr/8"]);
  });

  it("caps each issue's diffs: past the cap a file keeps only its path", async () => {
    host.big = true;
    const { data, engine } = setup();
    const { runId } = await engine.start("requirements", { key: "ABC-1", withPullRequests: true });
    const eight = (await data.pullRequests(runId, ["ABC-1"])).byIssue["ABC-1"]!.find((p) => p.id === 8)!;
    expect(eight.truncated).toBe(true);
    expect(eight.files).toEqual([{ path: "src/big.ts", status: "modified" }, { path: "src/small.ts", status: "added", patch: "+z" }]);
  });

  it("caps the run's diffs over every issue, and says what a refused token needs", async () => {
    const patch = "+x\n".repeat(Math.floor(190_000 / 3));
    const reader = {
      platform: "github" as const,
      findPullRequests: async (key: string) => [ref(Number(key.slice(4)), `${key} change`)],
      pullRequestDiff: async (): Promise<PullRequestDiff> => ({ files: [{ path: "src/a.ts", status: "modified", patch }], truncated: false }),
    };
    const { data, engine } = setup({ reader });
    const { runId } = await engine.start("requirements", { key: "ABC-1", withPullRequests: true });
    const prs = await data.pullRequests(runId, ["ABC-1", "ABC-2", "ABC-3", "ABC-4"]);
    expect(["ABC-1", "ABC-2", "ABC-3", "ABC-4"].map((k) => prs.byIssue[k]![0]!.files[0]!.patch !== undefined)).toEqual([true, true, true, false]);
    expect(prs.byIssue["ABC-4"]![0]!.truncated).toBe(true);

    const refused = setup({ reader: { ...reader, findPullRequests: async () => { throw new ConnectorError("FORBIDDEN", "GitHub", "GET", "/search/issues", 403); } } });
    const run2 = await refused.engine.start("requirements", { key: "ABC-1", withPullRequests: true }).catch((e: unknown) => e);
    expect(String(run2)).toMatch(/GitHub refused git.token \(403\) when reading pull requests: it needs read access/);
  });

  it("gives the analysis the diffs and keeps code notes that name a changed file", async () => {
    const { engine } = setup();
    const first = await engine.start("requirements", { key: "ABC-1", withPullRequests: true });
    expect(first.context).toContain('"pullRequests"');
    expect(first.context).toContain("+const days = 2; // asked by <EMAIL_1>");
    expect(first.context).toContain("(left out: over the size cap, or not sent by the host)");
    expect(first.context).not.toContain("Quillfeather");

    const bad = await engine.submit(first.runId, "analyze", {
      issues: [answer([{ file: "src/nope.ts", note: "x" }, { file: "src/escalation.ts", note: "Ask <PERSON_9>" }]).issues[0], { ...answer().issues[1], codeNotes: [{ file: "src/escalation.ts", note: "y" }] }],
    });
    expect(bad.status).toBe("rejected");
    const errors = (bad as unknown as { errors: Array<{ path: string; message: string }> }).errors;
    expect(errors).toEqual(
      expect.arrayContaining([
        { path: "$.issues.0.codeNotes.0.file", message: "src/nope.ts isn't a file of ABC-1's pullRequests" },
        { path: "$.issues.0.codeNotes.1.note", message: expect.stringContaining("<PERSON_9>") },
      ]),
    );
    // ABC-2 shares PR 7, so its note is fine.
    expect(errors.some((e) => e.path.startsWith("$.issues.1"))).toBe(false);

    await engine.submit(first.runId, "analyze", answer([{ file: "src/escalation.ts", note: "The code escalates after 2 days, not 3" }]));
    const art = (await runs.readArtifact(first.runId, REQUIREMENTS_ARTIFACT))!;
    const r = art.data.requirements[0]!;
    expect(r.codeNotes).toEqual([{ file: "src/escalation.ts", note: "The code escalates after 2 days, not 3" }]);
    expect(r.pullRequests!.map((p) => p.id)).toEqual([7, 8]);
    expect(art.inputs.filter((i) => i.kind === "git-diff").map((i) => i.ref)).toEqual(["pr/7", "pr/8"]);
    const md = await readFile(join(dir, "runs", first.runId, "requirements.md"), "utf8");
    expect(md).toContain("### From the code\n\n- `src/escalation.ts`: The code escalates after 2 days, not 3");
    expect(md).toContain("- #7 ABC-1 ABC-2: escalate, asked by <PERSON_");
    // The pull requests change the input: an analysis without them isn't the same.
    expect(inputFingerprint(art.data.requirements)).not.toBe(inputFingerprint(art.data.requirements.map((r) => ({ ...r, pullRequests: undefined }))));
  });

  it("asks nothing of the git host without withPullRequests, and refuses it where it can't apply", async () => {
    const plain = setup();
    const first = await plain.engine.start("requirements", { key: "ABC-1" });
    expect(first.context).not.toContain("pullRequests\":");
    const rejected = await plain.engine.submit(first.runId, "analyze", answer([{ file: "src/escalation.ts", note: "x" }]));
    expect((rejected as unknown as { errors: Array<{ message: string }> }).errors[0]!.message).toBe("ABC-1 has no pullRequests in the context: leave codeNotes out");
    expect(host.searches).toEqual([]);

    const off = setup({ git: false });
    expect(await off.data.pullRequestsEnabled()).toBe(false);
    await expect(off.engine.start("requirements", { key: "ABC-1", withPullRequests: true })).rejects.toMatchObject({ code: "INVALID_INPUTS", message: expect.stringContaining("needs a git section") });
    await plain.engine.submit(first.runId, "analyze", answer());
    await expect(plain.engine.start("document", { type: "test-plan", requirementsRun: first.runId, withPullRequests: true })).rejects.toMatchObject({ code: "INVALID_INPUTS", message: expect.stringContaining("give a key or a JQL filter") });
    await expect(plain.engine.start("test-cases", { casesRun: first.runId, withPullRequests: true })).rejects.toMatchObject({ code: "INVALID_INPUTS" });
  });
});
