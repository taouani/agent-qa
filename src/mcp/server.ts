import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { EngineError, recordUsage, VERSION, type RunStore, type Step, type SubmitResult, type WorkflowEngine } from "../core/index.js";

/** Instructions every host model gets for the step loop (contract 3). */
export const LOOP_INSTRUCTIONS = [
  "Agent-QA drives this workflow step by step. Follow this loop until the step kind is done or failed:",
  "1. Read the step: `instructions` says what to do, `context` is the input (personal data is already masked as tokens like <PERSON_1>; keep tokens unchanged).",
  "2. For kind `generate`: produce JSON that matches `outputSchema` exactly and call workflow_submit with runId, stepId and output.",
  "3. For kind `confirm`: ask the user the question in `instructions`, wait for their answer, then submit it.",
  "4. If the result is `rejected`, fix every error listed (each has a JSON path) and submit the same stepId again.",
  "5. Continue with the `next` step from the result. Do not stop between steps unless a step needs the user.",
  "6. When the kind is `done`, tell the user the run finished. When it is `failed`, show the errors.",
].join("\n");

function ok(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function fail(error: unknown): CallToolResult {
  const body =
    error instanceof EngineError
      ? { error: error.code, message: error.message, errors: error.errors, ...(error.runId ? { runId: error.runId } : {}) }
      : { error: "INTERNAL", message: error instanceof Error ? error.message : String(error) };
  return { isError: true, content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
}

async function guard(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error);
  }
}

/** Models sometimes send JSON objects as strings; accept both. */
function parseOutput(output: unknown): unknown {
  if (typeof output !== "string") return output;
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

const runId = z.string().min(1).describe("Run id returned by workflow_start");

export interface McpServerOptions {
  /** The engine's run store: with it, the host model's answers are recorded for `cost@1` (sizes only). */
  runs?: RunStore;
}

/** Build the MCP server for one engine. The transport is chosen by the caller. */
export function createMcpServer(engine: WorkflowEngine, options: McpServerOptions = {}): McpServer {
  const server = new McpServer({ name: "agent-qa", version: VERSION }, { instructions: LOOP_INSTRUCTIONS });
  // The last generate step handed to the host, per run: its prompt size goes with the answer.
  const served = new Map<string, { stepId: string; attempt: number; promptChars: number }>();
  const serve = (step: Step): Step => {
    if (step.kind === "generate") served.set(step.runId, { stepId: step.stepId, attempt: step.attempt, promptChars: step.instructions.length + step.context.length });
    else served.delete(step.runId);
    if (served.size > 256) served.delete(served.keys().next().value!);
    return step;
  };
  const record = async (id: string, stepId: string, output: unknown, before: { attempt: number; promptChars: number }) => {
    if (!options.runs) return;
    const answerChars = typeof output === "string" ? output.length : JSON.stringify(output).length;
    // The cost record must never fail the host's submit.
    await recordUsage(options.runs, id, [{ at: new Date().toISOString(), stepId, attempt: before.attempt, driver: "host-model", promptChars: before.promptChars, answerChars }]).catch(
      () => undefined,
    );
  };
  // Runs with a submit in flight: a second one racing it is a duplicate, never looked up again.
  const inFlight = new Map<string, number>();
  const submit = async (id: string, stepId: string, output: unknown): Promise<SubmitResult> => {
    const racing = (inFlight.get(id) ?? 0) > 0;
    inFlight.set(id, (inFlight.get(id) ?? 0) + 1);
    try {
      return await submitOnce(id, stepId, output, racing);
    } finally {
      const n = (inFlight.get(id) ?? 1) - 1;
      if (n > 0) inFlight.set(id, n);
      else inFlight.delete(id);
    }
  };
  const submitOnce = async (id: string, stepId: string, output: unknown, racing: boolean): Promise<SubmitResult> => {
    let before = served.get(id);
    // After a server restart the host may submit without asking for the step again: look it up (read-only).
    if (!before && !racing && options.runs) {
      const state = await engine.status(id).catch(() => undefined);
      // An already-accepted step is a replay, not a new answer.
      if (state && !state.accepted[stepId]) before = await engine.next(id).then((s) => (serve(s), served.get(id)), () => undefined);
    }
    // Taken now, so a second submit of the same answer racing this one isn't recorded twice.
    const mine = before?.stepId === stepId ? before : undefined;
    if (mine) served.delete(id);
    let result: SubmitResult;
    try {
      result = await engine.submit(id, stepId, output);
    } catch (error) {
      // The answer was saved but the next step couldn't be shown: it still counts.
      if (mine && error instanceof EngineError && error.code === "CONTEXT_FAILED" && /^The answer was (accepted|rejected)/.test(error.message)) await record(id, stepId, output, mine);
      else if (mine && !served.has(id)) served.set(id, mine);
      throw error;
    }
    if (mine) await record(id, stepId, output, mine);
    serve(result.next);
    return result;
  };

  server.registerTool(
    "workflow_list",
    { description: "List Agent-QA workflows and their inputs.", annotations: { readOnlyHint: true } },
    async () => guard(async () => engine.list()),
  );

  server.registerTool(
    "workflow_start",
    {
      description: "Start an Agent-QA workflow. Returns the run id and the first step to answer.\n\n" + LOOP_INSTRUCTIONS,
      inputSchema: {
        workflow: z
          .string()
          .min(1)
          .describe(`Workflow id from workflow_list. Available: ${engine.list().map((w) => w.id).join(", ")}`),
        inputs: z
          .union([z.record(z.string(), z.unknown()), z.string()])
          .describe("Workflow inputs as a JSON object, e.g. { \"ticket\": \"SPIKE-1\" }. See workflow_list for each workflow's input schema."),
      },
    },
    async ({ workflow, inputs }) => guard(async () => serve(await engine.start(workflow, parseOutput(inputs)))),
  );

  server.registerTool(
    "workflow_next",
    {
      description: "Return the current step of a run again, for example after a restart.",
      inputSchema: { runId },
      annotations: { readOnlyHint: true },
    },
    async ({ runId: id }) => guard(async () => serve(await engine.next(id))),
  );

  server.registerTool(
    "workflow_submit",
    {
      description:
        "Submit the output for the open step. Returns `accepted` with the next step, or `rejected` with errors by JSON path.",
      inputSchema: {
        runId,
        stepId: z.string().min(1).describe("The stepId of the step being answered"),
        output: z
          .union([z.record(z.string(), z.unknown()), z.string()])
          .describe("JSON object matching the step's outputSchema"),
      },
    },
    async ({ runId: id, stepId, output }) => guard(() => submit(id, stepId, parseOutput(output))),
  );

  server.registerTool(
    "workflow_status",
    { description: "Status of a run: state, finished steps and outputs.", inputSchema: { runId }, annotations: { readOnlyHint: true } },
    async ({ runId: id }) => guard(() => engine.status(id)),
  );

  server.registerTool(
    "workflow_cancel",
    { description: "Cancel a running workflow.", inputSchema: { runId } },
    async ({ runId: id }) => guard(() => engine.cancel(id)),
  );

  // One prompt per workflow, shown as a slash command by hosts that support MCP prompts.
  for (const wf of engine.list()) {
    server.registerPrompt(
      wf.id,
      { description: wf.description, argsSchema: { inputs: z.string().describe("Workflow inputs as JSON") } },
      ({ inputs }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Run the Agent-QA workflow "${wf.id}" with inputs ${inputs}. Call workflow_start, then follow the loop.\n\n${LOOP_INSTRUCTIONS}`,
            },
          },
        ],
      }),
    );
  }

  return server;
}
