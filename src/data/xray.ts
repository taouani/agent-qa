import type { Config } from "../core/index.js";
import type { XrayExecutionRead, XrayJobResult, XrayRunStatus, XrayTest } from "../connectors/index.js";

/**
 * Test cases to Xray tests (S1-10). Each case becomes a Manual test:
 * summary `[TC-ID] title`, steps as action, data and expected result, the
 * priority through `xray.priorities`, labels `agent-qa` and `agent-qa:TC-ID`
 * (how a rerun finds it), and a link to its requirement issue.
 */

/** What the data layer needs of a test case; workflows hand over their `test-cases@1` cases. */
export interface PushCase {
  id: string;
  requirement: string;
  title: string;
  type: string;
  priority: "P1" | "P2" | "P3" | "P4";
  preconditions: string[];
  steps: Array<{ action: string; data: string; expected: string }>;
  covers: string[];
}

/** A test an earlier push created, as a rerun sees it. */
export interface ExistingTest {
  id: string;
  xrayKey: string;
  /** Masked. */
  title: string;
  covers: string[];
}

export interface XrayPlan {
  project: string;
  /** Existing test per case id, from an earlier push. */
  existing: Record<string, string>;
  create: number;
  update: number;
}

export interface XrayPushResult {
  project: string;
  jobs: string[];
  results: Array<{ tcId: string; action: "created" | "updated" | "failed"; xrayKey?: string; linkedTo: string; error?: string }>;
}

export const caseLabel = (id: string) => `agent-qa:${id}`;
const TOKEN = /<[A-Z][A-Z0-9_]*_\d+>/g;

export function toXrayTest(c: PushCase, xray: NonNullable<Config["xray"]>, existing: string | undefined, restore: (text: string) => string): XrayTest {
  const priority = xray.priorities?.[c.priority];
  const description = [
    c.preconditions.length ? `Preconditions:\n${c.preconditions.map((p) => `- ${restore(p)}`).join("\n")}` : "",
    `Covers ${c.covers.join(", ")} of ${c.requirement} (${c.type}, ${c.priority}). Written by Agent-QA.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    testtype: "Manual",
    ...(existing ? { update_key: existing } : {}),
    fields: {
      summary: `[${c.id}] ${restore(c.title)}`.slice(0, 255),
      project: { key: xray.projectKey },
      labels: ["agent-qa", caseLabel(c.id)],
      description,
      ...(priority ? { priority: { name: priority } } : {}),
    },
    update: { issuelinks: [{ add: { type: { name: xray.linkType }, outwardIssue: { key: c.requirement } } }] },
    steps: c.steps.map((s) => ({ action: restore(s.action), data: restore(s.data), result: restore(s.expected) })),
  };
}

/** Every token in the cases' text. */
export function caseTokens(cases: PushCase[]): Set<string> {
  const texts = cases.flatMap((c) => [c.title, ...c.preconditions, ...c.steps.flatMap((s) => [s.action, s.data, s.expected])]);
  return new Set(texts.flatMap((t) => t.match(TOKEN) ?? []));
}

/** Replaces tokens with their values, for `masking.restoreOnWrite`; unknown tokens stay. */
export function restorer(valueOf: (token: string) => string | undefined): (text: string) => string {
  return (text) => text.replace(TOKEN, (t) => valueOf(t) ?? t);
}

/** One push result per case, from the job results of its batch. */
export function results(batch: PushCase[], existing: Record<string, string>, job: XrayJobResult): XrayPushResult["results"] {
  const keys = new Map(job.issues.map((i) => [i.elementNumber, i.key]));
  const errors = new Map<number, string>();
  for (const e of job.errors) if (e.elementNumber !== undefined) errors.set(e.elementNumber, e.message);
  return batch.map((c, i) => {
    const key = keys.get(i);
    if (key) return { tcId: c.id, action: existing[c.id] ? "updated" : "created", xrayKey: key, linkedTo: c.requirement };
    return { tcId: c.id, action: "failed", linkedTo: c.requirement, error: errors.get(i) ?? (job.status === "failed" ? job.errors[0]?.message ?? "the import failed" : "not in the import result") };
  });
}

/** A test case id in a test's title or tags: TC-ABC-1-001 (S3-9). */
const TC_ID = /\bTC-[A-Z][A-Z0-9_]*-\d+-\d{3,}\b/;
export const tcIdOf = (title: string, tags: readonly string[]): string | undefined => TC_ID.exec(title)?.[0] ?? tags.map((t) => TC_ID.exec(t)?.[0]).find((x) => x !== undefined);

/** A test's result as a run recorded it (masked): the rows of test-run@1. */
export interface ExecutionRow {
  title: string;
  tags: string[];
  file: string;
  line: number;
  outcome: "passed" | "failed" | "flaky" | "skipped";
  runs: number;
  failedRuns: number;
  failure?: { message: string } | undefined;
}

export interface ExecutionResult {
  tcId: string;
  xrayKey: string;
  status: XrayRunStatus;
  /** Masked. */
  comment?: string;
  /** Its status in the last execution with the same label, when it was in it. */
  before?: string;
}

/**
 * What a run records in Xray, and what changed since the last execution
 * with its label. failing: passed before, fails now; fixed: failed before,
 * passes now; stillFailing; added: not in the last one; gone: in the last
 * one, not run this time (Xray keys).
 */
export interface XrayExecutionPlan {
  project: string;
  label: string;
  previous?: { key: string; created: string };
  results: ExecutionResult[];
  /** Tests that ran but have no TC id, or whose case isn't in Xray: not recorded (masked titles). */
  notInXray: string[];
  /** Skipped tests: not run, so not recorded. */
  skipped: number;
  changes: { failing: string[]; fixed: string[]; stillFailing: string[]; added: string[]; gone: string[] };
}

const firstLine = (s: string) => (s.split("\n").find((l) => l.trim()) ?? "").replace(/\s+/g, " ").trim();

/** One result per case: a case whose tests ran more than once (projects, repeats) fails if any failed. */
export function executionResults(rows: readonly ExecutionRow[], keys: ReadonlyMap<string, string>): { results: Omit<ExecutionResult, "before">[]; notInXray: string[]; skipped: number } {
  const byCase = new Map<string, Omit<ExecutionResult, "before">>();
  const notInXray: string[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (r.outcome === "skipped") {
      skipped++;
      continue;
    }
    const id = tcIdOf(r.title, r.tags);
    const key = id ? keys.get(id) : undefined;
    if (!id || !key) {
      notInXray.push(r.title);
      continue;
    }
    const failed = r.outcome === "failed";
    const comment = failed
      ? `Failed in ${r.file}:${r.line}${r.failure ? `: ${firstLine(r.failure.message)}` : ""}`
      : r.outcome === "flaky"
        ? `Flaky: failed ${r.failedRuns} of ${r.runs} run(s), passed on a retry (${r.file}:${r.line})`
        : undefined;
    const prev = byCase.get(id);
    if (prev?.status === "FAILED" && !failed) continue;
    if (prev && !failed && !comment) continue;
    byCase.set(id, { tcId: id, xrayKey: key, status: failed ? "FAILED" : "PASSED", ...(comment ? { comment: comment.slice(0, 1000) } : {}) });
  }
  return { results: [...byCase.values()], notInXray: [...new Set(notInXray)], skipped };
}

/** What changed since the last execution: by Xray key. */
export function executionChanges(results: readonly Omit<ExecutionResult, "before">[], previous: XrayExecutionRead | undefined): { results: ExecutionResult[]; changes: XrayExecutionPlan["changes"] } {
  const changes: XrayExecutionPlan["changes"] = { failing: [], fixed: [], stillFailing: [], added: [], gone: [] };
  const was = previous?.statuses ?? {};
  const out = results.map((r) => {
    const before = was[r.xrayKey];
    if (previous) {
      if (before === undefined) changes.added.push(r.tcId);
      else if (r.status === "FAILED") (before === "FAILED" ? changes.stillFailing : changes.failing).push(r.tcId);
      else if (before === "FAILED") changes.fixed.push(r.tcId);
    }
    return { ...r, ...(before !== undefined ? { before } : {}) };
  });
  if (previous) {
    const now = new Set(results.map((r) => r.xrayKey));
    changes.gone = Object.keys(was).filter((k) => !now.has(k)).sort();
  }
  return { results: out, changes };
}
