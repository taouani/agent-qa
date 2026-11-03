import type { OutputError, Step, WorkflowEngine } from "../core/index.js";
import type { ModelDriver, ModelMessage, TokenUsage } from "./driver.js";

/**
 * Answers a run's generate steps with a driver until the run needs a person
 * (a confirm step) or ends. A rejected answer is retried with the errors, as
 * many times as the step allows; the engine counts the attempts.
 */

export interface StepUsage extends TokenUsage {
  stepId: string;
  attempt: number;
  model?: string;
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

const SYSTEM =
  "You are a step in a QA workflow. Answer with one JSON value that matches the schema exactly. " +
  "Values like <PERSON_1> are placeholders for masked personal data: keep them exactly as they are and never guess what they stand for.";

export async function drive(engine: WorkflowEngine, first: Step, driver: ModelDriver, options: DriveOptions = {}): Promise<DriveResult> {
  const used: StepUsage[] = [];
  let step = first;
  let history: ModelMessage[] = [];
  let historyFor = "";
  while (step.kind === "generate") {
    if (historyFor !== step.stepId) {
      history = [{ role: "user", content: prompt(step) }];
      historyFor = step.stepId;
    }
    const response = await driver.complete({
      ...(options.model ? { model: options.model } : {}),
      messages: [{ role: "system", content: SYSTEM }, ...history],
      schema: step.outputSchema,
      schemaName: step.stepId,
    });
    if (response.usage) {
      const entry: StepUsage = { stepId: step.stepId, attempt: step.attempt, ...response.usage, ...(response.model ? { model: response.model } : {}) };
      used.push(entry);
      await options.onUsage?.(entry);
    }

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
      history = [...history, { role: "assistant", content: response.text }, { role: "user", content: retryPrompt(errors) }];
    }
    step = result.next;
  }
  return { step, usage: used };
}

function prompt(step: Step): string {
  return [step.instructions, step.context ? `Context:\n${step.context}` : ""].filter(Boolean).join("\n\n");
}

function retryPrompt(errors: OutputError[]): string {
  const lines = errors.slice(0, 50).map((e) => `- ${e.path}: ${e.message}`);
  if (errors.length > 50) lines.push(`- and ${errors.length - 50} more`);
  return `That answer was rejected:\n${lines.join("\n")}\n\nAnswer again with the whole corrected JSON.`;
}
