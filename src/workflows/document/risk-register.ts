import { z } from "zod";
import type { OutputError } from "../../core/index.js";
import { bullets, one, section, table } from "./markdown.js";
import { casesContext, issuesContext, knownKeys, norm } from "./shared.js";
import type { DocumentMeta, DocumentSources, DocumentType } from "./types.js";

/**
 * The `risk-register` document type (S4-4, from v1's generate-risk-register):
 * risks with a category, probability and impact from 1 to 5, a response and
 * the issues they are about. Agent-QA numbers them (R-001 in the order
 * written, so a review can remove one) and computes the score and level.
 */

const text = (max = 1000) => z.string().trim().min(1).max(max);
export const RISK_CATEGORIES = ["technical", "requirements", "process", "resource", "schedule", "quality", "business"] as const;
/** Issues below this quality score must be named by a risk. */
export const WEAK_QUALITY = 60;

export const riskRegisterSchema = z
  .object({
    summary: text(2000),
    risks: z
      .array(
        z
          .object({
            title: text(200),
            description: text(2000),
            category: z.enum(RISK_CATEGORIES),
            probability: z.number().int().min(1).max(5).describe("1 under 10%, 2 10-30%, 3 30-50%, 4 50-70%, 5 over 70%"),
            impact: z.number().int().min(1).max(5).describe("1 minimal, 2 minor, 3 moderate, 4 significant, 5 critical"),
            response: z.enum(["avoid", "mitigate", "transfer", "accept"]),
            mitigation: text(),
            contingency: text().describe("What to do if the risk happens anyway"),
            trigger: text().describe("The sign that the risk is happening"),
            owner: text(100).describe("A role, never a person's name"),
            requirements: z.array(z.string()).describe("Issue keys the risk is about; empty if it is about the whole scope"),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    assumptions: z.array(text()).max(20),
  })
  .strict();
export type RiskRegister = z.infer<typeof riskRegisterSchema>;
type Risk = RiskRegister["risks"][number];

export const scoreOf = (r: Pick<Risk, "probability" | "impact">) => r.probability * r.impact;
export const levelOf = (score: number) => (score >= 15 ? "high" : score >= 8 ? "medium" : "low");

function check(s: DocumentSources, reg: RiskRegister): OutputError[] {
  const named = new Set(reg.risks.flatMap((r) => r.requirements.map(norm)));
  const weak = s.requirements.data.requirements.filter((r) => r.quality.score < WEAK_QUALITY && !named.has(r.key)).map((r) => r.key);
  return [
    ...knownKeys(s, reg.risks.flatMap((r, i) => r.requirements.map((k, j): [string, string] => [`$.risks.${i}.requirements.${j}`, k]))),
    ...(weak.length ? [{ path: "$.risks", message: `${weak.join(", ")} score below ${WEAK_QUALITY} for quality: name each in at least one risk` }] : []),
  ];
}

function render(reg: RiskRegister, s: DocumentSources, meta: DocumentMeta): string {
  const rs = s.requirements.data.requirements;
  const numbered = reg.risks.map((r, i) => ({ ...r, id: `R-${String(i + 1).padStart(3, "0")}` }));
  const ranked = numbered.sort((a, b) => scoreOf(b) - scoreOf(a) || a.id.localeCompare(b.id));
  const count = (level: string) => reg.risks.filter((r) => levelOf(scoreOf(r)) === level).length;
  const lines = [`# ${meta.title}: ${meta.input}`, "", `Written from requirements run ${meta.requirementsRun} (${rs.length} issue(s)). Personal data is masked as tokens such as <PERSON_n>.`];
  lines.push(...section("Summary", [one(reg.summary), "", `${reg.risks.length} risk(s): ${count("high")} high, ${count("medium")} medium, ${count("low")} low. Score = probability × impact (1 to 25): high from 15, medium from 8.`]));
  lines.push(...section("Register", table(["Id", "Risk", "Category", "P", "I", "Score", "Level", "Response", "Owner", "Issues"], ranked.map((r) => [r.id, r.title, r.category, String(r.probability), String(r.impact), String(scoreOf(r)), levelOf(scoreOf(r)), r.response, r.owner, r.requirements.map(norm).join(", ") || "all"]))));
  lines.push("", "## Details");
  for (const r of ranked) {
    lines.push("", `### ${r.id}: ${one(r.title)}`, "", one(r.description), "", `- **Mitigation:** ${one(r.mitigation)}`, `- **Contingency:** ${one(r.contingency)}`, `- **Trigger:** ${one(r.trigger)}`);
  }
  if (s.testCases) {
    const uncovered = s.testCases.data.uncovered;
    lines.push(...section("Coverage gaps", uncovered.length ? [`Criteria no reviewed case covers (test cases run ${s.testCases.run}):`, "", ...bullets(uncovered.map((u) => `${u.requirement} ${u.criterion}`))] : [`Every criterion has a reviewed case (test cases run ${s.testCases.run}).`]));
  }
  lines.push(...section("Assumptions", bullets(reg.assumptions)));
  return `${lines.join("\n")}\n`;
}

export const RISK_REGISTER: DocumentType<RiskRegister> = {
  id: "risk-register",
  title: "Risk register",
  templateVersion: "risk-register-1",
  needs: { testCases: "optional", testRun: "unused" },
  schema: riskRegisterSchema,
  instructions: [
    "Write a risk register for testing the issues in the context: what could make the release fail or the testing miss defects.",
    "Find risks in the issues (missing or vague criteria, open questions, integrations, data, permissions), and in the test cases if given (criteria no case covers). Merge duplicates.",
    `Give each risk a category, a probability and an impact from 1 to 5 (Agent-QA computes the score and level), a response (avoid, mitigate, transfer, accept), a mitigation, a contingency, a trigger and an owner role. Every issue with a quality score below ${WEAK_QUALITY} must be named in at least one risk.`,
    "Owners are roles, never people. Don't invent facts the issues don't state.",
    "Values like <PERSON_1> are masked personal data: keep them exactly as they are and don't make up new ones.",
  ].join("\n"),
  context: (s) => ({ issues: issuesContext(s), ...casesContext(s.testCases?.data) }),
  check,
  render,
};
