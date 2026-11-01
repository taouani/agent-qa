import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { EngineError, VERSION, type WorkflowEngine } from "../core/index.js";

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
      ? { error: error.code, message: error.message, errors: error.errors }
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

/** Build the MCP server for one engine. The transport is chosen by the caller. */
export function createMcpServer(engine: WorkflowEngine): McpServer {
  const server = new McpServer({ name: "agent-qa", version: VERSION }, { instructions: LOOP_INSTRUCTIONS });

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
    async ({ workflow, inputs }) => guard(() => engine.start(workflow, parseOutput(inputs))),
  );

  server.registerTool(
    "workflow_next",
    {
      description: "Return the current step of a run again, for example after a restart.",
      inputSchema: { runId },
      annotations: { readOnlyHint: true },
    },
    async ({ runId: id }) => guard(() => engine.next(id)),
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
    async ({ runId: id, stepId, output }) => guard(() => engine.submit(id, stepId, parseOutput(output))),
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
