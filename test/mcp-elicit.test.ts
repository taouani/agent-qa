import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MemoryStateStore, WorkflowEngine, type WorkflowDefinition } from "../src/core/index.js";
import { createMcpServer } from "../src/mcp/index.js";

/** A one-step workflow whose confirm step needs the person's own yes, like the Xray push. */
function pushWorkflow(pushed: boolean[], question: () => string = () => "Push 3 test case(s) to Xray project QA?", before = false): WorkflowDefinition<{ n: number }> {
  return {
    id: "push-only",
    description: "Test: one approval step.",
    inputSchema: z.object({ n: z.number() }),
    steps: [
      ...(before ? [{ id: "review", kind: "generate" as const, outputSchema: z.object({ ok: z.boolean() }), instructions: () => "Review." }] : []),
      {
        id: "push",
        kind: "confirm",
        outputSchema: z.object({ approve: z.boolean() }),
        answers: { yes: { approve: true }, no: { approve: false }, unattended: { approve: false } },
        approval: { question },
        instructions: () => 'Ask the user: "Push to Xray?" Submit their answer.',
        onAccept: (_ctx, output: { approve: boolean }) => {
          pushed.push(output.approve);
        },
      },
    ],
  };
}

type Elicit = (message: string, schema: unknown) => ElicitResult | Promise<ElicitResult>;

async function connect(options: { elicit?: Elicit; capabilities?: Record<string, unknown>; question?: () => string; review?: boolean } = {}) {
  const pushed: boolean[] = [];
  const asked: string[] = [];
  const engine = new WorkflowEngine({ store: new MemoryStateStore(), newRunId: () => "run-1" }).register(pushWorkflow(pushed, options.question, options.review));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(engine).connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: options.capabilities ?? (options.elicit ? { elicitation: { form: {} } } : {}) });
  if (options.elicit) {
    const elicit = options.elicit;
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      const params = request.params as { message: string; requestedSchema?: unknown };
      asked.push(params.message);
      return elicit(params.message, params.requestedSchema);
    });
  }
  await client.connect(clientSide);
  return { client, pushed, asked };
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const [first, second] = result.content as Array<{ type: string; text: string }>;
  const body = JSON.parse(first!.text);
  // A step's context comes as its own text after the JSON.
  if (second) {
    const context = second.text.replace(/^## Context of step [^\n]*\n\n/, "");
    if (body.next) body.next.context = context;
    else body.context = context;
  }
  return { isError: result.isError === true, body };
}

const start = (client: Client) => call(client, "workflow_start", { workflow: "push-only", inputs: { n: 3 } });
const submit = (client: Client, approve: boolean) => call(client, "workflow_submit", { runId: "run-1", stepId: "push", output: { approve } });

describe("MCP approval by elicitation (S1-13)", () => {
  it("asks the user directly and pushes on their yes", async () => {
    const { client, pushed, asked } = await connect({ elicit: () => ({ action: "accept", content: { answer: "Yes, go ahead" } }) });
    const step = await start(client);
    expect(step.body).toMatchObject({ stepId: "push", kind: "confirm", approval: { yes: { approve: true } } });
    expect(step.body.instructions).toContain("Don't ask in chat");
    const done = await submit(client, true);
    expect(done.body.next).toMatchObject({ kind: "done" });
    expect(asked).toEqual(["Push 3 test case(s) to Xray project QA?"]);
    expect(pushed).toEqual([true]);
  });

  it("asks with a yes/no choice that defaults to no", async () => {
    let schema: unknown;
    const { client } = await connect({
      elicit: (_m, s) => {
        schema = s;
        return { action: "cancel" };
      },
    });
    await start(client);
    await submit(client, true);
    expect(schema).toMatchObject({ type: "object", properties: { answer: { type: "string", enum: ["Yes, go ahead", "No"], default: "No" } }, required: ["answer"] });
  });

  it.each([
    ["declines", { action: "decline" } as ElicitResult],
    ["cancels", { action: "cancel" } as ElicitResult],
    ["answers no", { action: "accept", content: { answer: "No" } } as ElicitResult],
  ])("doesn't push when the user %s, whatever the model sent", async (_label, answer) => {
    const { client, pushed } = await connect({ elicit: () => answer });
    await start(client);
    const done = await submit(client, true);
    expect(done.body.next).toMatchObject({ kind: "done" });
    expect(pushed).toEqual([false]);
  });

  it("pushes nothing on an answer outside the choices, and the step stays open", async () => {
    let answer: ElicitResult = { action: "accept", content: { answer: "yes" } };
    const { client, pushed } = await connect({ elicit: () => answer });
    await start(client);
    const result = await submit(client, true);
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.body)).toContain("Nothing was submitted");
    expect(pushed).toEqual([]);
    answer = { action: "accept", content: { answer: "Yes, go ahead" } };
    expect((await submit(client, true)).body.next).toMatchObject({ kind: "done" });
    expect(pushed).toEqual([true]);
  });

  it("keeps the model's no without asking", async () => {
    const { client, pushed, asked } = await connect({ elicit: () => ({ action: "accept", content: { answer: "Yes, go ahead" } }) });
    await start(client);
    await submit(client, false);
    expect(asked).toEqual([]);
    expect(pushed).toEqual([false]);
  });

  it("treats an empty elicitation capability as form mode", async () => {
    const { client, asked } = await connect({ elicit: () => ({ action: "accept", content: { answer: "Yes, go ahead" } }), capabilities: { elicitation: {} } });
    await start(client);
    await submit(client, true);
    expect(asked).toHaveLength(1);
  });

  it("falls back to the model's answer when the host can't elicit", async () => {
    const { client, pushed } = await connect();
    const step = await start(client);
    expect(step.body.instructions).not.toContain("Don't ask in chat");
    await submit(client, true);
    expect(pushed).toEqual([true]);
  });

  it("falls back when the host only offers URL-mode elicitation", async () => {
    const { client, pushed } = await connect({ capabilities: { elicitation: { url: {} } } });
    const step = await start(client);
    expect(step.body.instructions).not.toContain("Don't ask in chat");
    await submit(client, true);
    expect(pushed).toEqual([true]);
  });

  it("submits nothing when asking fails, and the step stays open", async () => {
    let fail = true;
    const { client, pushed } = await connect({
      elicit: () => {
        if (fail) throw new Error("dialog closed");
        return { action: "accept", content: { answer: "Yes, go ahead" } };
      },
    });
    await start(client);
    const first = await submit(client, true);
    expect(first.isError).toBe(true);
    expect(first.body).toMatchObject({ error: "CONTEXT_FAILED" });
    expect(first.body.message).toContain("Nothing was submitted");
    expect(pushed).toEqual([]);
    fail = false;
    const again = await submit(client, true);
    expect(again.body.next).toMatchObject({ kind: "done" });
    expect(pushed).toEqual([true]);
  });

  it("submits nothing when the question can't be prepared", async () => {
    const { client, pushed, asked } = await connect({
      elicit: () => ({ action: "accept", content: { answer: "Yes, go ahead" } }),
      question: () => {
        throw new Error("Jira unreachable");
      },
    });
    await start(client);
    const first = await submit(client, true);
    expect(first.body).toMatchObject({ error: "CONTEXT_FAILED" });
    expect(asked).toEqual([]);
    expect(pushed).toEqual([]);
  });

  it("asks even when the model sends its yes in parallel with the step before (no race past the prompt)", async () => {
    const { client, pushed, asked } = await connect({ review: true, elicit: () => ({ action: "decline" }) });
    await start(client);
    const [review, push] = await Promise.all([
      call(client, "workflow_submit", { runId: "run-1", stepId: "review", output: { ok: true } }),
      submit(client, true),
    ]);
    expect(review.body.status).toBe("accepted");
    // The push submit either came too early (step mismatch) or was asked about: never a silent yes.
    if (!push.isError) expect(asked).toHaveLength(1);
    expect(pushed).not.toContain(true);
  });

  it("asks when the model sends its yes as a JSON string", async () => {
    const { client, pushed, asked } = await connect({ elicit: () => ({ action: "decline" }) });
    await start(client);
    await call(client, "workflow_submit", { runId: "run-1", stepId: "push", output: '{"approve":true}' });
    expect(asked).toHaveLength(1);
    expect(pushed).toEqual([false]);
  });

  it("refuses approval on a step that can't take one", () => {
    const engine = new WorkflowEngine({ store: new MemoryStateStore() });
    const wf = pushWorkflow([]);
    const generate = { ...wf, steps: [{ ...wf.steps[0]!, kind: "generate" as const }] };
    expect(() => engine.register(generate)).toThrow(/approval needs an unbatched confirm step/);
    const batched = { ...wf, id: "b", steps: [{ ...wf.steps[0]!, batches: () => 2 }] };
    expect(() => engine.register(batched)).toThrow(/approval needs an unbatched confirm step/);
  });

  it("doesn't ask for a step that isn't open", async () => {
    const { client, asked } = await connect({ elicit: () => ({ action: "accept", content: { answer: "Yes, go ahead" } }) });
    await start(client);
    const wrong = await call(client, "workflow_submit", { runId: "run-1", stepId: "review", output: { approve: true } });
    expect(wrong.isError).toBe(true);
    expect(asked).toEqual([]);
  });
});
