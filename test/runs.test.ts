import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
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
    await expect(store.writeArtifact(run.id, { ...testCases, name: "run" }, {}, { inputs: [], templateVersion: "1" })).rejects.toThrow(/Invalid artifact name/);
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
    expect(await store.readArtifact(run.id, { ...testCases, name: "missing" })).toBeUndefined();
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
  });

  it("appends log events and rejects unsafe ids", async () => {
    const store = new RunStore(root, { now, random: fixed });
    const run = await store.create({ workflow: "w", context: "c", host: "cli", driver: "api" });
    await store.log(run.id, { event: "step", stepId: "analyze" });
    await store.log(run.id, { event: "step", stepId: "cases" });
    const lines = (await readFile(join(root, run.id, "log.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.stepId)).toEqual(["analyze", "cases"]);
    expect(() => store.dir("../x")).toThrow(/Unsafe run id/);
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
});
