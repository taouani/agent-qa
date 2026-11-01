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

export type EngineErrorCode = "UNKNOWN_WORKFLOW" | "INVALID_INPUTS" | "RUN_NOT_FOUND" | "STEP_MISMATCH" | "RUN_CLOSED";

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
    readonly errors: OutputError[] = [],
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

/**
 * The step state machine behind the MCP step protocol and the CLI runner.
 * One open step per run; every transition is saved before it is returned.
 */
export class WorkflowEngine {
  private readonly workflows = new Map<string, WorkflowDefinition<unknown>>();
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
    if (this.workflows.has(workflow.id)) throw new Error(`Workflow already registered: ${workflow.id}`);
    if (workflow.steps.length === 0) throw new Error(`Workflow has no steps: ${workflow.id}`);
    const ids = new Set(workflow.steps.map((s) => s.id));
    if (ids.size !== workflow.steps.length) throw new Error(`Duplicate step ids in workflow: ${workflow.id}`);
    this.workflows.set(workflow.id, workflow as WorkflowDefinition<unknown>);
    return this;
  }

  list(): Array<{ id: string; description: string; inputSchema: unknown }> {
    return [...this.workflows.values()].map((w) => ({
      id: w.id,
      description: w.description,
      inputSchema: z.toJSONSchema(w.inputSchema),
    }));
  }

  async start(workflowId: string, inputs: unknown): Promise<Step> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new EngineError("UNKNOWN_WORKFLOW", `Unknown workflow: ${workflowId}`);
    const parsed = workflow.inputSchema.safeParse(inputs);
    if (!parsed.success) {
      throw new EngineError("INVALID_INPUTS", `Invalid inputs for ${workflowId}`, toOutputErrors(parsed.error));
    }
    const timestamp = this.now().toISOString();
    const state: RunState = {
      runId: this.newRunId(workflowId, parsed.data),
      workflowId,
      status: "running",
      inputs: parsed.data,
      stepIndex: 0,
      attempt: 1,
      outputs: {},
      accepted: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (await this.store.load(state.runId)) throw new Error(`Run id collision: ${state.runId}`);
    await this.store.save(state);
    return this.render(workflow, state);
  }

  /** The current step again, for a host that restarted. */
  async next(runId: string): Promise<Step> {
    const { workflow, state } = await this.load(runId);
    return this.render(workflow, state);
  }

  async submit(runId: string, stepId: string, output: unknown): Promise<SubmitResult> {
    return this.withLock(runId, async () => {
      const { workflow, state } = await this.load(runId);

      const previous = state.accepted[stepId];
      if (previous) return previous;

      if (state.status !== "running") {
        throw new EngineError("RUN_CLOSED", `Run ${runId} is ${state.status}`);
      }
      const def = this.currentStep(workflow, state);
      if (def.id !== stepId) {
        throw new EngineError("STEP_MISMATCH", `Open step is ${def.id}, not ${stepId}`);
      }

      const parsed = def.outputSchema.safeParse(output);
      if (!parsed.success) {
        const errors = toOutputErrors(parsed.error);
        const max = def.maxAttempts ?? this.maxAttempts;
        const attempt = state.attempt;
        if (attempt >= max) {
          state.status = "failed";
          state.failure = errors;
        } else {
          state.attempt = attempt + 1;
        }
        await this.save(state);
        return { status: "rejected", errors, attempt, maxAttempts: max, next: await this.render(workflow, state) };
      }

      await def.onAccept?.(this.ctx(state), parsed.data);
      state.outputs[def.id] = parsed.data;
      state.stepIndex += 1;
      state.attempt = 1;
      if (state.stepIndex >= workflow.steps.length) state.status = "done";
      const result: SubmitResult = { status: "accepted", next: await this.render(workflow, state) };
      state.accepted[stepId] = result;
      await this.save(state);
      return result;
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

  private async load(runId: string): Promise<{ workflow: WorkflowDefinition<unknown>; state: RunState }> {
    const state = await this.store.load(runId);
    if (!state) throw new EngineError("RUN_NOT_FOUND", `Unknown run: ${runId}`);
    const workflow = this.workflows.get(state.workflowId);
    if (!workflow) throw new EngineError("UNKNOWN_WORKFLOW", `Run ${runId} uses unregistered workflow ${state.workflowId}`);
    return { workflow, state };
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

  private async render(workflow: WorkflowDefinition<unknown>, state: RunState): Promise<Step> {
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
      context: (await def.context?.(ctx)) ?? "",
      outputSchema: z.toJSONSchema(def.outputSchema),
      attempt: state.attempt,
      maxAttempts: def.maxAttempts ?? this.maxAttempts,
    };
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
