import { z } from "zod";
import type { ArtifactSpec } from "../../core/index.js";

/**
 * `test-cases@1` (S1-9) and its draft. The draft holds the generated cases
 * for the review step; `test-cases@1` holds the reviewed cases, each marked
 * kept or edited, the dropped ids, and the kept rate the harness reads.
 * Every text value holds tokens such as <PERSON_1>, never real values.
 */

export const TEST_CASES_TEMPLATE_VERSION = "test-cases-1";
export const CASE_ID = /^TC-[A-Z][A-Z0-9_]+-\d+-\d{3}$/;

export const testStepSchema = z
  .object({
    action: z.string().min(1).max(2000).describe("What the tester does"),
    data: z.string().max(2000).default("").describe("Test data for this step; empty if none"),
    expected: z.string().min(1).max(2000).describe("The expected result"),
  })
  .strict();

export const testCaseSchema = z
  .object({
    id: z.string().regex(CASE_ID, "must be TC-{ISSUE-KEY}-{NNN}, e.g. TC-ABC-12-001").describe("TC-{ISSUE-KEY}-{NNN}, e.g. TC-ABC-12-001"),
    requirement: z.string().describe("The issue key the case tests"),
    title: z.string().min(5).max(200),
    type: z.enum(["positive", "negative", "edge"]),
    priority: z.enum(["P1", "P2", "P3", "P4"]).describe("P1 critical path, P2 important, P3 secondary or edge, P4 cosmetic"),
    preconditions: z.array(z.string().min(1).max(1000)).max(10),
    steps: z.array(testStepSchema).min(1).max(30),
    covers: z.array(z.string().regex(/^AC\d+$/)).min(1).describe("Acceptance criterion ids of the issue that the case checks, e.g. [\"AC1\"]"),
  })
  .strict();
export type TestCase = z.infer<typeof testCaseSchema>;

const source = z
  .object({
    /** The run whose requirements@1 the cases come from (this run or an earlier one). */
    run: z.string(),
    sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

const uncovered = z.array(z.object({ requirement: z.string(), criterion: z.string() }).strict());

export const testCasesDraftSchema = z
  .object({
    requirements: source,
    cases: z.array(testCaseSchema),
    /** Issues with no acceptance criteria get no cases. */
    skipped: z.array(z.string()),
  })
  .strict();
export type TestCasesDraft = z.infer<typeof testCasesDraftSchema>;

export const testCasesSchema = z
  .object({
    requirements: source,
    cases: z.array(testCaseSchema.extend({ review: z.enum(["kept", "edited"]) }).strict()),
    dropped: z.array(z.string()),
    skipped: z.array(z.string()),
    /** Criteria no remaining case covers, after the review dropped cases. */
    uncovered,
    review: z
      .object({
        generated: z.number().int().min(0),
        kept: z.number().int().min(0),
        edited: z.number().int().min(0),
        dropped: z.number().int().min(0),
        /** kept / generated: cases accepted as written. 1 when nothing was generated. */
        keptRate: z.number().min(0).max(1),
        /** Nobody reviewed (the CLI's --yes): every case counts as kept, so the kept rate says nothing. */
        unattended: z.literal(true).optional(),
      })
      .strict(),
  })
  .strict();
export type TestCases = z.infer<typeof testCasesSchema>;

const one = (s: string) => s.replace(/\s+/g, " ").trim();
const cell = (s: string) => one(s).replace(/\|/g, "\\|");

function renderCases(cases: Array<TestCase & { review?: string }>): string[] {
  const lines: string[] = [];
  let requirement = "";
  for (const c of cases) {
    if (c.requirement !== requirement) {
      requirement = c.requirement;
      lines.push("", `## ${requirement}`);
    }
    lines.push("", `### ${c.id}: ${one(c.title)}`, "");
    lines.push(`${c.priority} · ${c.type} · covers ${c.covers.join(", ")}${c.review ? ` · ${c.review}` : ""}`);
    if (c.preconditions.length) {
      lines.push("", "Preconditions:");
      for (const p of c.preconditions) lines.push(`- ${one(p)}`);
    }
    lines.push("", "| # | Action | Data | Expected |", "|---|---|---|---|");
    c.steps.forEach((s, i) => lines.push(`| ${i + 1} | ${cell(s.action)} | ${cell(s.data)} | ${cell(s.expected)} |`));
  }
  return lines;
}

export function renderDraft(data: TestCasesDraft): string {
  return [
    "# Test cases (draft, for review)",
    "",
    `${data.cases.length} case(s) from the requirements of run ${data.requirements.run}. Personal data is masked as tokens such as <PERSON_1>.`,
    ...(data.skipped.length ? ["", `No acceptance criteria, so no cases: ${data.skipped.join(", ")}`] : []),
    ...renderCases(data.cases),
  ].join("\n") + "\n";
}

export function renderTestCases(data: TestCases): string {
  const r = data.review;
  return [
    "# Test cases",
    "",
    r.unattended
      ? `${data.cases.length} case(s), accepted without a review (--yes).`
      : `${data.cases.length} case(s) after review: ${r.kept} kept, ${r.edited} edited, ${r.dropped} dropped of ${r.generated} generated (kept rate ${Math.round(r.keptRate * 100)}%).`,
    ...(data.uncovered.length ? ["", `**Not covered after review:** ${data.uncovered.map((u) => `${u.requirement} ${u.criterion}`).join(", ")}`] : []),
    ...(data.skipped.length ? ["", `No acceptance criteria, so no cases: ${data.skipped.join(", ")}`] : []),
    ...renderCases(data.cases),
  ].join("\n") + "\n";
}

export const TEST_CASES_DRAFT_ARTIFACT: ArtifactSpec<TestCasesDraft> = {
  name: "test-cases-draft",
  schema: "test-cases-draft@1",
  data: testCasesDraftSchema,
  render: renderDraft,
};

export const TEST_CASES_ARTIFACT: ArtifactSpec<TestCases> = {
  name: "test-cases",
  schema: "test-cases@1",
  data: testCasesSchema,
  render: renderTestCases,
};

/**
 * `xray-push@1` (S1-10): what one push to Xray did, per case. Written only
 * after the write policy approved it and Xray finished the import jobs.
 */
export const xrayPushSchema = z
  .object({
    /** The test-cases@1 the push sent. */
    testCases: source,
    project: z.string(),
    jobs: z.array(z.string()),
    results: z.array(
      z
        .object({
          tcId: z.string(),
          action: z.enum(["created", "updated", "failed"]),
          xrayKey: z.string().optional(),
          linkedTo: z.string(),
          error: z.string().optional(),
        })
        .strict(),
    ),
    counts: z.object({ created: z.number().int().min(0), updated: z.number().int().min(0), failed: z.number().int().min(0) }).strict(),
  })
  .strict();
export type XrayPush = z.infer<typeof xrayPushSchema>;

export function renderXrayPush(data: XrayPush): string {
  const c = data.counts;
  return [
    "# Xray push",
    "",
    `Project ${data.project}: ${c.created} created, ${c.updated} updated, ${c.failed} failed.`,
    "",
    "| Case | Action | Xray test | Linked to | Error |",
    "|---|---|---|---|---|",
    ...data.results.map((r) => `| ${r.tcId} | ${r.action} | ${r.xrayKey ?? ""} | ${r.linkedTo} | ${r.error ? cell(r.error) : ""} |`),
  ].join("\n") + "\n";
}

export const XRAY_PUSH_ARTIFACT: ArtifactSpec<XrayPush> = {
  name: "xray-push",
  schema: "xray-push@1",
  data: xrayPushSchema,
  render: renderXrayPush,
};
