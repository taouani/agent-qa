import type { ModelDriver, ModelRequest, ModelResponse } from "../llm/index.js";
import { validateCases, type HarnessCase, type Seed, type SeedKind, type SyntheticTicket } from "./cases.js";

/**
 * The harness runner (slice 0, T11). Each case runs a pipeline against a
 * recording model driver. The driver scans every prompt for the seeded values
 * before it reaches the real driver; one hit fails the case, and the prompt is
 * never forwarded. Reports name seeds by id and kind, never by value.
 */

const DIGIT_KINDS: ReadonlySet<SeedKind> = new Set(["phone", "iban", "card", "national-id"]);
const MIN_NAME_PART = 4;

/** Lowercase, collapse whitespace. */
function normal(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}
/** Letters and digits only, lowercase: catches `+33 6 12 34 56 78` sent as `+33612345678`. */
function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface SeedHit {
  seedId: string;
  kind: SeedKind;
  /** How it matched: the whole value, its digits without separators, or one part of a name. */
  match: "exact" | "compact" | "name-part";
}

/** Finds seeded values in text, also when spacing, case or separators differ, or one part of a name appears alone. */
export class SeedScanner {
  private readonly checks: Array<{ seed: Seed; exact: string; compact?: string; parts: string[] }>;

  constructor(seeds: Seed[]) {
    this.checks = seeds.map((seed) => ({
      seed,
      exact: normal(seed.value),
      ...(DIGIT_KINDS.has(seed.kind) || seed.kind === "email" ? { compact: compact(seed.value) } : {}),
      parts: seed.kind === "name" ? seed.value.split(/\s+/).filter((p) => p.length >= MIN_NAME_PART).map(normal) : [],
    }));
  }

  scan(text: string): SeedHit[] {
    const n = normal(text);
    const c = compact(text);
    const words = new Set(n.split(/[^\p{L}\p{N}'-]+/u));
    const hits: SeedHit[] = [];
    for (const { seed, exact, compact: packed, parts } of this.checks) {
      if (n.includes(exact)) hits.push({ seedId: seed.id, kind: seed.kind, match: "exact" });
      else if (packed && c.includes(packed)) hits.push({ seedId: seed.id, kind: seed.kind, match: "compact" });
      else if (parts.some((p) => words.has(p))) hits.push({ seedId: seed.id, kind: seed.kind, match: "name-part" });
    }
    return hits;
  }
}

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
    const hits = this.scanner.scan(request.messages.map((m) => m.content).join("\n"));
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
  const e = error instanceof Error ? error : new Error(String(error));
  const text = `${e.name}: ${e.message}`;
  // An error message could quote a prompt; don't let it carry a seed into the report.
  return seeds.scan(text).length > 0 ? `${e.name}: (message withheld: it contains seeded data)` : text;
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
      if (!(e instanceof SeededLeakError)) {
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
