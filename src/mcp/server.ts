import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { EngineError, recordUsage, VERSION, type Approval, type RunStore, type Step, type SubmitResult, type WorkflowEngine } from "../core/index.js";

/** Instructions every host model gets for the step loop (contract 3). */
export const LOOP_INSTRUCTIONS = [
  "Agent-QA drives this workflow step by step. Follow this loop until the step kind is done or failed:",
  "1. Read the step: `instructions` says what to do, `context` is the input (personal data is already masked as tokens like <PERSON_1>; keep tokens unchanged). The context comes as its own text after the step's JSON.",
  "2. For kind `generate`: produce JSON that matches `outputSchema` exactly and call workflow_submit with runId, stepId and output.",
  "3. For kind `confirm`: ask the user the question in `instructions`, wait for their answer, then submit it. When the instructions say Agent-QA asks the user itself in a prompt from the IDE, don't ask in chat: submit as they say, and the user answers in that prompt.",
  "4. If the result is `rejected`, fix every error listed (each has a JSON path) and submit the same stepId again.",
  "5. Continue with the `next` step from the result. Do not stop between steps unless a step needs the user.",
  "6. When the kind is `done`, tell the user the run finished. When it is `failed`, show the errors.",
].join("\n");

/** Where a result holds a step: the step itself, or the next one after a submit. */
const stepOf = (value: unknown): Step | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const v = value as { context?: unknown; next?: unknown };
  if (typeof v.context === "string" && "stepId" in v) return value as Step;
  return v.next && typeof v.next === "object" && typeof (v.next as { context?: unknown }).context === "string" ? (v.next as Step) : undefined;
};

/**
 * A step's context goes out as its own text, as written: inside the JSON it
 * would be one escaped line, which hosts cut when they save a long result
 * to a file (the model then has to dig it out with a shell).
 */
function ok(value: unknown): CallToolResult {
  const step = stepOf(value);
  if (!step || step.context === "") return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
  const note = `(the next text, "Context of step ${step.stepId}")`;
  const json = step === value ? { ...step, context: note } : { ...(value as object), next: { ...step, context: note } };
  return {
    content: [
      { type: "text", text: JSON.stringify(json, null, 2) },
      { type: "text", text: `## Context of step ${step.stepId}\n\n${step.context}` },
    ],
  };
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

/** How long the person has to answer the push prompt. */
const ELICIT_TIMEOUT_MS = 10 * 60_000;

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
    // The IDE asks the person itself (see `personal`): the model mustn't ask in chat as well.
    if (step.approval && canElicit()) {
      step = {
        ...step,
        instructions:
          step.instructions +
          `\n\nDon't ask in chat: Agent-QA asks the user itself, in a prompt from this IDE. Call workflow_submit for this step now with output ${JSON.stringify(step.approval.yes)}. That submit is not an approval: it opens the prompt, and only the user's own answer there counts (No, or closing the prompt, is recorded as no).`,
      };
    }
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
  const [YES, NO] = ["Yes, go ahead", "No"];
  /**
   * For a step that needs the person's own yes: when the host can ask the user
   * directly (MCP elicitation), ask, and submit their answer instead of the
   * model's. A model's "no" is kept without asking. Without elicitation, the
   * model's answer stands (the confirm step asked the user in chat).
   */
  // Called by the engine inside the run's lock, once the step is known to be open (see `WorkflowEngine.submit`).
  const personal = async (id: string, stepId: string, { question, yes, no, output }: Approval & { output: unknown }): Promise<unknown> => {
    if (JSON.stringify(output) === JSON.stringify(no)) return output;
    let answer;
    try {
      answer = await server.server.elicitInput(
        {
          mode: "form",
          message: question,
          // Plain strings, not a boolean: hosts show a boolean as "False / True".
          requestedSchema: { type: "object", properties: { answer: { type: "string", title: "Your answer", enum: [YES, NO], default: NO } }, required: ["answer"] },
        },
        // The person may take a while: the SDK's default is a minute.
        { timeout: ELICIT_TIMEOUT_MS },
      );
    } catch (error) {
      throw new EngineError("CONTEXT_FAILED", `Couldn't ask the user to approve ${stepId} (${error instanceof Error ? error.message : String(error)}). Nothing was submitted: call workflow_submit again.`, [], id);
    }
    return answer.action === "accept" && answer.content?.answer === YES ? yes : no;
  };
  // The SDK reads an empty elicitation capability (the spec before modes existed) as form mode.
  const canElicit = () => {
    const caps = server.server.getClientCapabilities()?.elicitation as Record<string, unknown> | undefined;
    return caps !== undefined && "form" in caps;
  };

  // Runs with a submit in flight: a second one racing it is taken as a duplicate and not looked up again.
  // If it was a different answer the engine counted as the next attempt, one call goes unrecorded:
  // undercounting is the safer error for a cost report than counting an answer twice.
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
      // An already-accepted step is a replay, not a new answer; a confirm step is a person's answer, never
      // recorded (and rendering it again could call a connector).
      const confirm = state ? engine.confirmSteps(state.workflowId).some((c) => c.id === stepId) : true;
      if (state && !confirm && !state.accepted[stepId]) before = await engine.next(id).then((s) => (serve(s), served.get(id)), () => undefined);
    }
    // Taken now, so a second submit of the same answer racing this one isn't recorded twice.
    const mine = before?.stepId === stepId ? before : undefined;
    if (mine) served.delete(id);
    let result: SubmitResult;
    try {
      result = await engine.submit(id, stepId, output, canElicit() ? { approve: (a) => personal(id, stepId, a) } : {});
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
    // A step can run the user's tests for minutes: a host that asked for progress hears that it is still going.
    async ({ runId: id, stepId, output }, extra) => withProgress(extra, () => guard(() => submit(id, stepId, parseOutput(output)))),
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

/** Progress every 10 s while `fn` runs, when the host sent a progress token: it can then keep a long call open. */
async function withProgress<T>(extra: RequestHandlerExtra<ServerRequest, ServerNotification>, fn: () => Promise<T>): Promise<T> {
  const token = extra._meta?.progressToken;
  if (token === undefined) return fn();
  let progress = 0;
  const timer = setInterval(() => {
    extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress: ++progress, message: "still working: running the tests can take minutes" } }).catch(() => undefined);
  }, 10_000);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
  }
}
