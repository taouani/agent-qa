import type { ModelDriver, ModelRequest, ModelResponse } from "../llm/index.js";
import { validateCases, type HarnessCase, type Seed, type SyntheticTicket } from "./cases.js";
import { SeedScanner, stringLeaves, type SeedHit } from "./scanner.js";

export { SeedScanner } from "./scanner.js";
export type { SeedHit } from "./scanner.js";

/**
 * The harness runner (slice 0, T11). Each case runs a pipeline against a
 * recording model driver. The driver scans every prompt for the seeded values
 * before it reaches the real driver; one hit fails the case, and the prompt is
 * never forwarded. Reports name seeds by id and kind, never by value.
 */

export interface SeededLeak extends SeedHit {
  caseId: string;
  /** 0-based index of the model call that carried the value. */
  call: number;
}

export class SeededLeakError extends Error {
  constructor(readonly leaks: SeededLeak[]) {
    super(`Seeded personal data reached the model: ${leaks.map((l) => `${l.seedId} (${l.kind})`).join(", ")}`);
    this.name = "SeededLeakError";
  }
}

/**
 * Wraps a driver. Every request is scanned first; a request carrying a seeded
 * value is recorded and refused, so the value never reaches the wrapped driver.
 */
export class RecordingDriver implements ModelDriver {
  readonly name: string;
  readonly calls: Array<{ request: ModelRequest; leaks: SeededLeak[] }> = [];
  private readonly scanner: SeedScanner;

  constructor(
    private readonly inner: ModelDriver,
    seeds: Seed[],
    private readonly caseId: string,
  ) {
    this.name = `recording(${inner.name})`;
    this.scanner = new SeedScanner(seeds);
  }

  get leaks(): SeededLeak[] {
    return this.calls.flatMap((c) => c.leaks);
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const call = this.calls.length;
    // Every string in the request, not just message text: fields added later must not slip past.
    const hits = this.scanner.scan(stringLeaves(request).join("\n"));
    const leaks = hits.map((h) => ({ ...h, caseId: this.caseId, call }));
    this.calls.push({ request, leaks });
    if (leaks.length > 0) throw new SeededLeakError(leaks);
    return this.inner.complete(request);
  }
}

export interface PipelineContext {
  case: HarnessCase;
  /** The synthetic tickets, as a connector would return them: real (seeded) values, not masked. */
  tickets: SyntheticTicket[];
  driver: ModelDriver;
}

/** What the harness runs per case. Slice 1 plugs in the masked workflow pipeline. */
export type Pipeline = (context: PipelineContext) => Promise<unknown>;

/** Makes no model calls. Proves the runner, the driver and the report work end to end. */
export const emptyPipeline: Pipeline = async () => undefined;

export interface CaseReport {
  id: string;
  workflow: string;
  status: "pass" | "fail" | "error";
  modelCalls: number;
  seededLeaks: SeededLeak[];
  /** Error name and message for `error`. Never includes prompt text. */
  error?: string;
  durationMs: number;
}

export interface HarnessReport {
  version: 1;
  pipeline: string;
  driver: string;
  startedAt: string;
  finishedAt: string;
  cases: CaseReport[];
  summary: { cases: number; passed: number; failed: number; errors: number; seededLeaks: number };
}

export interface RunHarnessOptions {
  cases: HarnessCase[];
  seeds: Seed[];
  pipeline: Pipeline;
  pipelineName?: string;
  driver: ModelDriver;
  now?: () => Date;
}

function safeError(error: unknown, seeds: SeedScanner): string {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error) ?? String(error);
  // An error could quote a prompt; don't let it carry a seed into the report.
  const safeName = seeds.scan(name).length > 0 ? "Error" : name;
  return seeds.scan(message).length > 0 ? `${safeName}: (message withheld: it contains seeded data)` : `${safeName}: ${message}`;
}

export async function runHarness(options: RunHarnessOptions): Promise<HarnessReport> {
  validateCases(options.cases, options.seeds);
  const now = options.now ?? (() => new Date());
  const scanner = new SeedScanner(options.seeds);
  const startedAt = now().toISOString();
  const cases: CaseReport[] = [];

  for (const c of options.cases) {
    const driver = new RecordingDriver(options.driver, options.seeds, c.id);
    const started = Date.now();
    let status: CaseReport["status"] = "pass";
    let error: string | undefined;
    try {
      await options.pipeline({ case: c, tickets: structuredClone(c.tickets), driver });
    } catch (e) {
      // A SeededLeakError this case's driver didn't record came from somewhere else: that's an error, not a pass.
      if (!(e instanceof SeededLeakError) || driver.leaks.length === 0) {
        status = "error";
        error = safeError(e, scanner);
      }
    }
    // A leak fails the case even when the pipeline caught the driver's error.
    if (driver.leaks.length > 0) status = "fail";
    cases.push({
      id: c.id,
      workflow: c.workflow,
      status,
      modelCalls: driver.calls.length,
      seededLeaks: driver.leaks,
      ...(error ? { error } : {}),
      durationMs: Date.now() - started,
    });
  }

  return {
    version: 1,
    pipeline: options.pipelineName ?? "custom",
    driver: options.driver.name,
    startedAt,
    finishedAt: now().toISOString(),
    cases,
    summary: {
      cases: cases.length,
      passed: cases.filter((c) => c.status === "pass").length,
      failed: cases.filter((c) => c.status === "fail").length,
      errors: cases.filter((c) => c.status === "error").length,
      seededLeaks: cases.reduce((n, c) => n + c.seededLeaks.length, 0),
    },
  };
}
