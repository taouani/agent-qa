import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { MemoryStateStore, WorkflowEngine } from "../src/core/index.js";
import { createMcpServer } from "../src/mcp/index.js";
import { spikeWorkflow } from "../src/workflows/index.js";

async function connect() {
  const engine = new WorkflowEngine({ store: new MemoryStateStore(), newRunId: () => "run-1" }).register(spikeWorkflow);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(engine).connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as Array<{ type: string; text: string }>;
  return { isError: result.isError === true, body: JSON.parse(first!.text) };
}

function cases(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `TC-SPIKE-2-${String(i + 1).padStart(3, "0")}`,
    title: `Case number ${i + 1}`,
    kind: "positive",
    priority: "P2",
    preconditions: [],
    steps: [{ action: "Open contact <PERSON_2>", data: "", expected: "Case form opens" }],
  }));
}

describe("MCP step protocol", () => {
  it("exposes the six workflow tools and one prompt per workflow", async () => {
    const client = await connect();
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(["workflow_cancel", "workflow_list", "workflow_next", "workflow_start", "workflow_status", "workflow_submit"]);
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual(["spike-test-cases"]);
    const prompt = await client.getPrompt({ name: "spike-test-cases", arguments: { inputs: '{"ticket":"SPIKE-1"}' } });
    expect(JSON.stringify(prompt.messages)).toContain("workflow_start");
    expect(client.getInstructions()).toContain("workflow_submit");
  });

  it("runs the spike workflow end to end, including a rejected submit", async () => {
    const client = await connect();
    const start = await call(client, "workflow_start", { workflow: "spike-test-cases", inputs: { ticket: "SPIKE-2" } });
    expect(start.body).toMatchObject({ runId: "run-1", stepId: "analyze", kind: "generate" });
    expect(start.body.context).toContain("<PERSON_1>");
    expect(start.body.outputSchema).toMatchObject({ type: "object" });

    const analysis = { summary: "Create a case from a contact.", acceptanceCriteria: ["New Case pre-fills"], ambiguities: [] };
    // Models sometimes send the output as a JSON string.
    const a = await call(client, "workflow_submit", { runId: "run-1", stepId: "analyze", output: JSON.stringify(analysis) });
    expect(a.body).toMatchObject({ status: "accepted", next: { stepId: "cases" } });

    const tooFew = await call(client, "workflow_submit", { runId: "run-1", stepId: "cases", output: { cases: cases(3) } });
    expect(tooFew.body).toMatchObject({ status: "rejected", errors: [{ path: "$.cases" }], next: { attempt: 2 } });

    const c = await call(client, "workflow_submit", { runId: "run-1", stepId: "cases", output: { cases: cases(30) } });
    expect(c.body.next).toMatchObject({ kind: "confirm", stepId: "push" });
    expect(c.body.next.instructions).toContain("Push 30 test cases");

    const done = await call(client, "workflow_submit", { runId: "run-1", stepId: "push", output: { approve: true } });
    expect(done.body.next).toMatchObject({ kind: "done" });

    const status = await call(client, "workflow_status", { runId: "run-1" });
    expect(status.body.status).toBe("done");
  });

  it("returns engine errors as tool errors with a code", async () => {
    const client = await connect();
    const bad = await call(client, "workflow_start", { workflow: "spike-test-cases", inputs: { ticket: "NOPE" } });
    expect(bad).toMatchObject({ isError: true, body: { error: "INVALID_INPUTS", errors: [{ path: "$.ticket" }] } });
    const missing = await call(client, "workflow_next", { runId: "missing" });
    expect(missing).toMatchObject({ isError: true, body: { error: "RUN_NOT_FOUND" } });
  });
});
