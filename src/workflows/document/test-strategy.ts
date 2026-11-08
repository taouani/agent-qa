import { z } from "zod";
import type { OutputError } from "../../core/index.js";
import { bullets, one, section, table } from "./markdown.js";
import { casesContext, issuesContext, knownKeys } from "./shared.js";
import type { DocumentMeta, DocumentSources, DocumentType } from "./types.js";

/**
 * The `test-strategy` document type (S4-4, from v1's generate-test-strategy):
 * context, test levels with entry and exit criteria, test types with the
 * issues that need them, automation, environments and metrics.
 */

const text = (max = 1000) => z.string().trim().min(1).max(max);
const keys = z.array(z.string()).describe("Issue keys of the context");
export const TEST_LEVELS = ["unit", "integration", "system", "acceptance"] as const;
export const TEST_TYPES = ["functional", "regression", "negative", "integration", "data", "security", "performance", "usability", "accessibility", "compatibility"] as const;

export const testStrategySchema = z
  .object({
    summary: text(3000).describe("The strategy in one short paragraph"),
    context: z
      .object({
        releaseType: z.enum(["major", "minor", "patch", "unknown"]),
        businessImpact: z.enum(["high", "medium", "low"]),
        targetUsers: z.array(text()).max(15).describe("Roles or personas, never people's names"),
        integrations: z.array(text()).max(20).describe("External systems and APIs the issues touch"),
        dependencies: z.array(text()).max(20),
      })
      .strict(),
    objectives: z.array(text()).min(1).max(15),
    levels: z
      .array(
        z
          .object({
            level: z.enum(TEST_LEVELS),
            objective: text(),
            approach: text(2000),
            entryCriteria: z.array(text()).min(1).max(10),
            exitCriteria: z.array(text()).min(1).max(10),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    types: z
      .array(z.object({ type: z.enum(TEST_TYPES), reason: text(), requirements: keys }).strict())
      .min(2)
      .max(10)
      .describe("functional and regression always; the others only where an issue calls for them"),
    automation: z.object({ approach: text(2000), candidates: keys.describe("Issues whose tests should be automated first") }).strict(),
    environments: z.array(text()).max(20),
    tools: z.array(text()).max(20),
    defects: text(2000).describe("How defects are logged, triaged and retested"),
    metrics: z.array(text()).min(1).max(15),
    risks: z.array(z.object({ risk: text(), mitigation: text() }).strict()).max(20),
    assumptions: z.array(text()).max(30),
  })
  .strict();
export type TestStrategy = z.infer<typeof testStrategySchema>;

function check(s: DocumentSources, st: TestStrategy): OutputError[] {
  const errors: OutputError[] = [];
  const levels = st.levels.map((l) => l.level);
  levels.forEach((l, i) => levels.indexOf(l) !== i && errors.push({ path: `$.levels.${i}.level`, message: `${l} is listed more than once` }));
  const types = st.types.map((t) => t.type);
  types.forEach((t, i) => types.indexOf(t) !== i && errors.push({ path: `$.types.${i}.type`, message: `${t} is listed more than once` }));
  for (const must of ["functional", "regression"] as const) if (!types.includes(must)) errors.push({ path: "$.types", message: `a strategy always has ${must} testing` });
  errors.push(
    ...knownKeys(s, [
      ...st.types.flatMap((t, i) => t.requirements.map((k, j): [string, string] => [`$.types.${i}.requirements.${j}`, k])),
      ...st.automation.candidates.map((k, j): [string, string] => [`$.automation.candidates.${j}`, k]),
    ]),
  );
  return errors;
}

function render(st: TestStrategy, s: DocumentSources, meta: DocumentMeta): string {
  const rs = s.requirements.data.requirements;
  const c = st.context;
  const lines = [`# ${meta.title}: ${meta.input}`, "", `Written from requirements run ${meta.requirementsRun} (${rs.length} issue(s)). Personal data is masked as tokens such as <PERSON_n>.`];
  lines.push(...section("Summary", [one(st.summary)]));
  lines.push(
    ...section("Context", [
      `- **Release type:** ${c.releaseType}`,
      `- **Business impact:** ${c.businessImpact}`,
      `- **Issues:** ${rs.map((r) => r.key).join(", ")}`,
      `- **Target users:** ${c.targetUsers.map(one).join("; ") || "not stated"}`,
      `- **Integrations:** ${c.integrations.map(one).join("; ") || "none named"}`,
      `- **Dependencies:** ${c.dependencies.map(one).join("; ") || "none named"}`,
    ]),
  );
  lines.push(...section("Objectives", bullets(st.objectives)));
  lines.push("", "## Test levels");
  for (const l of [...st.levels].sort((a, b) => TEST_LEVELS.indexOf(a.level) - TEST_LEVELS.indexOf(b.level))) {
    lines.push("", `### ${l.level[0]!.toUpperCase()}${l.level.slice(1)} testing`, "", `**Objective:** ${one(l.objective)}`, "", one(l.approach), "", "Entry criteria:", "", ...bullets(l.entryCriteria), "", "Exit criteria:", "", ...bullets(l.exitCriteria));
  }
  lines.push(...section("Test types", table(["Type", "Why", "Issues"], st.types.map((t) => [t.type, t.reason, t.requirements.map((k) => k.trim().toUpperCase()).join(", ") || "all"]))));
  lines.push(...section("Automation", [one(st.automation.approach), ...(st.automation.candidates.length ? ["", `Automate first: ${st.automation.candidates.map((k) => k.trim().toUpperCase()).join(", ")}.`] : [])]));
  if (s.testCases) {
    const cases = s.testCases.data.cases;
    const p = (x: string) => cases.filter((tc) => tc.priority === x).length;
    lines.push("", `Reviewed test cases (run ${s.testCases.run}): ${cases.length}, of which ${p("P1")} P1, ${p("P2")} P2, ${p("P3")} P3, ${p("P4")} P4.`);
  }
  lines.push(...section("Environments", bullets(st.environments)));
  lines.push(...section("Tools", bullets(st.tools)));
  lines.push(...section("Defect management", [one(st.defects)]));
  lines.push(...section("Metrics", bullets(st.metrics)));
  lines.push(...section("Risks", st.risks.length ? table(["Risk", "Mitigation"], st.risks.map((r) => [r.risk, r.mitigation])) : ["None named."]));
  lines.push(...section("Assumptions and open questions", bullets(st.assumptions)));
  return `${lines.join("\n")}\n`;
}

export const TEST_STRATEGY: DocumentType<TestStrategy> = {
  id: "test-strategy",
  title: "Test strategy",
  templateVersion: "test-strategy-1",
  needs: { testCases: "optional", testRun: "unused" },
  schema: testStrategySchema,
  instructions: [
    "Write a test strategy for the issues in the context: how this scope is tested, not the individual cases.",
    "Pick the test levels that apply (unit, integration, system, acceptance), each with its objective, approach, entry and exit criteria.",
    "Test types: functional and regression always; add security, performance, usability, accessibility, compatibility, integration, data or negative testing only where an issue's description or criteria call for it, and name those issues.",
    "Base the release type and business impact on the issues (types, priorities, fix versions); say unknown when they don't tell. Target users are roles, never people.",
    "Don't invent systems, tools or dates the issues don't imply; put what you had to assume, and open questions that matter for testing, under assumptions.",
    "Values like <PERSON_1> are masked personal data: keep them exactly as they are and don't make up new ones.",
  ].join("\n"),
  context: (s) => ({ issues: issuesContext(s), ...casesContext(s.testCases?.data) }),
  check,
  render,
};
