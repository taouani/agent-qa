import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectRoot } from "../src/cli/index.js";
import type { JiraCollection, JiraInput, JiraIssue } from "../src/connectors/index.js";
import { configSchema, EngineError, RunStore, WorkflowEngine, type Step } from "../src/core/index.js";
import { DataAccess } from "../src/data/index.js";
import { drive, StaticDriver } from "../src/llm/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";
import { REQUIREMENTS_ARTIFACT, requirementsWorkflow } from "../src/workflows/index.js";

const SITE = "https://acme.atlassian.net";
const adf = (text: string) => ({ text, mentions: [], links: [] });

function issue(over: Partial<JiraIssue> & { key: string }): JiraIssue {
  return {
    id: "1",
    type: "Story",
    subtask: false,
    summary: "",
    description: adf(""),
    extraFields: {},
    labels: [],
    components: [],
    fixVersions: [],
    children: [],
    links: [],
    remoteLinks: [],
    people: [],
    updated: "2026-11-01T10:00:00.000+0000",
    role: "root",
    depth: 0,
    ...over,
  };
}

const ISSUES = [
  issue({
    key: "ABC-1",
    type: "Story",
    summary: "Escalate old cases for Marguerite Quillfeather",
    description: adf("Escalate cases older than 2 days.\n\nAcceptance criteria:\n- A case older than 2 days is escalated\n- The owner is notified"),
    children: ["ABC-2"],
    people: [{ role: "reporter", displayName: "Marguerite Quillfeather", accountId: "a1" }],
  }),
  issue({
    key: "ABC-2",
    type: "Sub-task",
    parent: "ABC-1",
    role: "child",
    depth: 1,
    summary: "Email the owner",
    description: adf("Send Marguerite Quillfeather an email at mq@example.com when a case is escalated."),
  }),
];
const SECRETS = ["Marguerite", "Quillfeather", "mq@example.com"];

class FakeJira {
  inputs: JiraInput[] = [];
  fail = false;
  async collect(input: JiraInput): Promise<JiraCollection> {
    if (this.fail) throw new Error("Jira is down");
    this.inputs.push(input);
    return { input, issues: structuredClone(ISSUES), truncated: false, unreachable: [], extraFields: [] };
  }
}

let dir: string;
let runs: RunStore;
let jira: FakeJira;
let engine: WorkflowEngine;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-qa-req-"));
  runs = new RunStore(join(dir, "runs"));
  jira = new FakeJira();
  const key = randomBytes(32);
  const config = configSchema.parse({ version: 1, atlassian: { site: SITE, email: "${env:E}", token: "${env:T}" } });
  const data = new DataAccess({
    root: dir,
    store: runs,
    config,
    vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => key } }),
    jira,
    confluence: { pages: async () => ({ pages: [], skipped: [] }) },
  });
  engine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(requirementsWorkflow({ data, runs }));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const good = {
  issues: [
    { key: "ABC-1", quality: { score: 72, missing: ["error-handling"] }, openQuestions: ["Who is the owner when <PERSON_1> is away?"], inferredCriteria: [] },
    { key: "ABC-2", quality: { score: 45, missing: ["acceptance-criteria"] }, openQuestions: [], inferredCriteria: ["The owner gets an email when a case is escalated"] },
  ],
};

async function files(root: string): Promise<string> {
  const out: string[] = [];
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) out.push(await readFile(join(entry.parentPath, entry.name), "utf8"));
  }
  return out.join("\n");
}

describe("requirements workflow", () => {
  it("fetches, masks, analyzes and writes requirements@1 with its markdown view", async () => {
    const first = await engine.start("requirements", { key: "abc-1" });
    expect(first.runId).toMatch(/-ABC-1-/);
    expect(first.context).toContain("<PERSON_1>");
    expect(first.context).toContain("AC1: A case older than 2 days is escalated");
    for (const s of SECRETS) expect(first.context, s).not.toContain(s);

    const prompts: string[] = [];
    const result = await drive(engine, first, new StaticDriver((r) => (prompts.push(r.messages.map((m) => m.content).join("\n")), JSON.stringify(good))));
    expect(result.step.kind).toBe("done");
    expect(prompts).toHaveLength(1);

    const artifact = await runs.readArtifact(first.runId, REQUIREMENTS_ARTIFACT);
    const [story, task] = artifact!.data.requirements;
    expect(artifact!.data.input).toEqual({ key: "ABC-1" });
    expect(story).toMatchObject({ key: "ABC-1", acceptanceCriteriaSource: "description", quality: { score: 72 } });
    expect(story!.acceptanceCriteria[0]).toEqual({ id: "AC1", text: "A case older than 2 days is escalated", origin: "jira" });
    expect(task).toMatchObject({ key: "ABC-2", parent: "ABC-1", acceptanceCriteriaSource: "inferred" });
    expect(task!.acceptanceCriteria).toEqual([{ id: "AC1", text: "The owner gets an email when a case is escalated", origin: "inferred" }]);
    expect(artifact!.inputs.map((i) => i.ref)).toEqual(["ABC-1", "ABC-2"]);

    const md = await readFile(join(dir, "runs", first.runId, "requirements.md"), "utf8");
    expect(md).toContain("## ABC-1: Escalate old cases for <PERSON_1>");
    expect(md).toContain("**AC1** (inferred): The owner gets an email");
    expect(md).toContain("Who is the owner when <PERSON_1> is away?");
    // Jira was read once: the render, the check and the artifact all use the run's cached sources.
    expect(jira.inputs).toHaveLength(1);
    const all = await files(join(dir, "runs"));
    for (const s of SECRETS) expect(all, s).not.toContain(s);
  });

  it("rejects answers that skip, repeat or invent issues, add criteria where they exist, or make up tokens", async () => {
    const first = await engine.start("requirements", { key: "ABC-1" });
    const bad = {
      issues: [
        { ...good.issues[0]!, inferredCriteria: ["Something"], openQuestions: ["Ask <PERSON_7>"] },
        { ...good.issues[0]! },
        { ...good.issues[1]!, key: "ABC-99" },
      ],
    };
    const result = await engine.submit(first.runId, "analyze", bad);
    expect(result.status).toBe("rejected");
    const errors = result.status === "rejected" ? result.errors : [];
    expect(errors).toEqual(
      expect.arrayContaining([
        { path: "$.issues.0.inferredCriteria", message: expect.stringContaining("already has acceptance criteria") },
        { path: "$.issues.0.openQuestions.0", message: expect.stringContaining("<PERSON_7>") },
        { path: "$.issues.1.key", message: "ABC-1 is answered more than once" },
        { path: "$.issues.2.key", message: "ABC-99 is not an issue in the context" },
        { path: "$.issues", message: "no answer for ABC-2" },
      ]),
    );
    expect(await runs.readArtifact(first.runId, REQUIREMENTS_ARTIFACT)).toBeUndefined();
    // Keys are matched whatever their case.
    const lower = { issues: good.issues.map((i) => ({ ...i, key: i.key.toLowerCase() })) };
    expect((await engine.submit(first.runId, "analyze", lower)).status).toBe("accepted");
    expect((await runs.readArtifact(first.runId, REQUIREMENTS_ARTIFACT))!.data.requirements[1]!.quality.score).toBe(45);
  });

  it("fails the run when the checks reject every attempt", async () => {
    const first = await engine.start("requirements", { key: "ABC-1" });
    const missing = { issues: [good.issues[0]!] };
    for (let i = 1; i <= 3; i++) await engine.submit(first.runId, "analyze", missing);
    expect((await engine.status(first.runId)).status).toBe("failed");
  });

  it("uses no attempt when the check can't read its data", async () => {
    const first = await engine.start("requirements", { key: "ABC-1" });
    await rm(join(dir, "runs", first.runId, "sources.json"));
    jira.fail = true;
    await expect(engine.submit(first.runId, "analyze", good)).rejects.toMatchObject({ code: "CONTEXT_FAILED", runId: first.runId });
    expect((await engine.status(first.runId)).attempt).toBe(1);
    jira.fail = false;
    expect((await engine.submit(first.runId, "analyze", good)).status).toBe("accepted");
  });

  it("keeps a JQL filter out of the run folder as a vault token", async () => {
    const jql = 'project = ABC AND assignee = jdoe AND reporter = 5b10ac8d82e05b22cc7d4ef5 AND text ~ "Marguerite Quillfeather"';
    const first = await engine.start("requirements", { jql });
    expect(jira.inputs).toEqual([{ jql }]);
    const state = await engine.status(first.runId);
    expect(state.inputs).toEqual({ jql: "<INPUT_1>" });
    await drive(engine, first, new StaticDriver(JSON.stringify(good)));
    const artifact = await runs.readArtifact(first.runId, REQUIREMENTS_ARTIFACT);
    expect("jql" in artifact!.data.input && artifact!.data.input.jql).toContain("<PERSON_1>");
    const all = await files(join(dir, "runs"));
    for (const s of [...SECRETS, "jdoe", "5b10ac8d82e05b22cc7d4ef5", jql, JSON.stringify(jql).slice(1, -1)]) expect(all, s).not.toContain(s);
    await expect(engine.start("requirements", { jql: "<INPUT_1>" })).rejects.toMatchObject({ code: "INVALID_INPUTS" });
  });

  it("needs exactly one of key or jql", async () => {
    for (const inputs of [{}, { key: "ABC-1", jql: "project = ABC" }, { key: "not a key" }]) {
      await expect(engine.start("requirements", inputs)).rejects.toMatchObject({ code: "INVALID_INPUTS" });
    }
  });

  it("leaves the run open when Jira can't be read, and tries again on next", async () => {
    jira.fail = true;
    const error = (await engine.start("requirements", { key: "ABC-1" }).catch((e: unknown) => e)) as EngineError;
    expect(error).toBeInstanceOf(EngineError);
    expect(error.code).toBe("CONTEXT_FAILED");
    expect(error.message).toContain("Jira is down");
    const runId = error.runId!;
    expect(error.message).toContain(runId);
    jira.fail = false;
    const step: Step = await engine.next(runId);
    expect(step).toMatchObject({ stepId: "analyze", kind: "generate" });
    expect(step.context).toContain("ABC-2");
  });
});

describe("projectRoot", () => {
  it("finds the project from AGENT_QA_RUNS_DIR when the host gives no working folder", () => {
    const app = resolve("/work/app");
    expect(projectRoot("/", { AGENT_QA_RUNS_DIR: join(app, ".agent-qa", "runs") })).toBe(app);
    expect(projectRoot("/cwd", { AGENT_QA_RUNS_DIR: resolve("/elsewhere/runs") })).toBe("/cwd");
    expect(projectRoot("/cwd", { AGENT_QA_ROOT: "/root", AGENT_QA_RUNS_DIR: join(app, ".agent-qa", "runs") })).toBe(resolve("/root"));
    expect(projectRoot("/cwd", {})).toBe("/cwd");
  });
});
