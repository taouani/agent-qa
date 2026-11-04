import type { z } from "zod";

/** Kinds of step a host model can be asked to answer. */
export type ActionStepKind = "generate" | "confirm";

/** All step kinds, including the two terminal ones. */
export type StepKind = ActionStepKind | "done" | "failed";

export type RunStatus = "running" | "done" | "failed" | "cancelled";

/** A validation error, addressed by JSON path into the submitted output. */
export interface OutputError {
  path: string;
  message: string;
}

/** What the core hands to a host (MCP) or driver (CLI) to answer. */
export interface Step {
  runId: string;
  stepId: string;
  kind: StepKind;
  /** Rendered prompt for the model. Empty for terminal steps. */
  instructions: string;
  /** Masked context only. Never real personal values. */
  context: string;
  /** JSON Schema the output must match. Absent for terminal steps. */
  outputSchema?: unknown;
  attempt: number;
  maxAttempts: number;
  /** For `failed` steps: why the run stopped. */
  errors?: OutputError[];
  /** For confirm steps whose yes must come from the person (`StepDefinition.approval`): the yes answer. */
  approval?: { yes: unknown };
}

export type SubmitResult =
  | { status: "accepted"; next: Step }
  | { status: "rejected"; errors: OutputError[]; attempt: number; maxAttempts: number; next: Step };

/** Read-only view a step gets of the run so far. */
export interface StepContext<I> {
  runId: string;
  inputs: I;
  /** Accepted outputs of earlier steps, keyed by step id. A batched step's output is an array, one entry per batch. */
  outputs: Readonly<Record<string, unknown>>;
  /** For a batched step: which batch this is, from 0. */
  batch?: number;
  /** For a batched step: how many batches it has. */
  batches?: number;
}

export interface StepDefinition<I = unknown, O = unknown> {
  id: string;
  kind: ActionStepKind;
  outputSchema: z.ZodType<O>;
  instructions: (ctx: StepContext<I>) => string;
  context?: (ctx: StepContext<I>) => string | Promise<string>;
  /** Defaults to the engine's maxAttempts (3). */
  maxAttempts?: number;
  /** Skip the step when this returns false (its output is then absent). */
  when?: (ctx: StepContext<I>) => boolean | Promise<boolean>;
  /**
   * Answer the step in this many parts, for work too big for one answer (one
   * batch of issues each). Each batch is its own step for the host, with the
   * id `{id}_{n}` from 1, and its own attempts. Must give the same number for
   * the same run. 0 skips the step; its output is then an empty array.
   */
  batches?: (ctx: StepContext<I>) => number | Promise<number>;
  /**
   * Checks the schema can't express, run after the output parses: for example
   * that every issue is answered once. Errors reject the answer like schema
   * errors do, and count as an attempt.
   */
  check?: (ctx: StepContext<I>, output: O) => OutputError[] | Promise<OutputError[]>;
  /**
   * Runs once the output passes the checks, before anything is saved, and
   * returns what is kept instead: for example the answer with personal data a
   * user dictated masked. The run state never holds the original.
   */
  sanitize?: (ctx: StepContext<I>, output: O) => O | Promise<O>;
  /**
   * The answer is a person's own words (a review), so error messages may echo
   * personal data. When the attempts run out, the run keeps only the paths.
   */
  personalAnswer?: boolean;
  /**
   * Fixed answers to a confirm step, for a front door with no host model (the
   * CLI): `yes` when the person accepts what the step shows, `no` when they
   * decline, and `unattended` (default `yes`) when nobody looked (`--yes`).
   */
  answers?: { yes: O; no: O; unattended?: O };
  /**
   * The step's yes must come from the person, not the host model (an outside
   * write). A host that can ask the user directly (MCP elicitation) does so
   * with `question`, and the person's answer replaces the model's. Needs `answers`.
   */
  approval?: {
    question: (ctx: StepContext<I>) => string | Promise<string>;
    /**
     * Only a person may say yes: without a way to ask them (no elicitation, or
     * a submit that says it isn't the person's own answer), a yes is refused,
     * never taken from the model. For a yes that lets Agent-QA run repo code.
     */
    personOnly?: boolean;
  };
  /**
   * Runs after the output is accepted, for example to write an artifact.
   * It must be safe to run twice: if saving the run state fails afterwards,
   * the step stays open and a retry runs it again.
   */
  onAccept?: (ctx: StepContext<I>, output: O) => void | Promise<void>;
}

export interface WorkflowDefinition<I = unknown> {
  id: string;
  description: string;
  inputSchema: z.ZodType<I>;
  /**
   * Runs once at start, after the inputs parse and the run id is known, before
   * anything is saved. Use it to replace input values that must not be stored
   * in the run folder (a JQL filter can name a person) with vault tokens.
   */
  prepareInputs?: (runId: string, inputs: I) => I | Promise<I>;
  // Steps differ in output type, so the list is typed loosely here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps: ReadonlyArray<StepDefinition<I, any>>;
}

/** Everything needed to resume a run after a restart. */
export interface RunState {
  runId: string;
  workflowId: string;
  status: RunStatus;
  inputs: unknown;
  /** Index into the workflow's steps of the open step. */
  stepIndex: number;
  /** Attempt number of the open step, starting at 1. */
  attempt: number;
  /** Batch of the open step, from 0, for batched steps. */
  batch?: number;
  /** Batch count of the open step, fixed when the step was entered. */
  batches?: number;
  outputs: Record<string, unknown>;
  /** Step ids already accepted; resubmitting one returns `accepted` with the current step. */
  accepted: Record<string, true>;
  failure?: OutputError[];
  createdAt: string;
  updatedAt: string;
}

/** Where run state lives. T8 adds the run-folder store; tests use memory. */
export interface StateStore {
  load(runId: string): Promise<RunState | undefined>;
  save(state: RunState): Promise<void>;
}
