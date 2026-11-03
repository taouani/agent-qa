import type { OutputError, Step, WorkflowEngine } from "../core/index.js";
import type { ModelDriver, ModelMessage, TokenUsage } from "./driver.js";

/**
 * Answers a run's generate steps with a driver until the run needs a person
 * (a confirm step) or ends. A rejected answer is retried with the errors, as
 * many times as the step allows; the engine counts the attempts.
 *
 * The prompt always carries the step's JSON Schema, so a provider that can't
 * enforce it (JSON mode only) still knows the shape. A retry sends the first
 * prompt, the last answer and its errors, not every earlier answer.
 */

/** One model call. Tokens are absent when the driver didn't report them. */
export interface StepUsage extends Partial<TokenUsage> {
  stepId: string;
  attempt: number;
  model?: string;
  /** Characters sent (every message) and received, for the cost report. */
  promptChars: number;
  answerChars: number;
}

export interface DriveOptions {
  /** `provider:model` for every step; otherwise the driver's default. */
  model?: string;
  /** Called after each model call, e.g. for the cost report. */
  onUsage?: (usage: StepUsage) => void | Promise<void>;
}

export interface DriveResult {
  /** The step the run stopped at: confirm, done or failed. */
  step: Step;
  usage: StepUsage[];
}

/** A driver call failed; `usage` holds what the run had used before it. */
export class DriveError extends Error {
  constructor(
    readonly step: Step,
    readonly usage: StepUsage[],
    options: { cause: unknown },
  ) {
    super(`Model call failed at step ${step.stepId}: ${options.cause instanceof Error ? options.cause.message : String(options.cause)}`, options);
    this.name = "DriveError";
  }
}

const SYSTEM =
  "You are a step in a QA workflow. Answer with one JSON value that matches the schema exactly. " +
  "Values like <PERSON_1> are placeholders for masked personal data: keep them exactly as they are and never guess what they stand for.";

export async function drive(engine: WorkflowEngine, first: Step, driver: ModelDriver, options: DriveOptions = {}): Promise<DriveResult> {
  const used: StepUsage[] = [];
  let step = first;
  let firstPrompt: ModelMessage = { role: "user", content: "" };
  let retry: ModelMessage[] = [];
  let historyFor = "";
  while (step.kind === "generate") {
    if (historyFor !== step.stepId) {
      firstPrompt = { role: "user", content: prompt(step) };
      retry = [];
      historyFor = step.stepId;
    }
    let response;
    const messages: ModelMessage[] = [{ role: "system", content: SYSTEM }, firstPrompt, ...retry];
    try {
      response = await driver.complete({
        ...(options.model ? { model: options.model } : {}),
        messages,
        schema: step.outputSchema,
        schemaName: step.stepId,
      });
    } catch (cause) {
      throw new DriveError(step, used, { cause });
    }
    const entry: StepUsage = {
      stepId: step.stepId,
      attempt: step.attempt,
      ...(response.usage ?? {}),
      ...(response.model ? { model: response.model } : {}),
      promptChars: messages.reduce((n, m) => n + m.content.length, 0),
      answerChars: response.text.length,
    };
    used.push(entry);
    await options.onUsage?.(entry);

    let output: unknown;
    let parseError: OutputError | undefined;
    try {
      output = JSON.parse(response.text);
    } catch {
      output = response.text;
      parseError = { path: "$", message: "the answer is not valid JSON" };
    }
    const result = await engine.submit(step.runId, step.stepId, output);
    if (result.status === "rejected") {
      const errors = parseError ? [parseError, ...result.errors] : result.errors;
      retry = [{ role: "assistant", content: response.text }, { role: "user", content: retryPrompt(errors) }];
    }
    step = result.next;
  }
  return { step, usage: used };
}

function prompt(step: Step): string {
  return [
    step.instructions,
    step.context ? `Context:\n${step.context}` : "",
    `Answer with JSON that matches this JSON Schema:\n${JSON.stringify(step.outputSchema)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function retryPrompt(errors: OutputError[]): string {
  const lines = errors.slice(0, 50).map((e) => `- ${e.path}: ${e.message}`);
  if (errors.length > 50) lines.push(`- and ${errors.length - 50} more`);
  return `That answer was rejected:\n${lines.join("\n")}\n\nAnswer again with the whole corrected JSON.`;
}
