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
    // Batched steps are shown as `{id}_{n}`, so no step id may look like one.
    for (const id of ids) if (/_\d+$/.test(id)) throw invalid(`step id "${id}" can't end in _<number>`);
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
    await this.advance(workflow, state);
    await this.store.save(state);
    return this.render(registered, state);
  }

  /**
   * The open confirm step's fixed answer (see `StepDefinition.answers`), or
   * undefined when the step has none or isn't a confirm step.
   */
  async fixedAnswer(runId: string, choice: "yes" | "no" | "unattended"): Promise<unknown> {
    const { registered, state } = await this.load(runId);
    if (state.status !== "running") return undefined;
    const def = this.currentStep(registered.workflow, state);
    if (def.kind !== "confirm" || !def.answers) return undefined;
    return choice === "unattended" ? (def.answers.unattended ?? def.answers.yes) : def.answers[choice];
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
      const { batch, batches } = await this.batchOf(def, state);
      const openId = this.openId(def, batch, batches);
      if (openId !== stepId) {
        throw new EngineError("STEP_MISMATCH", `Open step is ${openId}, not ${stepId}`);
      }

      const parsed = def.outputSchema.safeParse(output);
      const errors = parsed.success ? await this.check(def, state, parsed.data) : toOutputErrors(parsed.error);
      if (!parsed.success || errors.length > 0) {
        const max = def.maxAttempts ?? this.maxAttempts;
        const attempt = state.attempt;
        if (attempt >= max) {
          state.status = "failed";
          // A person's answer can be echoed in the messages; keep only where it went wrong.
          state.failure = def.personalAnswer ? errors.map((e) => ({ path: e.path, message: "rejected (details not kept: the answer may hold personal data)" })) : errors;
        } else {
          state.attempt = attempt + 1;
        }
        await this.save(state);
        const next = await this.renderAfter(registered, state, "rejected", errors);
        return { status: "rejected", errors, attempt, maxAttempts: max, next };
      }

      const stepCtx = def.batches ? this.ctx(state, batch, batches) : this.ctx(state);
      const kept = def.sanitize ? await this.guarded(state, def, "the answer couldn't be prepared", () => def.sanitize!(stepCtx, parsed.data)) : parsed.data;
      await def.onAccept?.(stepCtx, kept);
      if (def.batches) {
        const parts = [...((state.outputs[def.id] as unknown[] | undefined) ?? [])];
        parts[batch] = kept;
        state.outputs[def.id] = parts;
      } else {
        state.outputs[def.id] = kept;
      }
      state.attempt = 1;
      if (batch + 1 < batches) {
        state.batch = batch + 1;
      } else {
        delete state.batch;
        delete state.batches;
        state.stepIndex += 1;
        await this.advance(workflow, state);
      }
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

  /** Runs workflow code whose failure means its data is unreachable: CONTEXT_FAILED, nothing used up. */
  private async guarded<T>(state: RunState, def: StepDefinition<unknown, unknown>, what: string, fn: () => T | Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof EngineError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new EngineError("CONTEXT_FAILED", `Run ${state.runId}, step ${def.id}: ${what} (${message}). Nothing was used up: fix the cause and try again.`, [], state.runId);
    }
  }

  /** Move past steps that don't apply (`when` false, or no batches); end the run after the last step. */
  private async advance(workflow: WorkflowDefinition<unknown>, state: RunState): Promise<void> {
    while (state.stepIndex < workflow.steps.length) {
      const def = workflow.steps[state.stepIndex]!;
      const ctx = this.ctx(state);
      if (def.when && !(await this.guarded(state, def, "can't tell whether the step applies", () => def.when!(ctx)))) {
        state.stepIndex += 1;
        continue;
      }
      if (def.batches) {
        // The count is fixed when the step is entered, so a changing source can't re-open a batch.
        const batches = Math.floor(await this.guarded(state, def, "can't count the batches", () => def.batches!(ctx)));
        if (batches <= 0) {
          state.outputs[def.id] = [];
          state.stepIndex += 1;
          continue;
        }
        state.batches = batches;
      }
      return;
    }
    state.status = "done";
  }

  private async batchOf(def: StepDefinition<unknown, unknown>, state: RunState): Promise<{ batch: number; batches: number }> {
    if (!def.batches) return { batch: 0, batches: 1 };
    const batches = state.batches ?? Math.max(1, Math.floor(await this.guarded(state, def, "can't count the batches", () => def.batches!(this.ctx(state)))));
    return { batch: Math.min(state.batch ?? 0, batches - 1), batches };
  }

  /** The id the host sees: the step id, or `{id}_{n}` for a batched step. */
  private openId(def: StepDefinition<unknown, unknown>, batch: number, batches: number): string {
    return def.batches && batches > 1 ? `${def.id}_${batch + 1}` : def.id;
  }

  private ctx(state: RunState, batch?: number, batches?: number): StepContext<unknown> {
    return {
      runId: state.runId,
      inputs: state.inputs,
      outputs: { ...state.outputs },
      ...(batch !== undefined ? { batch } : {}),
      ...(batches !== undefined ? { batches } : {}),
    };
  }

  private async render({ workflow, outputSchemas }: Registered, state: RunState): Promise<Step> {
    const base = { runId: state.runId, instructions: "", context: "", attempt: 0, maxAttempts: 0 };
    if (state.status === "done") return { ...base, stepId: "done", kind: "done" };
    if (state.status === "cancelled") return { ...base, stepId: "cancelled", kind: "failed", errors: [{ path: "$", message: "Run cancelled" }] };
    if (state.status === "failed") return { ...base, stepId: "failed", kind: "failed", errors: state.failure ?? [] };
    const def = this.currentStep(workflow, state);
    const { batch, batches } = await this.batchOf(def, state);
    const ctx = def.batches ? this.ctx(state, batch, batches) : this.ctx(state);
    return {
      runId: state.runId,
      stepId: this.openId(def, batch, batches),
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
      const { batch, batches } = await this.batchOf(def, state);
      return await def.check(def.batches ? this.ctx(state, batch, batches) : this.ctx(state), output);
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
