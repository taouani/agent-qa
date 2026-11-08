import { z } from "zod";
import type { OutputError } from "../../core/index.js";
import { bullets, one, section, table } from "./markdown.js";
import { casesContext, issuesContext, knownKeys, resultsByCase, runContext, worst } from "./shared.js";
import type { DocumentMeta, DocumentSources, DocumentType } from "./types.js";

/**
 * The `traceability` document type (S4-4, from v1's generate-traceability-
 * report): issue, criterion, case and result. Agent-QA builds the matrix
 * from the reviewed cases and, when given, a test run (a test names its case
 * by TC id in its title or tags); the model writes only what it means.
 */

const text = (max = 1000) => z.string().trim().min(1).max(max);

export const traceabilitySchema = z
  .object({
    summary: text(2000).describe("What the matrix shows, in one short paragraph"),
    gaps: z
      .array(z.object({ requirement: z.string(), criterion: z.string().optional().describe("AC1, AC2...; leave out for the whole issue"), note: text() }).strict())
      .max(100)
      .describe("Every gap the matrix shows, with why it matters"),
    recommendations: z.array(text()).max(20),
  })
  .strict();
export type Traceability = z.infer<typeof traceabilitySchema>;

interface Row {
  key: string;
  criterion: string;
  cases: string[];
  result: string;
}

/** The matrix, one row per criterion (or per issue with none), with no model. */
export function matrixOf(s: DocumentSources): Row[] {
  const cases = s.testCases?.data.cases ?? [];
  const results = resultsByCase(s.testRun?.data);
  return s.requirements.data.requirements.flatMap((r) => {
    const own = cases.filter((c) => c.requirement === r.key);
    const rows = r.acceptanceCriteria.length ? r.acceptanceCriteria.map((ac) => ({ criterion: ac.id, cases: own.filter((c) => c.covers.includes(ac.id)).map((c) => c.id) })) : [{ criterion: "", cases: own.map((c) => c.id) }];
    return rows.map((row) => ({
      key: r.key,
      ...row,
      result: !s.testRun ? "" : row.cases.length ? worst(row.cases.flatMap((id) => results.get(id) ?? ["not run"])) : "",
    }));
  });
}

const gapsOf = (rows: Row[]) => rows.filter((r) => r.cases.length === 0 || r.result === "failed" || r.result === "not run" || r.result === "flaky");

function check(s: DocumentSources, t: Traceability): OutputError[] {
  const errors = knownKeys(s, t.gaps.map((g, i): [string, string] => [`$.gaps.${i}.requirement`, g.requirement]));
  const byKey = new Map(s.requirements.data.requirements.map((r) => [r.key, r]));
  t.gaps.forEach((g, i) => {
    const r = byKey.get(g.requirement.trim().toUpperCase());
    if (r && g.criterion !== undefined && !r.acceptanceCriteria.some((ac) => ac.id === g.criterion)) errors.push({ path: `$.gaps.${i}.criterion`, message: `${r.key} has no ${g.criterion}` });
  });
  const named = new Set(t.gaps.map((g) => `${g.requirement.trim().toUpperCase()} ${g.criterion ?? ""}`));
  const named0 = new Set(t.gaps.filter((g) => g.criterion === undefined).map((g) => g.requirement.trim().toUpperCase()));
  const missing = gapsOf(matrixOf(s)).filter((row) => !named.has(`${row.key} ${row.criterion}`) && !named0.has(row.key));
  if (missing.length) errors.push({ path: "$.gaps", message: `the matrix shows gaps the answer doesn't name: ${missing.map((r) => `${r.key}${r.criterion ? ` ${r.criterion}` : ""}`).join(", ")}` });
  return errors;
}

function render(t: Traceability, s: DocumentSources, meta: DocumentMeta): string {
  const rows = matrixOf(s);
  const covered = rows.filter((r) => r.cases.length > 0).length;
  const run = s.testRun?.data;
  const from = [`requirements run ${meta.requirementsRun}`, `test cases run ${meta.testCasesRun}`, ...(meta.testRunRun ? [`test run ${meta.testRunRun}`] : [])];
  const lines = [`# ${meta.title}: ${meta.input}`, "", `Written from ${from.join(", ")}. Personal data is masked as tokens such as <PERSON_n>.`];
  const passed = run ? rows.filter((r) => r.result === "passed").length : 0;
  lines.push(...section("Summary", [one(t.summary), "", `${covered} of ${rows.length} criteria have a reviewed case${run ? `; ${passed} passed in the test run (${run.status}: ${run.counts.passed} passed, ${run.counts.failed} failed, ${run.counts.flaky} flaky, ${run.counts.skipped} skipped)` : ""}.`]));
  lines.push(...section("Matrix", table(["Issue", "Criterion", "Cases", ...(run ? ["Result"] : [])], rows.map((r) => [r.key, r.criterion || "(none)", r.cases.join(", ") || "none", ...(run ? [r.result || "no case"] : [])]))));
  if (s.testCases?.data.skipped.length) lines.push("", `No cases for ${s.testCases.data.skipped.join(", ")}: no acceptance criteria.`);
  lines.push(...section("Gaps", bullets(t.gaps.map((g) => `${g.requirement.trim().toUpperCase()}${g.criterion ? ` ${g.criterion}` : ""}: ${g.note}`), "None.")));
  lines.push(...section("Recommendations", bullets(t.recommendations)));
  return `${lines.join("\n")}\n`;
}

export const TRACEABILITY: DocumentType<Traceability> = {
  id: "traceability",
  title: "Traceability report",
  templateVersion: "traceability-1",
  needs: { testCases: "required", testRun: "optional" },
  schema: traceabilitySchema,
  instructions: [
    "Agent-QA builds the traceability matrix (issue, criterion, cases, and the test result when a test run is given) from the context; the matrix is in the context. Don't rebuild it.",
    "Write a short summary of what it shows, then name every gap: a criterion with no case, or one whose cases failed, were flaky or didn't run. Give the issue, the criterion (leave it out for a whole issue) and why the gap matters.",
    "End with recommendations: which cases to add or fix first.",
    "Values like <PERSON_1> are masked personal data: keep them exactly as they are and don't make up new ones. Test results show masked values as [masked].",
  ].join("\n"),
  context: (s) => ({
    issues: issuesContext(s, 500),
    matrix: matrixOf(s).map((r) => `${r.key} | ${r.criterion || "(no criteria)"} | ${r.cases.join(", ") || "no case"}${s.testRun ? ` | ${r.result || "no case"}` : ""}`),
    ...casesContext(s.testCases?.data),
    ...runContext(s.testRun?.data),
  }),
  check,
  render,
};
