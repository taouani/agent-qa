import { z } from "zod";
import type { OutputError } from "../../core/index.js";
import { bullets, one, section, table } from "./markdown.js";
import { casesContext, issuesContext, keysOf, knownKeys, norm } from "./shared.js";
import type { DocumentMeta, DocumentSources, DocumentType } from "./types.js";

/**
 * The `test-charter` document type (S4-4, from v1's generate-test-charter):
 * an exploratory testing charter, with the areas to explore and time-boxed
 * sessions that between them reach every issue.
 */

const text = (max = 1000) => z.string().trim().min(1).max(max);
const keys = z.array(z.string()).describe("Issue keys of the context");
const area = z.object({ area: text(), requirements: keys }).strict();
export const AREA_KINDS = ["complex", "edgeCases", "integrations", "unclear"] as const;

export const testCharterSchema = z
  .object({
    mission: text(2000).describe("What this exploration sets out to learn, in one or two sentences"),
    inScope: z.array(text()).min(1).max(30),
    outOfScope: z.array(text()).max(30),
    areas: z
      .object({
        complex: z.array(area).max(20).describe("Complex logic or flows"),
        edgeCases: z.array(area).max(20),
        integrations: z.array(area).max(20),
        unclear: z.array(area).max(20).describe("Where the acceptance criteria are missing, inferred or vague"),
      })
      .strict(),
    techniques: z.array(text()).min(1).max(15).describe("Exploratory techniques, e.g. persona-based, boundary, state transition"),
    heuristics: z.array(text()).max(10).describe("Heuristics such as SFDIPOT, with what each is used for here"),
    sessions: z
      .array(
        z
          .object({
            title: text(200),
            focus: text(),
            timeboxMinutes: z.number().int().min(30).max(240),
            requirements: keys.min(1),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    personas: z.array(text()).max(10).describe("Roles to test as, never people's names"),
    testData: z.array(text()).max(20),
    debrief: text(2000).describe("What a session's notes record and how findings are followed up"),
    risks: z.array(text()).max(20),
  })
  .strict();
export type TestCharter = z.infer<typeof testCharterSchema>;

function check(s: DocumentSources, ch: TestCharter): OutputError[] {
  const entries: Array<[string, string]> = [
    ...AREA_KINDS.flatMap((kind) => ch.areas[kind].flatMap((a, i) => a.requirements.map((k, j): [string, string] => [`$.areas.${kind}.${i}.requirements.${j}`, k]))),
    ...ch.sessions.flatMap((x, i) => x.requirements.map((k, j): [string, string] => [`$.sessions.${i}.requirements.${j}`, k])),
  ];
  const reached = new Set(ch.sessions.flatMap((x) => x.requirements.map(norm)));
  const missing = [...keysOf(s)].filter((k) => !reached.has(k));
  return [...knownKeys(s, entries), ...(missing.length ? [{ path: "$.sessions", message: `no session explores ${missing.join(", ")}` }] : [])];
}

const AREA_TITLES: Record<(typeof AREA_KINDS)[number], string> = { complex: "Complex areas", edgeCases: "Edge cases", integrations: "Integration points", unclear: "Unclear requirements" };
const keyList = (ks: readonly string[]) => ks.map(norm).join(", ");

function render(ch: TestCharter, s: DocumentSources, meta: DocumentMeta): string {
  const rs = s.requirements.data.requirements;
  const minutes = ch.sessions.reduce((n, x) => n + x.timeboxMinutes, 0);
  const lines = [`# ${meta.title}: ${meta.input}`, "", `Written from requirements run ${meta.requirementsRun} (${rs.length} issue(s)). Personal data is masked as tokens such as <PERSON_n>.`];
  lines.push(...section("Mission", [one(ch.mission)]));
  lines.push(...section("Scope", ["### In scope", "", ...bullets(ch.inScope), "", "### Out of scope", "", ...bullets(ch.outOfScope)]));
  lines.push("", "## Areas to explore");
  for (const kind of AREA_KINDS) {
    lines.push("", `### ${AREA_TITLES[kind]}`, "", ...bullets(ch.areas[kind].map((a) => `${a.area}${a.requirements.length ? ` (${keyList(a.requirements)})` : ""}`)));
  }
  lines.push(...section("Approach", ["Techniques:", "", ...bullets(ch.techniques), ...(ch.heuristics.length ? ["", "Heuristics:", "", ...bullets(ch.heuristics)] : [])]));
  lines.push(...section("Sessions", [`${ch.sessions.length} session(s), ${Math.round(minutes / 6) / 10} h in all.`, "", ...table(["#", "Session", "Focus", "Time box", "Issues"], ch.sessions.map((x, i) => [String(i + 1), x.title, x.focus, `${x.timeboxMinutes} min`, keyList(x.requirements)]))]));
  lines.push(...section("Personas", bullets(ch.personas)));
  lines.push(...section("Test data", bullets(ch.testData)));
  lines.push(...section("Debrief", [one(ch.debrief)]));
  lines.push(...section("Risks", bullets(ch.risks)));
  return `${lines.join("\n")}\n`;
}

export const TEST_CHARTER: DocumentType<TestCharter> = {
  id: "test-charter",
  title: "Test charter",
  templateVersion: "test-charter-1",
  needs: { testCases: "optional", testRun: "unused" },
  schema: testCharterSchema,
  instructions: [
    "Write an exploratory testing charter for the issues in the context.",
    "List the areas worth exploring: complex logic, edge cases, integration points, and where the criteria are missing, inferred or vague (with the issues each is about).",
    "Plan time-boxed sessions (30 to 240 minutes) that between them explore every issue, each with a focus; name the issues each session explores.",
    "If the context has testCases, explore what scripted cases miss: uncovered criteria and the edges around the cases, not the cases again.",
    "Personas are roles, never people. Don't invent features or systems the issues don't imply.",
    "Values like <PERSON_1> are masked personal data: keep them exactly as they are and don't make up new ones.",
  ].join("\n"),
  context: (s) => ({ issues: issuesContext(s), ...casesContext(s.testCases?.data) }),
  check,
  render,
};
