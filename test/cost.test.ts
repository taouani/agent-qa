import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCost, COST_ARTIFACT, recordUsage, renderCost, RunStore, WorkflowEngine, type UsageEntry } from "../src/core/index.js";
import { createMcpServer } from "../src/mcp/index.js";
import { spikeWorkflow } from "../src/workflows/index.js";

const api = (over: Partial<UsageEntry> = {}): UsageEntry => ({
  at: "2026-11-03T10:00:00.000Z",
  stepId: "analyze",
  attempt: 1,
  driver: "api",
  model: "anthropic:claude-sonnet-5-5",
  inputTokens: 1_000_000,
  outputTokens: 100_000,
  promptChars: 4000,
  answerChars: 400,
  ...over,
});

describe("cost@1", () => {
  it("prices API calls from the catalog, by step and by model", () => {
    const cost = buildCost([api(), api({ attempt: 2, inputTokens: 500_000, outputTokens: 0, cachedInputTokens: 100 }), api({ stepId: "cases_1" })]);
    // Sonnet 5.5: $2 in, $10 out per million tokens.
    expect(cost.steps.map((s) => [s.stepId, s.calls, s.usd])).toEqual([
      ["analyze", 2, 4],
      ["cases_1", 1, 3],
    ]);
    expect(cost.models).toEqual([expect.objectContaining({ model: "anthropic:claude-sonnet-5-5", calls: 3, usd: 7 })]);
    expect(cost.total).toMatchObject({ calls: 3, inputTokens: 2_500_000, outputTokens: 200_000, cachedInputTokens: 100, usd: 7, unpriced: [], hostModelCalls: 0 });
    expect(renderCost(cost)).toContain("About $7.0000 for 3 priced model call(s) of 3");
  });

  it("counts unpriced models and host-model answers without guessing a price", () => {
    const cost = buildCost([
      api({ model: "openai:gpt-6.1-sol" }),
      api({ inputTokens: undefined, outputTokens: undefined }),
      { at: "x", stepId: "cases", attempt: 1, driver: "host-model", promptChars: 9000, answerChars: 3000 },
    ]);
    expect(cost.total.usd).toBeUndefined();
    expect(cost.total.unpriced).toEqual(["anthropic:claude-sonnet-5-5 (no token counts)", "openai:gpt-6.1-sol"]);
    expect(cost.total.hostModelCalls).toBe(1);
    expect(cost.models.map((m) => m.model)).toContain("host model");
    const md = renderCost(cost);
    expect(md).toContain("1 answer(s) came from the IDE's own model");
    expect(md).toContain("| cases | host model | 1 |  |  | 9000 | 3000 |  |");
  });

  it("prices a call only with both token counts, marks mixed rows and shows tiny amounts", () => {
    const cost = buildCost([api({ outputTokens: undefined }), api({ inputTokens: 400, outputTokens: 0, model: "anthropic:claude-haiku-5-5" })]);
    expect(cost.total.unpriced).toEqual(["anthropic:claude-sonnet-5-5 (no token counts)"]);
    const md = renderCost(buildCost([api(), api({ inputTokens: undefined }), api({ stepId: "x", model: "anthropic:claude-haiku-5-5", inputTokens: 400, outputTokens: 0 })]));
    expect(md).toContain("| $3.0000 (1 unpriced) |");
    expect(md).toContain("| <$0.0001 |");
    expect(cost.steps[1]!.unpricedCalls).toBe(0);
  });
});

describe("usage recording", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-cost-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("appends usage and rewrites cost@1 each time", async () => {
    const runs = new RunStore(dir);
    const { id } = await runs.create({ workflow: "w", context: "c", host: "cli", driver: "api" });
    await recordUsage(runs, id, [api()]);
    await recordUsage(runs, id, [api({ stepId: "cases" })]);
    expect((await runs.readUsage(id)).map((e) => e.stepId)).toEqual(["analyze", "cases"]);
    expect((await runs.readArtifact(id, COST_ARTIFACT))!.data.total.calls).toBe(2);
    await expect(recordUsage(runs, id, [{ ...api(), promptChars: -1 }])).rejects.toThrow("Invalid usage entry");
  });

  it("keeps the entry after a torn line, and keeps cost@1 in step under parallel records", async () => {
    const runs = new RunStore(dir);
    const { id } = await runs.create({ workflow: "w", context: "c", host: "cli", driver: "api" });
    await recordUsage(runs, id, [api({ stepId: "one" })]);
    await appendFile(join(dir, id, "steps", "usage.jsonl"), '{"at":"x","stepId":"to');
    await recordUsage(runs, id, [api({ stepId: "two" })]);
    expect((await runs.readUsage(id)).map((e) => e.stepId)).toEqual(["one", "two"]);
    await Promise.all(Array.from({ length: 10 }, (_, i) => recordUsage(runs, id, [api({ stepId: `p${i}` })])));
    expect((await runs.readArtifact(id, COST_ARTIFACT))!.data.total.calls).toBe(12);
  });

  it("records the host model's answers from the MCP server, sizes only", async () => {
    const runs = new RunStore(dir);
    const engine = new WorkflowEngine({ store: runs.stateStore({ host: "copilot", driver: "host-model" }), newRunId: runs.newRunId }).register(spikeWorkflow);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createMcpServer(engine, { runs }).connect(serverSide);
    const client = new Client({ name: "t", version: "0" });
    await client.connect(clientSide);
    const call = async (name: string, args: Record<string, unknown>) => JSON.parse(((await client.callTool({ name, arguments: args })).content as Array<{ text: string }>)[0]!.text);
    const start = await call("workflow_start", { workflow: "spike-test-cases", inputs: { ticket: "SPIKE-1" } });
    const output = { summary: "Create a case.", acceptanceCriteria: ["Pre-fills"], ambiguities: [] };
    await call("workflow_submit", { runId: start.runId, stepId: "analyze", output });
    const usage = await runs.readUsage(start.runId);
    expect(usage).toEqual([
      expect.objectContaining({ stepId: "analyze", attempt: 1, driver: "host-model", promptChars: start.instructions.length + start.context.length, answerChars: JSON.stringify(output).length }),
    ]);
    expect(usage[0]).not.toHaveProperty("inputTokens");
    expect(await readFile(join(dir, start.runId, "cost.md"), "utf8")).toContain("came from the IDE's own model");

    // A rejected answer and its retry are two calls; a racing duplicate of an answer is one.
    const bad = { cases: [] };
    await call("workflow_submit", { runId: start.runId, stepId: "cases", output: bad });
    const good = { cases: Array.from({ length: 10 }, (_, i) => ({ id: `TC-SPIKE-1-${String(i + 1).padStart(3, "0")}`, title: `Case number ${i + 1}`, kind: "positive", priority: "P2", preconditions: [], steps: [{ action: "Open it", data: "", expected: "It opens" }] })) };
    await Promise.all([1, 2].map(() => call("workflow_submit", { runId: start.runId, stepId: "cases", output: good })));
    expect((await runs.readUsage(start.runId)).map((e) => `${e.stepId}#${e.attempt}`)).toEqual(["analyze#1", "cases#1", "cases#2"]);
  });

  it("records an answer submitted to a restarted server without asking for the step again", async () => {
    const runs = new RunStore(dir);
    const engine = new WorkflowEngine({ store: runs.stateStore({ host: "copilot", driver: "host-model" }), newRunId: runs.newRunId }).register(spikeWorkflow);
    const step = await engine.start("spike-test-cases", { ticket: "SPIKE-1" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createMcpServer(engine, { runs }).connect(serverSide);
    const client = new Client({ name: "t", version: "0" });
    await client.connect(clientSide);
    await client.callTool({ name: "workflow_submit", arguments: { runId: step.runId, stepId: "analyze", output: { summary: "S.", acceptanceCriteria: ["A"], ambiguities: [] } } });
    expect((await runs.readUsage(step.runId)).map((e) => [e.stepId, e.promptChars])).toEqual([["analyze", step.instructions.length + step.context.length]]);
  });
});
