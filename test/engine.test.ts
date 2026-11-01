import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  EngineError,
  FileStateStore,
  MemoryStateStore,
  WorkflowEngine,
  type StateStore,
  type WorkflowDefinition,
} from "../src/core/index.js";

const testCase = z.object({ id: z.string().regex(/^TC-[A-Z]+-\d+-\d{3}$/), title: z.string().min(1) });

function demoWorkflow(onAccept = vi.fn()): WorkflowDefinition<{ issue: string }> {
  return {
    id: "demo",
    description: "Analyze a ticket, then write test cases, then confirm a push",
    inputSchema: z.object({ issue: z.string().regex(/^[A-Z]+-\d+$/) }),
    steps: [
      {
        id: "analyze",
        kind: "generate",
        outputSchema: z.object({ summary: z.string().min(1) }),
        instructions: (ctx) => `Analyze ${ctx.inputs.issue}`,
        context: () => "Ticket text with <PERSON_1> masked",
      },
      {
        id: "cases",
        kind: "generate",
        outputSchema: z.object({ cases: z.array(testCase).min(1) }),
        instructions: (ctx) => `Write cases for: ${(ctx.outputs.analyze as { summary: string }).summary}`,
        onAccept,
      },
      {
        id: "push",
        kind: "confirm",
        outputSchema: z.object({ approve: z.boolean() }),
        instructions: () => "Ask the user to confirm the push",
      },
    ],
  };
}

function engine(store: StateStore = new MemoryStateStore(), workflow = demoWorkflow()) {
  let n = 0;
  return new WorkflowEngine({ store, newRunId: () => `run-${++n}` }).register(workflow);
}

describe("WorkflowEngine", () => {
  it("runs a workflow start to done", async () => {
    const onAccept = vi.fn();
    const e = engine(new MemoryStateStore(), demoWorkflow(onAccept));
    const s1 = await e.start("demo", { issue: "PROJ-123" });
    expect(s1).toMatchObject({ runId: "run-1", stepId: "analyze", kind: "generate", attempt: 1, maxAttempts: 3 });
    expect(s1.instructions).toBe("Analyze PROJ-123");
    expect(s1.context).toContain("<PERSON_1>");
    expect(s1.outputSchema).toMatchObject({ type: "object" });

    const r1 = await e.submit("run-1", "analyze", { summary: "Login flow" });
    expect(r1.status).toBe("accepted");
    expect(r1.next.instructions).toBe("Write cases for: Login flow");

    const cases = { cases: [{ id: "TC-PROJ-123-001", title: "Valid login" }] };
    expect((await e.submit("run-1", "cases", cases)).next.kind).toBe("confirm");
    expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-1" }), cases);

    const r3 = await e.submit("run-1", "push", { approve: true });
    expect(r3.next).toMatchObject({ kind: "done", stepId: "done" });
    expect((await e.status("run-1")).status).toBe("done");
  });

  it("rejects invalid inputs at start", async () => {
    await expect(engine().start("demo", { issue: "nope" })).rejects.toMatchObject({
      code: "INVALID_INPUTS",
      errors: [{ path: "$.issue" }],
    });
    await expect(engine().start("missing", {})).rejects.toMatchObject({ code: "UNKNOWN_WORKFLOW" });
  });

  it("returns errors by path and lets the model retry", async () => {
    const e = engine();
    await e.start("demo", { issue: "PROJ-1" });
    await e.submit("run-1", "analyze", { summary: "x" });
    const bad = await e.submit("run-1", "cases", { cases: [{ id: "TC-1", title: "" }] });
    expect(bad).toMatchObject({ status: "rejected", attempt: 1, maxAttempts: 3 });
    if (bad.status !== "rejected") throw new Error("unreachable");
    expect(bad.errors.map((x) => x.path).sort()).toEqual(["$.cases.0.id", "$.cases.0.title"]);
    expect(bad.next).toMatchObject({ stepId: "cases", attempt: 2 });

    const good = await e.submit("run-1", "cases", { cases: [{ id: "TC-PROJ-1-001", title: "ok" }] });
    expect(good.status).toBe("accepted");
  });

  it("fails the run after maxAttempts invalid outputs", async () => {
    const e = engine();
    await e.start("demo", { issue: "PROJ-1" });
    await e.submit("run-1", "analyze", {});
    await e.submit("run-1", "analyze", {});
    const last = await e.submit("run-1", "analyze", { summary: "" });
    expect(last).toMatchObject({ status: "rejected", attempt: 3, next: { kind: "failed" } });
    expect((await e.status("run-1")).status).toBe("failed");
    expect((await e.next("run-1")).errors?.[0]?.path).toBe("$.summary");
    await expect(e.submit("run-1", "analyze", { summary: "late" })).rejects.toMatchObject({ code: "RUN_CLOSED" });
  });

  it("returns the first result when the same step is submitted twice", async () => {
    const onAccept = vi.fn();
    const e = engine(new MemoryStateStore(), demoWorkflow(onAccept));
    await e.start("demo", { issue: "PROJ-1" });
    await e.submit("run-1", "analyze", { summary: "a" });
    const cases = { cases: [{ id: "TC-PROJ-1-001", title: "t" }] };
    const first = await e.submit("run-1", "cases", cases);
    const again = await e.submit("run-1", "cases", { cases: [{ id: "TC-PROJ-1-002", title: "other" }] });
    expect(again).toEqual(first);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent submits on one run", async () => {
    const onAccept = vi.fn();
    const e = engine(new MemoryStateStore(), demoWorkflow(onAccept));
    await e.start("demo", { issue: "PROJ-1" });
    await e.submit("run-1", "analyze", { summary: "a" });
    const cases = { cases: [{ id: "TC-PROJ-1-001", title: "t" }] };
    const [a, b] = await Promise.all([e.submit("run-1", "cases", cases), e.submit("run-1", "cases", cases)]);
    expect(a).toEqual(b);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("refuses a submit for a step that isn't open", async () => {
    const e = engine();
    await e.start("demo", { issue: "PROJ-1" });
    await expect(e.submit("run-1", "push", { approve: true })).rejects.toMatchObject({ code: "STEP_MISMATCH" });
    await expect(e.submit("nope", "analyze", {})).rejects.toBeInstanceOf(EngineError);
  });

  it("keeps state unchanged when onAccept throws", async () => {
    const e = engine(new MemoryStateStore(), demoWorkflow(vi.fn().mockRejectedValueOnce(new Error("disk full"))));
    await e.start("demo", { issue: "PROJ-1" });
    await e.submit("run-1", "analyze", { summary: "a" });
    const cases = { cases: [{ id: "TC-PROJ-1-001", title: "t" }] };
    await expect(e.submit("run-1", "cases", cases)).rejects.toThrow("disk full");
    expect((await e.next("run-1")).stepId).toBe("cases");
    expect((await e.submit("run-1", "cases", cases)).status).toBe("accepted");
  });

  it("cancels a running run", async () => {
    const e = engine();
    await e.start("demo", { issue: "PROJ-1" });
    expect((await e.cancel("run-1")).status).toBe("cancelled");
    expect((await e.next("run-1")).kind).toBe("failed");
  });

  it("lists workflows with JSON Schema inputs", () => {
    expect(engine().list()).toEqual([
      expect.objectContaining({ id: "demo", inputSchema: expect.objectContaining({ type: "object" }) }),
    ]);
  });

  it("rejects bad workflow definitions", () => {
    const e = engine();
    expect(() => e.register(demoWorkflow())).toThrow(/already registered/);
    const dup = { ...demoWorkflow(), id: "dup", steps: [demoWorkflow().steps[0]!, demoWorkflow().steps[0]!] };
    expect(() => e.register(dup)).toThrow(/Duplicate step/);
  });
});

describe("FileStateStore", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("resumes a run from disk with a new engine", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-engine-"));
    const first = engine(new FileStateStore(dir));
    await first.start("demo", { issue: "PROJ-9" });
    await first.submit("run-1", "analyze", { summary: "persisted" });

    const second = engine(new FileStateStore(dir));
    const step = await second.next("run-1");
    expect(step).toMatchObject({ stepId: "cases", instructions: "Write cases for: persisted" });
  });

  it("rejects unsafe run ids", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-engine-"));
    await expect(new FileStateStore(dir).load("../etc/passwd")).rejects.toThrow(/Unsafe run id/);
  });
});
