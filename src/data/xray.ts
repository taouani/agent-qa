import type { Config } from "../core/index.js";
import type { XrayJobResult, XrayTest } from "../connectors/index.js";

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
