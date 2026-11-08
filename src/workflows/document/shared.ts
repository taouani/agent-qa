import type { OutputError } from "../../core/index.js";
import type { TestCases } from "../test-cases/artifact.js";
import type { TestRun } from "../run-tests/workflow.js";
import { clip } from "./markdown.js";
import type { DocumentSources } from "./types.js";

/** Context and checks the document types share. */

const MAX_DESCRIPTION = 1500;
const MAX_CASES_SHOWN = 300;
const MAX_TESTS_SHOWN = 300;

export const norm = (key: string) => key.trim().toUpperCase();

/** The issues as the model sees them: masked, descriptions clipped. */
export function issuesContext(s: DocumentSources, maxDescription = MAX_DESCRIPTION) {
  return s.requirements.data.requirements.map((r) => ({
    key: r.key,
    type: r.type,
    summary: r.summary,
    ...(r.status ? { status: r.status } : {}),
    ...(r.parent ? { parent: r.parent } : {}),
    ...(r.priority ? { priority: r.priority } : {}),
    ...(r.fixVersions.length ? { fixVersions: r.fixVersions } : {}),
    ...(r.components.length ? { components: r.components } : {}),
    ...(r.labels.length ? { labels: r.labels } : {}),
    quality: r.quality.score,
    ...(r.quality.missing.length ? { missing: r.quality.missing } : {}),
    description: clip(r.description, maxDescription),
    acceptanceCriteria: r.acceptanceCriteria.map((ac) => `${ac.id}: ${ac.text}${ac.origin === "inferred" ? " (inferred, not written in the issue)" : ""}`),
    ...(r.openQuestions.length ? { openQuestions: r.openQuestions } : {}),
  }));
}

export function casesContext(cases: TestCases | undefined) {
  if (!cases) return {};
  return {
    testCases: {
      total: cases.cases.length,
      shown: cases.cases.slice(0, MAX_CASES_SHOWN).map((c) => `${c.id} | ${c.requirement} | ${c.priority} | ${c.type} | covers ${c.covers.join(", ")} | ${c.title}`),
      uncovered: cases.uncovered.map((u) => `${u.requirement} ${u.criterion}`),
    },
  };
}

export function runContext(run: TestRun | undefined) {
  if (!run) return {};
  return {
    testRun: {
      status: run.status,
      counts: run.counts,
      notPassed: run.tests.filter((t) => t.outcome !== "passed").slice(0, MAX_TESTS_SHOWN).map((t) => `${t.outcome} | ${t.title}${t.failure ? ` | ${t.failure.message.split("\n")[0] ?? ""}` : ""}`),
    },
  };
}

export const keysOf = (s: DocumentSources) => new Set(s.requirements.data.requirements.map((r) => r.key));

/** Errors for the keys (path, key) that aren't issues of the sources. */
export function knownKeys(s: DocumentSources, entries: ReadonlyArray<[string, string]>): OutputError[] {
  const keys = keysOf(s);
  return entries.filter(([, k]) => !keys.has(norm(k))).map(([path, k]) => ({ path, message: `${k} isn't an issue of the context` }));
}

/** Every issue of the sources once, by the `key` of each entry of the list at `path`. */
export function everyIssueOnce(s: DocumentSources, path: string, keys: readonly string[]): OutputError[] {
  const all = keysOf(s);
  const errors: OutputError[] = [];
  const seen = new Set<string>();
  keys.forEach((raw, i) => {
    const key = norm(raw);
    if (!all.has(key)) errors.push({ path: `${path}.${i}.key`, message: `${raw} isn't an issue of the context (${[...all].join(", ")})` });
    else if (seen.has(key)) errors.push({ path: `${path}.${i}.key`, message: `${key} is listed more than once` });
    seen.add(key);
  });
  const missing = [...all].filter((k) => !seen.has(k));
  if (missing.length) errors.push({ path, message: `no entry for ${missing.join(", ")}` });
  return errors;
}

/** Errors for ids at `path` that aren't `prefix` numbered in order from 001. */
export function numberedIds(path: string, ids: readonly string[], prefix: (i: number) => string): OutputError[] {
  const errors: OutputError[] = [];
  ids.forEach((id, i) => {
    const want = `${prefix(i)}${String(i + 1).padStart(3, "0")}`;
    if (id !== want) errors.push({ path: `${path}.${i}.id`, message: `must be ${want}: number them in order from 001` });
  });
  return errors;
}

const CASE_IN = /TC-[A-Z][A-Z0-9_]+-\d+-\d{3}/g;

/** Each case id's results in a test run: from the test titles and tags that name it. */
export function resultsByCase(run: TestRun | undefined): Map<string, Array<TestRun["tests"][number]["outcome"]>> {
  const by = new Map<string, Array<TestRun["tests"][number]["outcome"]>>();
  for (const t of run?.tests ?? []) {
    for (const id of new Set([...(t.title.match(CASE_IN) ?? []), ...t.tags.flatMap((tag) => tag.match(CASE_IN) ?? [])])) by.set(id, [...(by.get(id) ?? []), t.outcome]);
  }
  return by;
}

/** One outcome for several tests of a case: failed beats flaky beats passed beats skipped. */
export function worst(outcomes: readonly string[] | undefined): string {
  if (!outcomes?.length) return "not run";
  for (const o of ["failed", "flaky", "passed", "skipped"]) if (outcomes.includes(o)) return o;
  return "not run";
}
