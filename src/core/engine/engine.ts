import { randomBytes } from "node:crypto";
import { z } from "zod";
import type {
  OutputError,
  RunState,
  StateStore,
  Step,
  StepContext,
  StepDefinition,
  SubmitResult,
  WorkflowDefinition,
} from "./types.js";

export type EngineErrorCode =
  | "UNKNOWN_WORKFLOW"
  | "INVALID_WORKFLOW"
  | "INVALID_INPUTS"
  | "RUN_NOT_FOUND"
  | "RUN_COLLISION"
  | "STEP_MISMATCH"
  | "RUN_CLOSED"
  | "CONTEXT_FAILED";

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
    readonly errors: OutputError[] = [],
    /** The run the error is about, when there is one (CONTEXT_FAILED from start). */
    readonly runId?: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export interface EngineOptions {
  store: StateStore;
  /** Default attempts per step before the run fails. */
  maxAttempts?: number;
  /** Creates run IDs. T8 replaces the default with `{date}-{context}-{id}`. */
  newRunId?: (workflowId: string, inputs: unknown) => string;
  now?: () => Date;
}

/** Convert zod issues to `{ path, message }` with a JSON-pointer-like path. */
export function toOutputErrors(error: z.ZodError): OutputError[] {
  return error.issues.map((issue) => ({
    path: issue.path.length === 0 ? "$" : "$." + issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/** Step ids the engine uses for terminal steps. */
const RESERVED_STEP_IDS = new Set(["done", "failed", "cancelled"]);

/** JSON Schema for what the model must write: the schema's input side. */
function jsonSchemaOf(schema: z.ZodType, where: string): unknown {
  try {
    return z.toJSONSchema(schema, { io: "input" });
  } catch (error) {
    throw new EngineError("INVALID_WORKFLOW", `${where}: schema can't be converted to JSON Schema (${(error as Error).message})`);
  }
}

interface Registered {
  workflow: WorkflowDefinition<unknown>;
  inputSchema: unknown;
  outputSchemas: Map<string, unknown>;
}

/**
 * The step state machine behind the MCP step protocol and the CLI runner.
 * One open step per run; every transition is saved before it is returned.
 */
export class WorkflowEngine {
  private readonly workflows = new Map<string, Registered>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly store: StateStore;
  private readonly maxAttempts: number;
  private readonly newRunId: (workflowId: string, inputs: unknown) => string;
  private readonly now: () => Date;

  constructor(options: EngineOptions) {
    this.store = options.store;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.newRunId = options.newRunId ?? (() => randomBytes(4).toString("hex"));
    this.now = options.now ?? (() => new Date());
  }

  register<I>(workflow: WorkflowDefinition<I>): this {
    const invalid = (message: string) => new EngineError("INVALID_WORKFLOW", `${workflow.id}: ${message}`);
    if (this.workflows.has(workflow.id)) throw invalid("workflow already registered");
    if (workflow.steps.length === 0) throw invalid("workflow has no steps");
    const ids = new Set(workflow.steps.map((s) => s.id));
    if (ids.size !== workflow.steps.length) throw invalid("duplicate step ids");
    for (const id of ids) if (RESERVED_STEP_IDS.has(id)) throw invalid(`step id "${id}" is reserved`);
    // Convert every schema now, so a schema that can't be shown to a model fails at startup, not mid-run.
    const outputSchemas = new Map(workflow.steps.map((s) => [s.id, jsonSchemaOf(s.outputSchema, `${workflow.id}.${s.id}`)]));
    this.workflows.set(workflow.id, {
      workflow: workflow as WorkflowDefinition<unknown>,
      inputSchema: jsonSchemaOf(workflow.inputSchema, `${workflow.id} inputs`),
      outputSchemas,
    });
    return this;
  }

  list(): Array<{ id: string; description: string; inputSchema: unknown }> {
    return [...this.workflows.values()].map((r) => ({
      id: r.workflow.id,
      description: r.workflow.description,
      inputSchema: r.inputSchema,
    }));
  }

  async start(workflowId: string, inputs: unknown): Promise<Step> {
    const registered = this.workflows.get(workflowId);
    if (!registered) throw new EngineError("UNKNOWN_WORKFLOW", `Unknown workflow: ${workflowId}`);
    const { workflow } = registered;
    const parsed = workflow.inputSchema.safeParse(inputs);
    if (!parsed.success) {
      throw new EngineError("INVALID_INPUTS", `Invalid inputs for ${workflowId}`, toOutputErrors(parsed.error));
    }
    const timestamp = this.now().toISOString();
    const runId = this.newRunId(workflowId, parsed.data);
    // Before prepareInputs, so a colliding start writes nothing (prepareInputs may write the run's vault).
    if (await this.store.load(runId)) throw new EngineError("RUN_COLLISION", `Run id already exists: ${runId}`);
    const prepared = workflow.prepareInputs ? await workflow.prepareInputs(runId, parsed.data) : parsed.data;
    const state: RunState = {
      runId,
      workflowId,
      status: "running",
      inputs: prepared,
      stepIndex: 0,
      attempt: 1,
      outputs: {},
      accepted: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.store.save(state);
    return this.render(registered, state);
  }

  /** The current step again, for a host that restarted. */
  async next(runId: string): Promise<Step> {
    const { registered, state } = await this.load(runId);
    return this.render(registered, state);
  }

  async submit(runId: string, stepId: string, output: unknown): Promise<SubmitResult> {
    return this.withLock(runId, async () => {
      const { registered, state } = await this.load(runId);
      const { workflow } = registered;

      // Already accepted: same answer, but the next step reflects the run as it is now.
      if (state.accepted[stepId]) return { status: "accepted", next: await this.render(registered, state) };

      if (state.status !== "running") {
        throw new EngineError("RUN_CLOSED", `Run ${runId} is ${state.status}`);
      }
      const def = this.currentStep(workflow, state);
      if (def.id !== stepId) {
        throw new EngineError("STEP_MISMATCH", `Open step is ${def.id}, not ${stepId}`);
      }

      const parsed = def.outputSchema.safeParse(output);
      const errors = parsed.success ? await this.check(def, state, parsed.data) : toOutputErrors(parsed.error);
      if (!parsed.success || errors.length > 0) {
        const max = def.maxAttempts ?? this.maxAttempts;
        const attempt = state.attempt;
        if (attempt >= max) {
          state.status = "failed";
          state.failure = errors;
        } else {
          state.attempt = attempt + 1;
        }
        await this.save(state);
        const next = await this.renderAfter(registered, state, "rejected", errors);
        return { status: "rejected", errors, attempt, maxAttempts: max, next };
      }

      await def.onAccept?.(this.ctx(state), parsed.data);
      state.outputs[def.id] = parsed.data;
      state.stepIndex += 1;
      state.attempt = 1;
      if (state.stepIndex >= workflow.steps.length) state.status = "done";
      state.accepted[stepId] = true;
      await this.save(state);
      return { status: "accepted", next: await this.renderAfter(registered, state, "accepted", []) };
    });
  }

  async status(runId: string): Promise<RunState> {
    return (await this.load(runId)).state;
  }

  async cancel(runId: string): Promise<RunState> {
    return this.withLock(runId, async () => {
      const { state } = await this.load(runId);
      if (state.status === "running") {
        state.status = "cancelled";
        await this.save(state);
      }
      return state;
    });
  }

  private async load(runId: string): Promise<{ registered: Registered; state: RunState }> {
    const state = await this.store.load(runId);
    if (!state) throw new EngineError("RUN_NOT_FOUND", `Unknown run: ${runId}`);
    const registered = this.workflows.get(state.workflowId);
    if (!registered) throw new EngineError("UNKNOWN_WORKFLOW", `Run ${runId} uses unregistered workflow ${state.workflowId}`);
    return { registered, state };
  }

  private async save(state: RunState): Promise<void> {
    state.updatedAt = this.now().toISOString();
    await this.store.save(state);
  }

  private currentStep(workflow: WorkflowDefinition<unknown>, state: RunState): StepDefinition<unknown, unknown> {
    const def = workflow.steps[state.stepIndex];
    if (!def) throw new Error(`Run ${state.runId} has no step at index ${state.stepIndex}`);
    return def;
  }

  private ctx(state: RunState): StepContext<unknown> {
    return { runId: state.runId, inputs: state.inputs, outputs: { ...state.outputs } };
  }

  private async render({ workflow, outputSchemas }: Registered, state: RunState): Promise<Step> {
    const base = { runId: state.runId, instructions: "", context: "", attempt: 0, maxAttempts: 0 };
    if (state.status === "done") return { ...base, stepId: "done", kind: "done" };
    if (state.status === "cancelled") return { ...base, stepId: "cancelled", kind: "failed", errors: [{ path: "$", message: "Run cancelled" }] };
    if (state.status === "failed") return { ...base, stepId: "failed", kind: "failed", errors: state.failure ?? [] };
    const def = this.currentStep(workflow, state);
    const ctx = this.ctx(state);
    return {
      runId: state.runId,
      stepId: def.id,
      kind: def.kind,
      instructions: def.instructions(ctx),
      context: await this.context(def, ctx),
      outputSchema: outputSchemas.get(def.id),
      attempt: state.attempt,
      maxAttempts: def.maxAttempts ?? this.maxAttempts,
    };
  }

  /** The step's own checks. A check that can't run (its data is unreachable) uses no attempt. */
  private async check(def: StepDefinition<unknown, unknown>, state: RunState, output: unknown): Promise<OutputError[]> {
    if (!def.check) return [];
    try {
      return await def.check(this.ctx(state), output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new EngineError("CONTEXT_FAILED", `Run ${state.runId}, step ${def.id}: the answer couldn't be checked (${message}). Nothing was used up: fix the cause and submit again.`, [], state.runId);
    }
  }

  /** The next step after a saved submit. If its context fails, say what happened to the answer. */
  private async renderAfter(registered: Registered, state: RunState, outcome: "accepted" | "rejected", errors: OutputError[]): Promise<Step> {
    try {
      return await this.render(registered, state);
    } catch (error) {
      if (!(error instanceof EngineError) || error.code !== "CONTEXT_FAILED") throw error;
      const said = outcome === "accepted" ? "The answer was accepted and saved. " : "The answer was rejected (see errors). ";
      throw new EngineError("CONTEXT_FAILED", said + error.message, errors, state.runId);
    }
  }

  /** The step's context. A failure (Jira unreachable, say) leaves the run open: `next` tries again. */
  private async context(def: StepDefinition<unknown, unknown>, ctx: StepContext<unknown>): Promise<string> {
    try {
      return (await def.context?.(ctx)) ?? "";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new EngineError("CONTEXT_FAILED", `Run ${ctx.runId}, step ${def.id}: ${message}. Fix the cause, then call workflow_next to try again.`, [], ctx.runId);
    }
  }

  /** Serialize operations on one run so concurrent submits can't race. */
  private async withLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(runId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const settled = run.catch(() => undefined);
    this.locks.set(runId, settled);
    try {
      return await run;
    } finally {
      if (this.locks.get(runId) === settled) this.locks.delete(runId);
    }
  }
}
