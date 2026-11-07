import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  contextOf,
  contextSlug,
  hashInput,
  newRunId,
  RunStore,
  RunStoreError,
  sourceHash,
  WorkflowEngine,
  type ArtifactSpec,
  type InputRef,
} from "../src/core/index.js";
import { spikeWorkflow } from "../src/workflows/index.js";

const now = () => new Date("2026-11-20T23:59:00Z");
const fixed = (n: number) => Buffer.from([10, 3, 5, 9, 0, 0].slice(0, n));

const testCases: ArtifactSpec<{ cases: Array<{ id: string; title: string }> }> = {
  name: "test-cases",
  schema: "test-cases@1",
  data: z.object({ cases: z.array(z.object({ id: z.string().regex(/^TC-[A-Z]+-\d+-\d{3}$/), title: z.string().min(1) })).min(1) }),
  render: (d) => d.cases.map((c) => `- ${c.id} ${c.title}`).join("\n") + "\n",
};
const issue: InputRef = { kind: "jira-issue", ref: "PROJ-123", hash: hashInput("masked text of PROJ-123") };
const page: InputRef = { kind: "confluence-page", ref: "123456", hash: hashInput("masked page") };

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agent-qa-runs-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("run ids", () => {
  it("are {UTC date}-{context}-{4 chars}", () => {
    expect(newRunId("PROJ-123", now(), fixed)).toBe("2026-11-20-PROJ-123-kdfj");
    expect(newRunId("PROJ-123", new Date("2026-11-20T23:59:00-05:00"), fixed)).toMatch(/^2026-11-21-/);
  });

  it("use only key-shaped context, never free text", () => {
    expect(contextOf("spike", { ticket: "PROJ-123" })).toBe("PROJ-123");
    expect(contextOf("spike", { page: "123456" })).toBe("123456");
    expect(contextOf("spike", { ticket: "Ada Lovelace's login bug" })).toBe("spike");
    expect(contextOf("spike", { context: "anything" })).toBe("spike");
  });

  it("slug the context so it's safe as a folder name", () => {
    expect(contextSlug("Login page: SSO / MFA!")).toBe("Login-page-SSO-MFA");
    expect(contextSlug("../../etc")).toBe("etc");
    expect(contextSlug("???")).toBe("run");
    expect(contextSlug("x".repeat(60))).toHaveLength(40);
  });
});

describe("sourceHash", () => {
  it("is stable across input order and changes with inputs, template or schema", () => {
    const a = sourceHash({ inputs: [issue, page], templateVersion: "1", schema: "test-cases@1" });
    expect(sourceHash({ inputs: [page, issue], templateVersion: "1", schema: "test-cases@1" })).toBe(a);
    expect(sourceHash({ inputs: [issue], templateVersion: "1", schema: "test-cases@1" })).not.toBe(a);
    expect(sourceHash({ inputs: [issue, page, issue], templateVersion: "1", schema: "test-cases@1" })).toBe(a);
    expect(sourceHash({ inputs: [issue, page], templateVersion: "2", schema: "test-cases@1" })).not.toBe(a);
    expect(sourceHash({ inputs: [issue, page], templateVersion: "1", schema: "test-cases@2" })).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("RunStore", () => {
  it("creates a run folder with run.json", async () => {
    const store = new RunStore(root, { now, random: fixed });
    const run = await store.create({ workflow: "test-cases", context: "PROJ-123", host: "copilot", driver: "host-model", model: "anthropic:x" });
    expect(run).toMatchObject({ id: "2026-11-20-PROJ-123-kdfj", status: "running", versions: { runSchema: 1 }, artifacts: [], parentRuns: [] });
    expect(JSON.parse(await readFile(join(root, run.id, "run.json"), "utf8"))).toEqual(run);
    expect(await store.list()).toEqual([run.id]);
  });

  it("picks a new id when the folder exists, and refuses an explicit id that exists", async () => {
    let n = 0;
    const store = new RunStore(root, { now, random: (k) => Buffer.alloc(k, n++ < 2 ? 0 : 1) });
    const first = await store.create({ workflow: "w", context: "c", host: "cli", driver: "api" });
    const second = await store.create({ workflow: "w", context: "c", host: "cli", driver: "api" });
    expect(second.id).not.toBe(first.id);
    await expect(store.create({ workflow: "w", context: "c", host: "cli", driver: "api", id: first.id })).rejects.toThrow(/already exists/);
    await expect(store.create({ workflow: "w", context: "c", host: "cli", driver: "api", id: first.id })).rejects.toMatchObject({ code: "EXISTS" });
  });

  it("writes a valid artifact with its markdown view and records it in run.json", async () => {
    const store = new RunStore(root, { now, random: fixed });
    const run = await store.create({ workflow: "test-cases", context: "PROJ-123", host: "cli", driver: "api" });
    const data = { cases: [{ id: "TC-PROJ-123-001", title: "Log in with SSO" }] };
    const written = await store.writeArtifact(run.id, testCases, data, { inputs: [issue], templateVersion: "1" });
    expect(written).toMatchObject({ schema: "test-cases@1", runId: run.id, masked: true, data });
    expect((await readdir(join(root, run.id))).sort()).toEqual(["run.json", "test-cases.json", "test-cases.md"]);
    expect(await readFile(join(root, run.id, "test-cases.md"), "utf8")).toBe("- TC-PROJ-123-001 Log in with SSO\n");
    const manifest = await store.manifest(run.id);
    expect(manifest?.artifacts).toEqual([{ name: "test-cases", schema: "test-cases@1", sourceHash: written.sourceHash, file: "test-cases.json" }]);
    expect(manifest?.inputs).toEqual([issue]);
    expect(await store.readArtifact(run.id, testCases)).toEqual(written);

    // Rewriting replaces the entry; the same inputs give the same sourceHash.
    const again = await store.writeArtifact(run.id, testCases, data, { inputs: [issue], templateVersion: "1" });
    expect(again.sourceHash).toBe(written.sourceHash);
    expect((await store.manifest(run.id))?.artifacts).toHaveLength(1);

    // Without a renderer, an old markdown view is removed.
    const { render: _render, ...plain } = testCases;
    void _render;
    await store.writeArtifact(run.id, plain, data, { inputs: [issue], templateVersion: "1" });
    expect(await readdir(join(root, run.id))).not.toContain("test-cases.md");
  });

  it("never writes an invalid artifact", async () => {
    const store = new RunStore(root, { now, random: fixed });
    const run = await store.create({ workflow: "test-cases", context: "PROJ-123", host: "cli", driver: "api" });
    const bad = store.writeArtifact(run.id, testCases, { cases: [{ id: "case-1", title: "" }] }, { inputs: [issue], templateVersion: "1" });
    await expect(bad).rejects.toBeInstanceOf(RunStoreError);
    await expect(bad).rejects.toMatchObject({ errors: [{ path: "$.cases.0.id" }, { path: "$.cases.0.title" }] });
    await expect(
      store.writeArtifact(run.id, testCases, { cases: [{ id: "TC-PROJ-123-001", title: "x" }] }, { inputs: [{ ...issue, hash: "nope" }], templateVersion: "1" }),
    ).rejects.toThrow(/Invalid inputs/);
    await expect(store.writeArtifact(run.id, { ...testCases, name: "../x" }, {}, { inputs: [], templateVersion: "1" })).rejects.toThrow(/Invalid artifact name/);
    await expect(store.writeArtifact(run.id, { ...testCases, name: "run", schema: "run@1" }, {}, { inputs: [], templateVersion: "1" })).rejects.toThrow(/Invalid artifact name/);
    await expect(store.writeArtifact(run.id, { ...testCases, name: "con", schema: "con@1" }, {}, { inputs: [], templateVersion: "1" })).rejects.toThrow(/Invalid artifact name/);
    await expect(store.writeArtifact(run.id, { ...testCases, schema: "other@1" }, {}, { inputs: [], templateVersion: "1" })).rejects.toThrow(/must have schema test-cases@/);
    const boom = { ...testCases, render: () => { throw new Error("render failed"); } };
    await expect(store.writeArtifact(run.id, boom, { cases: [{ id: "TC-PROJ-123-001", title: "x" }] }, { inputs: [issue], templateVersion: "1" })).rejects.toThrow(/render failed/);
    expect(await readdir(join(root, run.id))).toEqual(["run.json"]);
  });

  it("rejects a tampered or mismatched artifact on read", async () => {
    const store = new RunStore(root, { now, random: fixed });
    const run = await store.create({ workflow: "test-cases", context: "PROJ-123", host: "cli", driver: "api" });
    await store.writeArtifact(run.id, testCases, { cases: [{ id: "TC-PROJ-123-001", title: "x" }] }, { inputs: [issue], templateVersion: "1" });
    const file = join(root, run.id, "test-cases.json");
    const envelope = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify({ ...envelope, masked: false }));
    await expect(store.readArtifact(run.id, testCases)).rejects.toThrow(/Invalid test-cases artifact/);
    await writeFile(file, JSON.stringify({ ...envelope, schema: "test-cases@2" }));
    await expect(store.readArtifact(run.id, testCases)).rejects.toThrow(/expected test-cases@1/);
    await writeFile(file, JSON.stringify({ ...envelope, data: { cases: [] } }));
    await expect(store.readArtifact(run.id, testCases)).rejects.toThrow(/Invalid test-cases@1 data/);
    expect(await store.readArtifact(run.id, { ...testCases, name: "missing", schema: "missing@1" })).toBeUndefined();
    await expect(store.readArtifact(run.id, { ...testCases, name: "../evil", schema: "../evil@1" })).rejects.toThrow(/Invalid artifact name/);
  });

  it("sets endedAt when a run finishes and keeps concurrent updates", async () => {
    const store = new RunStore(root, { now, random: fixed });
    const run = await store.create({ workflow: "w", context: "c", host: "cli", driver: "api" });
    await Promise.all([
      store.update(run.id, { model: "openai:x" }),
      store.writeArtifact(run.id, testCases, { cases: [{ id: "TC-PROJ-123-001", title: "x" }] }, { inputs: [issue], templateVersion: "1" }),
      store.update(run.id, { parentRuns: ["2026-11-19-c-aaaa"] }),
    ]);
    const done = await store.update(run.id, { status: "done" });
    expect(done).toMatchObject({ model: "openai:x", parentRuns: ["2026-11-19-c-aaaa"], endedAt: "2026-11-20T23:59:00.000Z" });
    expect(done.artifacts).toHaveLength(1);
    await expect(store.update("2026-01-01-none-aaaa", { status: "done" })).rejects.toThrow(/Run not found/);
    await expect(store.update("2026-01-01-none-aaaa", { status: "done" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("gives a claim to one holder at a time, across store instances", async () => {
    const a = new RunStore(root, { now, random: fixed });
    const b = new RunStore(root, { now, random: fixed });
    const run = await a.create({ workflow: "w", context: "c", host: "cli", driver: "api" });
    const [first, second] = await Promise.all([a.claim(run.id, "xray-push", "run-a"), b.claim(run.id, "xray-push", "run-b")]);
    expect([first, second].filter((x) => x === undefined)).toHaveLength(1);
    const holder = first === undefined ? "run-a" : "run-b";
    expect(await a.claim(run.id, "xray-push", holder)).toBeUndefined();
    await a.release(run.id, "xray-push", "someone-else");
    expect(await b.claim(run.id, "xray-push", "run-c")).toBe(holder);
    await b.release(run.id, "xray-push", holder);
    expect(await b.claim(run.id, "xray-push", "run-c")).toBeUndefined();
    await expect(a.claim(run.id, "../x", "h")).rejects.toMatchObject({ code: "UNSAFE_ID" });
    await expect(a.claim("2026-01-01-none-aaaa", "xray-push", "h")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("appends log events and rejects unsafe ids", async () => {
    const store = new RunStore(root, { now, random: fixed });
    const run = await store.create({ workflow: "w", context: "c", host: "cli", driver: "api" });
    await store.log(run.id, { event: "step", stepId: "analyze" });
    await store.log(run.id, { event: "step", stepId: "cases" });
    const lines = (await readFile(join(root, run.id, "log.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.stepId)).toEqual(["analyze", "cases"]);
    const log = (await readFile(join(root, run.id, "log.jsonl"), "utf8")).split("\n")[0]!;
    await store.log(run.id, { at: "fake" });
    expect(JSON.parse((await readFile(join(root, run.id, "log.jsonl"), "utf8")).trim().split("\n")[2]!).at).toBe("2026-11-20T23:59:00.000Z");
    expect(log).toContain("analyze");
    await expect(store.log("2026-01-01-none-aaaa", { event: "x" })).rejects.toThrow(/Run not found/);
    expect(await store.list()).toEqual([run.id]);
    expect(() => store.dir("../x")).toThrow(/Unsafe run id/);
    expect(() => store.dir("../x")).toThrow(expect.objectContaining({ code: "UNSAFE_ID" }));
    for (const id of ["CON", "nul.txt", "abc.", "x".repeat(81)]) expect(() => store.dir(id)).toThrow(/Unsafe run id/);
    await expect(store.manifest("a/../../b")).rejects.toThrow(/Unsafe run id/);
  });
});

describe("engine state in run folders", () => {
  it("creates the run on start, resumes after a restart, and tracks status in run.json", async () => {
    const make = () => {
      const runs = new RunStore(root, { now, random: fixed });
      return { runs, engine: new WorkflowEngine({ store: runs.stateStore({ host: "copilot", driver: "host-model" }), newRunId: runs.newRunId }).register(spikeWorkflow) };
    };
    const { runs, engine } = make();
    const step = await engine.start("spike-test-cases", { ticket: "SPIKE-2" });
    expect(step.runId).toBe("2026-11-20-SPIKE-2-kdfj");
    expect(await runs.manifest(step.runId)).toMatchObject({ workflow: "spike-test-cases", context: "SPIKE-2", host: "copilot", status: "running" });
    expect(await readdir(join(root, step.runId, "steps"))).toEqual(["state.json"]);

    const restarted = make().engine;
    expect(await restarted.next(step.runId)).toMatchObject({ stepId: "analyze" });
    await restarted.cancel(step.runId);
    expect(await runs.manifest(step.runId)).toMatchObject({ status: "cancelled", endedAt: expect.any(String) });
  });

  it("reports RUN_COLLISION for an existing folder and refuses another workflow's run", async () => {
    const runs = new RunStore(root, { now, random: fixed });
    const engine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: () => "fixed-id" }).register(spikeWorkflow);
    await runs.create({ id: "fixed-id", workflow: "other-wf", context: "c", host: "cli", driver: "api" });
    await expect(engine.start("spike-test-cases", { ticket: "SPIKE-1" })).rejects.toMatchObject({ code: "RUN_COLLISION" });
    expect((await runs.manifest("fixed-id"))?.workflow).toBe("other-wf");
    await expect(runs.stateStore({ host: "cli", driver: "api" }).save({ runId: "fixed-id", workflowId: "spike-test-cases" } as never)).rejects.toMatchObject({ code: "RUN_COLLISION" });
  });

  it("tries a fresh id when a random one is taken", async () => {
    const runs = new RunStore(root, { now, random: fixed });
    const ids = ["taken-id", "taken-id", "free-id"];
    const engine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: () => ids.shift()! }).register(spikeWorkflow);
    expect((await engine.start("spike-test-cases", { ticket: "SPIKE-1" })).runId).toBe("taken-id");
    expect((await engine.start("spike-test-cases", { ticket: "SPIKE-1" })).runId).toBe("free-id");
  });

  it("keeps needs-input until the engine's status changes, and repairs run.json after a crash", async () => {
    const runs = new RunStore(root, { now, random: fixed });
    const engine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(spikeWorkflow);
    const step = await engine.start("spike-test-cases", { ticket: "SPIKE-2" });
    await runs.update(step.runId, { status: "needs-input" });
    const rejected = await engine.submit(step.runId, "analyze", { nope: true });
    expect(rejected).toMatchObject({ status: "rejected" });
    expect((await runs.manifest(step.runId))?.status).toBe("needs-input");

    // Simulate a crash after state.json said cancelled but before run.json did.
    const file = join(root, step.runId, "steps", "state.json");
    const state = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify({ ...state, status: "cancelled" }));
    await runs.stateStore({ host: "cli", driver: "api" }).load(step.runId);
    expect((await runs.manifest(step.runId))?.status).toBe("cancelled");

    await writeFile(file, JSON.stringify({ ...state, runId: "someone-else" }));
    await expect(runs.stateStore({ host: "cli", driver: "api" }).load(step.runId)).rejects.toThrow(/belongs to another run/);
  });
});
