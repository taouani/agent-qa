import { z } from "zod";
import type { OutputError } from "../../core/index.js";
import type { DocumentMeta, DocumentSources, DocumentType } from "./types.js";
import { bullets, clip, one, section, table } from "./markdown.js";

/**
 * The `test-plan` document type (S4-3): scope, approach, risk per
 * requirement, environments, entry and exit criteria. Written from the
 * requirements, and from the reviewed test cases when given: the plan's
 * coverage table counts them, with no model.
 */

const text = (max = 1000) => z.string().trim().min(1).max(max);
const RISK = z.enum(["high", "medium", "low"]);

export const testPlanSchema = z
  .object({
    summary: text(3000).describe("What is tested and why, in one short paragraph"),
    objectives: z.array(text()).min(1).max(15),
    inScope: z.array(text()).min(1).max(40).describe("Features and behaviours this plan tests"),
    outOfScope: z.array(text()).max(40).describe("What it doesn't test, so nobody assumes it does"),
    approach: text(4000).describe("Test levels and types (functional, negative, regression, integration...) and how they are run"),
    requirements: z
      .array(
        z
          .object({
            key: z.string().describe("The issue key, exactly as in the context"),
            risk: RISK.describe("How much harm a defect here would do, and how likely one is"),
            focus: text().describe("What testing this issue must concentrate on"),
          })
          .strict(),
      )
      .min(1)
      .describe("Every issue of the context, once"),
    risks: z
      .array(
        z
          .object({
            risk: text(),
            impact: RISK,
            mitigation: text(),
            requirements: z.array(z.string()).describe("Issue keys the risk is about; empty if it is about the whole scope"),
          })
          .strict(),
      )
      .max(30),
    environments: z.array(text()).max(20).describe("Orgs, browsers, devices or integrations the tests need"),
    testData: z.array(text()).max(20).describe("Data the tests need, described, never invented personal data"),
    entryCriteria: z.array(text()).min(1).max(15),
    exitCriteria: z.array(text()).min(1).max(15),
    assumptions: z.array(text()).max(30).describe("Assumptions made and open questions still to answer"),
  })
  .strict();
export type TestPlan = z.infer<typeof testPlanSchema>;

const MAX_DESCRIPTION = 1500;
const MAX_CASES_SHOWN = 300;

function context(s: DocumentSources) {
  const rs = s.requirements.data.requirements;
  const cases = s.testCases?.data.cases ?? [];
  return {
    issues: rs.map((r) => ({
      key: r.key,
      type: r.type,
      summary: r.summary,
      ...(r.parent ? { parent: r.parent } : {}),
      ...(r.priority ? { priority: r.priority } : {}),
      ...(r.fixVersions.length ? { fixVersions: r.fixVersions } : {}),
      ...(r.components.length ? { components: r.components } : {}),
      quality: r.quality.score,
      ...(r.quality.missing.length ? { missing: r.quality.missing } : {}),
      description: clip(r.description, MAX_DESCRIPTION),
      acceptanceCriteria: r.acceptanceCriteria.map((ac) => `${ac.id}: ${ac.text}${ac.origin === "inferred" ? " (inferred, not written in the issue)" : ""}`),
      ...(r.openQuestions.length ? { openQuestions: r.openQuestions } : {}),
    })),
    ...(s.testCases
      ? {
          testCases: {
            total: cases.length,
            shown: cases.slice(0, MAX_CASES_SHOWN).map((c) => `${c.id} | ${c.priority} | ${c.type} | ${c.title}`),
            uncovered: s.testCases.data.uncovered.map((u) => `${u.requirement} ${u.criterion}`),
          },
        }
      : {}),
  };
}

function check(s: DocumentSources, plan: TestPlan): OutputError[] {
  const keys = new Set(s.requirements.data.requirements.map((r) => r.key));
  const errors: OutputError[] = [];
  const seen = new Set<string>();
  plan.requirements.forEach((r, i) => {
    const key = r.key.trim().toUpperCase();
    if (!keys.has(key)) errors.push({ path: `$.requirements.${i}.key`, message: `${r.key} isn't an issue of the context (${[...keys].join(", ")})` });
    else if (seen.has(key)) errors.push({ path: `$.requirements.${i}.key`, message: `${key} is listed more than once` });
    seen.add(key);
  });
  const missing = [...keys].filter((k) => !seen.has(k));
  if (missing.length) errors.push({ path: "$.requirements", message: `no entry for ${missing.join(", ")}` });
  plan.risks.forEach((risk, i) =>
    risk.requirements.forEach((k, j) => {
      if (!keys.has(k.trim().toUpperCase())) errors.push({ path: `$.risks.${i}.requirements.${j}`, message: `${k} isn't an issue of the context` });
    }),
  );
  return errors;
}

function render(plan: TestPlan, s: DocumentSources, meta: DocumentMeta): string {
  const rs = s.requirements.data.requirements;
  const summaries = new Map(rs.map((r) => [r.key, r.summary]));
  const cases = s.testCases?.data.cases;
  const casesOf = (key: string) => (cases ?? []).filter((c) => c.requirement === key);
  const from = [`requirements run ${meta.requirementsRun} (${rs.length} issue(s))`, ...(meta.testCasesRun && cases ? [`test cases run ${meta.testCasesRun} (${cases.length} reviewed case(s))`] : [])];
  const lines = [`# ${meta.title}: ${meta.input}`, "", `Written from ${from.join(" and ")}. Personal data is masked as tokens such as <PERSON_1>.`];
  lines.push(...section("Summary", [one(plan.summary)]));
  lines.push(...section("Objectives", bullets(plan.objectives)));
  lines.push(...section("Scope", ["### In scope", "", ...bullets(plan.inScope), "", "### Out of scope", "", ...bullets(plan.outOfScope)]));
  lines.push(...section("Approach", [one(plan.approach)]));
  const head = ["Issue", "Summary", "Risk", "Focus", ...(cases ? ["Cases"] : [])];
  lines.push(
    ...section(
      "Requirements",
      table(
        head,
        plan.requirements.map((r) => {
          const key = r.key.trim().toUpperCase();
          return [key, summaries.get(key) ?? "", r.risk, r.focus, ...(cases ? [String(casesOf(key).length)] : [])];
        }),
      ),
    ),
  );
  if (s.testCases && cases) {
    const uncovered = s.testCases.data.uncovered;
    const count = (key: string, p: string) => String(casesOf(key).filter((c) => c.priority === p).length);
    lines.push(
      ...section("Coverage", [
        ...table(
          ["Issue", "Cases", "P1", "P2", "P3", "P4", "Criteria not covered"],
          rs.map((r) => [r.key, String(casesOf(r.key).length), count(r.key, "P1"), count(r.key, "P2"), count(r.key, "P3"), count(r.key, "P4"), uncovered.filter((u) => u.requirement === r.key).map((u) => u.criterion).join(", ") || "none"]),
        ),
        ...(s.testCases.data.skipped.length ? ["", `No cases for ${s.testCases.data.skipped.join(", ")}: no acceptance criteria.`] : []),
      ]),
    );
  }
  lines.push(...section("Risks", plan.risks.length ? table(["Risk", "Impact", "Mitigation", "Issues"], plan.risks.map((r) => [r.risk, r.impact, r.mitigation, r.requirements.join(", ") || "all"])) : ["None named."]));
  lines.push(...section("Environments", bullets(plan.environments)));
  lines.push(...section("Test data", bullets(plan.testData)));
  lines.push(...section("Entry criteria", bullets(plan.entryCriteria)));
  lines.push(...section("Exit criteria", bullets(plan.exitCriteria)));
  lines.push(...section("Assumptions and open questions", bullets(plan.assumptions)));
  return `${lines.join("\n")}\n`;
}

export const TEST_PLAN: DocumentType<TestPlan> = {
  id: "test-plan",
  title: "Test plan",
  templateVersion: "test-plan-1",
  needs: { testCases: "optional", testRun: "unused" },
  schema: testPlanSchema,
  instructions: [
    "Write a test plan for the issues in the context.",
    "Name every issue once under requirements, with its risk (high, medium, low: how much harm a defect would do and how likely one is) and what testing it must focus on. Base the risk on the acceptance criteria, the quality score and the open questions; an issue with few or inferred criteria is riskier.",
    "Keep scope, approach, environments and test data to what the issues say or clearly imply; put anything you had to assume, and the issues' open questions that matter for testing, under assumptions. Don't invent features, systems or dates.",
    "If the context has testCases, the plan's coverage table is made from them: don't count them yourself, but say in the approach how they are used, and name uncovered criteria as risks.",
    "Values like <PERSON_1> are masked personal data: keep them exactly as they are and don't make up new ones.",
  ].join("\n"),
  context,
  check,
  render,
};
