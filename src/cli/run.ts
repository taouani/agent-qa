import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { ConfigError, EngineError, loadConfig, PolicyDenied, RunStore, WorkflowEngine, type Config, type Mode, type Step } from "../core/index.js";
import { DataAccess, secretSources } from "../data/index.js";
import { ApiDriver, drive, DriveError, ModelConfigError, type ModelDriver, type StepUsage } from "../llm/index.js";
import { builtinWorkflows } from "../workflows/index.js";

/**
 * `agent-qa run` (S1-11): runs a workflow with the API driver, for a terminal
 * or CI. Generate steps go to the model. Confirm steps (the review, the Xray
 * push) take their fixed answers: `--yes` accepts every one unattended,
 * `--no <step>` declines one, and in a terminal the person is asked. With
 * nobody to ask, the run stops and can be resumed with `--resume`.
 *
 * Exit codes: 0 done, 1 the run failed, 2 bad setup or input, 3 the run
 * waits for a person.
 */

export const EXIT = { done: 0, failed: 1, setup: 2, waiting: 3 } as const;

export interface RunOptions {
  workflow?: string;
  resume?: string;
  key?: string;
  jql?: string;
  fromRun?: string;
  /** Inputs as JSON, for workflows the flags don't cover. */
  input?: string;
  model?: string;
  yes?: boolean;
  /** Confirm steps to decline, by id (e.g. `push`). */
  no?: string[];
  /** CI mode: `ask` write rules are denied and nobody is asked. Default: when `CI` is set. */
  ci?: boolean;
  root: string;
  env: NodeJS.ProcessEnv;
  /** Progress and questions; default stderr. */
  log?: (line: string) => void;
  /** Asks the person a yes/no question; default a terminal prompt when stdin is a TTY. */
  ask?: (question: string) => Promise<boolean>;
  /** Replaces the API driver, for tests. */
  driver?: ModelDriver;
  /** Replaces the data access options, for tests. */
  data?: (base: ConstructorParameters<typeof DataAccess>[0]) => DataAccess;
}

class SetupError extends Error {}

const defaultLog = (line: string) => void process.stderr.write(`${line}\n`);

async function terminalAsk(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

function inputsOf(opts: RunOptions): unknown {
  const given = [opts.key, opts.jql, opts.fromRun, opts.input].filter((v) => v !== undefined).length;
  if (given !== 1) throw new SetupError("give exactly one of --key, --jql, --from-run or --input");
  if (opts.key !== undefined) return { key: opts.key };
  if (opts.jql !== undefined) return { jql: opts.jql };
  if (opts.fromRun !== undefined) return { requirementsRun: opts.fromRun };
  try {
    return JSON.parse(opts.input!) as unknown;
  } catch {
    throw new SetupError("--input must be JSON, e.g. '{\"key\":\"ABC-1\"}'");
  }
}

function usageLine(u: StepUsage): string {
  const cached = u.cachedInputTokens ? ` (${u.cachedInputTokens} cached)` : "";
  return `  ${u.stepId} attempt ${u.attempt}: ${u.inputTokens} in${cached}, ${u.outputTokens} out${u.model ? `, ${u.model}` : ""}`;
}

/** Runs or resumes a workflow; resolves to the exit code. Never prints personal data: steps and errors hold masked text only. */
export async function runCommand(opts: RunOptions): Promise<number> {
  const log = opts.log ?? defaultLog;
  const ci = opts.ci ?? Boolean(opts.env.CI);
  const ask = opts.ask ?? (process.stdin.isTTY && !ci ? terminalAsk : undefined);
  try {
    if (!opts.workflow === !opts.resume) throw new SetupError("give a workflow to start, or --resume <runId>, not both");
    let config: Config;
    try {
      config = (await loadConfig(opts.root)).config;
    } catch (error) {
      if (error instanceof ConfigError) throw new SetupError(error.code === "NOT_FOUND" ? "no agent-qa.yaml here: run agent-qa init first, or pass --cwd" : error.message.split(opts.root).join("."));
      throw error;
    }
    if (!opts.driver && !config.models) throw new SetupError("agent-qa.yaml has no models section: set models.default, e.g. anthropic:<model-id>");

    const mode: Mode = ci ? "ci" : "ide";
    const runs = new RunStore(opts.env.AGENT_QA_RUNS_DIR || join(opts.root, ".agent-qa", "runs"));
    const engine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api", ...(opts.model ? { model: opts.model } : {}) }), newRunId: runs.newRunId });
    const base = { root: opts.root, store: runs, env: opts.env, config, mode };
    const data = opts.data ? opts.data(base) : new DataAccess(base);
    for (const workflow of builtinWorkflows({ data, runs })) engine.register(workflow);
    const driver = opts.driver ?? new ApiDriver({ models: config.models!, secrets: secretSources(opts.env) });

    let step: Step;
    if (opts.resume) {
      step = await engine.next(opts.resume);
      log(`Resuming run ${step.runId} at ${step.stepId}`);
    } else {
      step = await engine.start(opts.workflow!, inputsOf(opts));
      log(`Run ${step.runId} (${opts.workflow})`);
    }
    const workflowId = (await engine.status(step.runId)).workflowId;
    const model = opts.model ?? config.models?.workflows?.[workflowId];
    const folder = relative(opts.root, join(runs.root, step.runId)) || ".";

    let last = step.stepId;
    for (;;) {
      if (step.kind === "generate" || step.kind === "confirm") last = step.stepId;
      if (step.kind === "generate") {
        log(`- ${step.stepId}: asking the model`);
        step = (await drive(engine, step, driver, { ...(model ? { model } : {}), onUsage: (u) => log(usageLine(u)) })).step;
        continue;
      }
      if (step.kind === "done") {
        const files = (await readdir(join(runs.root, step.runId))).filter((f) => f !== "steps" && f !== "run.json").sort();
        log(`Done. Run folder: ${folder}${files.length ? `\n${files.map((f) => `  ${f}`).join("\n")}` : ""}`);
        return EXIT.done;
      }
      if (step.kind === "failed") {
        log(`Run ${step.runId} failed at ${last}:`);
        for (const e of step.errors ?? []) log(`  ${e.path}: ${e.message}`);
        return EXIT.failed;
      }

      // A confirm step: a fixed answer, chosen by the flags or the person.
      let choice: "yes" | "no" | "unattended" | undefined;
      if (opts.no?.includes(step.stepId)) choice = "no";
      else if (opts.yes) choice = "unattended";
      else if (ask) {
        log(`\n${step.instructions}\n\n${step.context}\n\nThe run folder is ${folder}.`);
        choice = (await ask(`${step.stepId}: accept?`)) ? "yes" : "no";
      }
      const answer = choice ? await engine.fixedAnswer(step.runId, choice) : undefined;
      if (answer === undefined) {
        log(`Run ${step.runId} waits at ${step.stepId}, a step for a person.`);
        log(`Answer it in your IDE, or run: agent-qa run --resume ${step.runId} with --yes or --no ${step.stepId}`);
        return EXIT.waiting;
      }
      log(`- ${step.stepId}: ${choice === "no" ? "declined" : choice === "unattended" ? "accepted (--yes)" : "accepted"}`);
      const result = await engine.submit(step.runId, step.stepId, answer);
      if (result.status === "rejected") {
        log(`The fixed answer to ${step.stepId} was rejected:`);
        for (const e of result.errors) log(`  ${e.path}: ${e.message}`);
        return EXIT.failed;
      }
      step = result.next;
    }
  } catch (error) {
    if (error instanceof SetupError || error instanceof ModelConfigError) {
      log(`agent-qa run: ${error.message}`);
      return EXIT.setup;
    }
    if (error instanceof EngineError && ["UNKNOWN_WORKFLOW", "INVALID_INPUTS", "RUN_NOT_FOUND"].includes(error.code)) {
      log(`agent-qa run: ${error.message}`);
      for (const e of error.errors) log(`  ${e.path}: ${e.message}`);
      return EXIT.setup;
    }
    if (error instanceof DriveError || error instanceof PolicyDenied || error instanceof EngineError) {
      log(`agent-qa run: ${error.message}`);
      return EXIT.failed;
    }
    throw error;
  }
}
