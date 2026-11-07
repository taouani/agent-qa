import { isDeepStrictEqual } from "node:util";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  ConfigError,
  EngineError,
  loadConfig,
  modelAllowed,
  PolicyDenied,
  recordUsage,
  RunStore,
  RunStoreError,
  WorkflowEngine,
  type Config,
  type Mode,
  type Step,
  type UsageEntry,
} from "../core/index.js";
import { DataAccess, secretSources } from "../data/index.js";
import { ApiDriver, drive, DriveError, ModelConfigError, parseModelId, type ModelDriver, type StepUsage } from "../llm/index.js";
import { builtinWorkflows } from "../workflows/index.js";

/**
 * `agent-qa run` (S1-11): runs a workflow with the API driver, for a terminal
 * or CI. Generate steps go to the model. Confirm steps (the review, the Xray
 * push) take the workflow's fixed answers:
 *
 * - `--accept <step>`: the person's own yes, given up front;
 * - `--decline <step>`: no;
 * - `--yes`: every other confirm step is answered unattended, without
 *   asking. A step that writes outside the run (the push) declines when
 *   unattended, so a write always needs `--accept` or a yes typed in the
 *   terminal;
 * - otherwise a terminal asks the person, and with nobody to ask the run
 *   stops; `--resume` continues it.
 *
 * Exit codes: 0 done, 1 the run failed or stopped on an error (resumable when
 * it says so), 2 bad setup or input, 3 the run waits for a person.
 */

export const EXIT = { done: 0, failed: 1, setup: 2, waiting: 3 } as const;

export interface RunOptions {
  workflow?: string;
  resume?: string;
  key?: string;
  jql?: string;
  fromRun?: string;
  pushFrom?: string;
  /** Inputs as JSON, for workflows the flags don't cover. */
  input?: string;
  model?: string;
  yes?: boolean;
  /** Confirm steps the person accepts up front, by id (e.g. `push`). */
  accept?: string[];
  /** Confirm steps to decline, by id. */
  decline?: string[];
  /** CI mode: `ask` write rules are denied and nobody is asked. Default: when `CI` is set (not "false" or "0"). */
  ci?: boolean;
  root: string;
  env: NodeJS.ProcessEnv;
  /** Progress and questions; default stderr. */
  log?: (line: string) => void;
  /** Asks the person a yes/no question. Default: a terminal prompt when stdin and stderr are TTYs; `false` never asks. */
  ask?: ((question: string) => Promise<boolean | undefined>) | false;
  /** Replaces the API driver, for tests. */
  driver?: ModelDriver;
  /** Replaces the data access, for tests. */
  data?: (base: ConstructorParameters<typeof DataAccess>[0]) => DataAccess;
}

class SetupError extends Error {}

const defaultLog = (line: string) => void process.stderr.write(`${line}\n`);

/** The person's answer; undefined when they interrupted (Ctrl-C or Ctrl-D), which leaves the step open. */
async function terminalAsk(question: string): Promise<boolean | undefined> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } catch {
    return undefined;
  } finally {
    rl.close();
  }
}

const ciFromEnv = (env: NodeJS.ProcessEnv) => Boolean(env.CI) && !/^(false|0)$/i.test(env.CI!);

function inputsOf(opts: RunOptions): unknown {
  const given = [opts.key, opts.jql, opts.fromRun, opts.pushFrom, opts.input].filter((v) => v !== undefined).length;
  if (opts.resume) {
    if (given) throw new SetupError("--resume continues a run with its own inputs: leave out --key, --jql, --from-run, --push-from and --input");
    return undefined;
  }
  // The profile workflow reads the repo, so it needs no input.
  if (given === 0 && opts.workflow === "profile") return {};
  if (given !== 1) throw new SetupError("give exactly one of --key, --jql, --from-run, --push-from or --input");
  if (opts.key !== undefined) return { key: opts.key };
  if (opts.jql !== undefined) return { jql: opts.jql };
  if (opts.fromRun !== undefined) return { requirementsRun: opts.fromRun };
  if (opts.pushFrom !== undefined) return { casesRun: opts.pushFrom };
  try {
    return JSON.parse(opts.input!) as unknown;
  } catch {
    throw new SetupError("--input must be JSON, e.g. '{\"key\":\"ABC-1\"}'");
  }
}

function checkModel(id: string, config: Config): void {
  parseModelId(id);
  if (!modelAllowed(id, config.models?.allowed)) throw new SetupError(`${id} is not in models.allowed`);
}

function usageLine(u: StepUsage): string {
  if (u.inputTokens === undefined) return `  ${u.stepId} attempt ${u.attempt}: no token counts${u.model ? `, ${u.model}` : ""}`;
  const cached = u.cachedInputTokens ? ` (${u.cachedInputTokens} cached)` : "";
  return `  ${u.stepId} attempt ${u.attempt}: ${u.inputTokens} in${cached}, ${u.outputTokens ?? 0} out${u.model ? `, ${u.model}` : ""}`;
}

const usageEntry = (u: StepUsage, model: string | undefined): UsageEntry => {
  const { stepId, attempt, inputTokens, outputTokens, cachedInputTokens, promptChars, answerChars } = u;
  const m = u.model ?? model;
  return {
    at: new Date().toISOString(),
    stepId,
    attempt,
    driver: "api",
    ...(m ? { model: m } : {}),
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    promptChars,
    answerChars,
  };
};

/** Runs or resumes a workflow; resolves to the exit code. Steps and errors hold masked text only, and unknown errors print only their name and message. */
export async function runCommand(opts: RunOptions): Promise<number> {
  const log = opts.log ?? defaultLog;
  const ci = opts.ci ?? ciFromEnv(opts.env);
  const ask = opts.ask === false ? undefined : (opts.ask ?? (process.stdin.isTTY && process.stderr.isTTY && !ci ? terminalAsk : undefined));
  let runId: string | undefined;
  let engine: WorkflowEngine | undefined;
  let data: DataAccess | undefined;
  const saved = async (id: string) => engine!.status(id).then((s) => s, () => undefined);
  const resumeHint = async () => {
    if (runId && engine && (await saved(runId))?.status === "running") log(`The run is kept: fix the cause, then run agent-qa run --resume ${runId}`);
  };
  try {
    if (!opts.workflow === !opts.resume) throw new SetupError("give a workflow to start, or --resume <runId>, not both");
    const inputs = inputsOf(opts);
    let config: Config;
    try {
      config = (await loadConfig(opts.root)).config;
    } catch (error) {
      // Paths relative to the project, so the message doesn't show the user's home folder.
      if (error instanceof ConfigError) throw new SetupError(error.code === "NOT_FOUND" ? "no agent-qa.yaml here: run agent-qa init first, or pass --cwd" : error.message.split(error.file).join(relative(opts.root, error.file)));
      throw error;
    }

    const mode: Mode = ci ? "ci" : "ide";
    const runs = new RunStore(opts.env.AGENT_QA_RUNS_DIR || join(opts.root, ".agent-qa", "runs"));
    engine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api", ...(opts.model ? { model: opts.model } : {}) }), newRunId: runs.newRunId });
    const base = { root: opts.root, store: runs, env: opts.env, config, mode };
    data = opts.data ? opts.data(base) : new DataAccess(base);
    for (const workflow of builtinWorkflows({ data, runs })) engine.register(workflow);

    let workflowId: string;
    try {
      workflowId = opts.resume ? (await engine.status(opts.resume)).workflowId : opts.workflow!;
    } catch (error) {
      if (error instanceof RunStoreError) {
        const why = error.code === "NOT_FOUND" ? `no run ${opts.resume} in this project's run folder (check the id, or AGENT_QA_RUNS_DIR)` : error.message;
        throw new SetupError(`can't resume ${opts.resume}: ${why}`);
      }
      if (error instanceof EngineError && error.code === "RUN_NOT_FOUND") throw new SetupError(`can't resume ${opts.resume}: no run ${opts.resume} in this project's run folder, or it has no saved steps (check the id, or AGENT_QA_RUNS_DIR)`);
      throw error;
    }
    if (!opts.driver && !config.models && engine.usesModel(workflowId)) throw new SetupError("agent-qa.yaml has no models section: set models.default, e.g. anthropic:<model-id>");
    // Every flag names a real confirm step, so a typo can't let a step through.
    const confirms = engine.confirmSteps(workflowId);
    for (const id of [...(opts.accept ?? []), ...(opts.decline ?? [])]) {
      if (!confirms.some((c) => c.id === id)) throw new SetupError(`${workflowId} has no confirm step ${id}; its confirm steps are ${confirms.map((c) => c.id).join(", ") || "none"}`);
    }
    const both = (opts.accept ?? []).filter((id) => opts.decline?.includes(id));
    if (both.length) throw new SetupError(`${both.join(", ")} is both accepted and declined`);
    const model = opts.model ?? config.models?.workflows?.[workflowId];
    if (!opts.driver && model) checkModel(model, config);
    // No models section only when the workflow never asks a model (checked above).
    const driver = opts.driver ?? (config.models ? new ApiDriver({ models: config.models, secrets: secretSources(opts.env) }) : undefined);

    let step: Step;
    if (opts.resume) {
      runId = opts.resume;
      step = await engine.next(opts.resume);
      log(`Resuming run ${step.runId} at ${step.stepId}`);
    } else {
      step = await engine.start(workflowId, inputs);
      runId = step.runId;
      log(`Run ${step.runId} (${workflowId})`);
    }
    const folder = relative(opts.root, join(runs.root, step.runId)) || ".";

    let last = step.stepId;
    for (;;) {
      if (step.kind === "generate" || step.kind === "confirm") last = step.stepId;
      if (step.kind === "generate") {
        log(`- ${step.stepId}: asking the model`);
        // Each call is recorded as it happens, so cost@1 is right even when the run stops later.
        const id = step.runId;
        // A model the driver didn't name is the configured one only for the API driver; a custom driver's calls stay unpriced.
        const fallback = opts.driver ? undefined : (model ?? config.models?.default);
        const onUsage = async (u: StepUsage) => {
          log(usageLine(u));
          // The cost report must never stop a run: the answer is already paid for.
          await recordUsage(runs, id, [usageEntry(u, fallback)]).catch((error: unknown) => log(`  (cost not recorded: ${(error instanceof Error ? error.message : String(error)).split(opts.root).join(".")})`));
        };
        step = (await drive(engine, step, driver!, { ...(model ? { model } : {}), onUsage })).step;
        continue;
      }
      if (step.kind === "done") {
        const files = (await readdir(join(runs.root, step.runId))).filter((f) => f !== "steps" && f !== "run.json").sort();
        log(`Done. Run folder: ${folder}${files.length ? `\n${files.map((f) => `  ${f}`).join("\n")}` : ""}`);
        return EXIT.done;
      }
      if (step.kind === "failed") {
        log(`Run ${step.runId} ${step.stepId === "cancelled" ? "was cancelled" : `failed${last === "failed" ? "" : ` at ${last}`}`}:`);
        for (const e of step.errors ?? []) log(`  ${e.path}: ${e.message}`);
        return EXIT.failed;
      }

      // A confirm step: a fixed answer, chosen by the flags or the person.
      if (!confirms.find((c) => c.id === step.stepId)?.answers) {
        log(`Run ${step.runId} waits at ${step.stepId}, which only a host model can answer: continue it in your IDE.`);
        return EXIT.waiting;
      }
      let choice: "yes" | "no" | "unattended" | undefined;
      if (opts.decline?.includes(step.stepId)) choice = "no";
      else if (opts.accept?.includes(step.stepId)) choice = "yes";
      else if (opts.yes) choice = "unattended";
      else if (ask) {
        log(`\n${step.stepId}: please check this (in full in ${folder}):\n\n${step.context}\n`);
        const said = await ask(`${step.stepId}: accept?`);
        if (said !== undefined) choice = said ? "yes" : "no";
      }
      if (!choice) {
        log(`Run ${step.runId} waits at ${step.stepId}, a step for a person.`);
        log(`Answer it in your IDE, or run: agent-qa run --resume ${step.runId} --accept ${step.stepId} (or --decline ${step.stepId})`);
        return EXIT.waiting;
      }
      const answer = await engine.fixedAnswer(step.runId, choice);
      // Unattended, a step whose fixed answer is its "no" (approve: false, write: false...) is declined, whatever its fields.
      const unattendedNo = choice === "unattended" && answer !== undefined && isDeepStrictEqual(answer, await engine.fixedAnswer(step.runId, "no"));
      log(`- ${step.stepId}: ${choice === "no" ? "declined" : choice === "yes" ? "accepted" : unattendedNo ? `declined (--yes never accepts this step; use --accept ${step.stepId})` : "answered unattended (--yes)"}`);
      // A fixed answer chosen by the person's flag or terminal answer; --yes never says yes to a person-only step.
      const result = await engine.submit(step.runId, step.stepId, answer, { byPerson: choice !== "unattended" });
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
    if (error instanceof EngineError && error.code === "CONTEXT_FAILED") {
      // The engine's message ends with advice for an MCP host; say what to do here instead.
      log(`agent-qa run: ${error.message.replace(/\s*(Nothing was used up|Fix the cause)[^]*$/, "")}`);
      runId ??= error.runId;
      // Failed while starting: nothing was saved, so it's the input (e.g. --from-run names no requirements run).
      if (!runId || !(await saved(runId))) return EXIT.setup;
      await resumeHint();
      return EXIT.failed;
    }
    // Anything else: its name and message only (connector and policy errors carry no personal data), and how to go on.
    const known = error instanceof DriveError || error instanceof PolicyDenied || error instanceof EngineError;
    const text = error instanceof Error ? (known ? error.message : `${error.name}: ${error.message}`) : String(error);
    log(`agent-qa run: ${text}`);
    await resumeHint();
    return EXIT.failed;
  } finally {
    // An explorer's browser would keep the process alive.
    await data?.close();
  }
}
