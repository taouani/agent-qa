import { z } from "zod";
import type { OutputError } from "../../core/index.js";
import { bullets, code, one, section, table, type RawCell } from "./markdown.js";
import { casesContext, issuesContext, knownKeys, norm } from "./shared.js";
import type { DocumentMeta, DocumentSources, DocumentType } from "./types.js";

/**
 * The `test-data` document type (S4-4, from v1's generate-test-data): data
 * sets per issue (valid, invalid, boundary, empty, security), each a list of
 * field values and the expected result, linked to reviewed cases when given.
 */

const text = (max = 1000) => z.string().trim().min(1).max(max);
export const DATA_KINDS = ["valid", "invalid", "boundary", "empty", "security"] as const;

export const testDataSchema = z
  .object({
    summary: text(2000),
    sets: z
      .array(
        z
          .object({
            requirement: z.string().describe("The issue key the data is for"),
            kind: z.enum(DATA_KINDS),
            description: text(),
            fields: z
              .array(z.object({ name: text(100), value: z.string().max(500).describe("The value; empty for an empty field"), note: z.string().max(300).optional() }).strict())
              .min(1)
              .max(30),
            expected: text().describe("What the system should do with this data"),
            cases: z.array(z.string()).describe("Ids of the test cases (TC-...) that use this set; empty without test cases"),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    setup: z.array(text()).max(20).describe("Records or configuration the data needs before the tests run"),
    rules: z.array(text()).max(20).describe("Rules for handling the data, e.g. reset between runs"),
  })
  .strict();
export type TestData = z.infer<typeof testDataSchema>;

function check(s: DocumentSources, data: TestData): OutputError[] {
  const errors: OutputError[] = [
    ...knownKeys(s, data.sets.map((x, i): [string, string] => [`$.sets.${i}.requirement`, x.requirement])),
  ];
  const cases = new Map((s.testCases?.data.cases ?? []).map((c) => [c.id, c.requirement]));
  data.sets.forEach((x, i) =>
    x.cases.forEach((id, j) => {
      const of = cases.get(id);
      if (of === undefined) errors.push({ path: `$.sets.${i}.cases.${j}`, message: s.testCases ? `${id} isn't a reviewed case of the context` : "there are no test cases in the context: leave cases empty" });
      else if (of !== norm(x.requirement)) errors.push({ path: `$.sets.${i}.cases.${j}`, message: `${id} is a case of ${of}, not of ${norm(x.requirement)}` });
    }),
  );
  // An issue with criteria needs data that should work and data that shouldn't.
  for (const r of s.requirements.data.requirements.filter((x) => x.acceptanceCriteria.length > 0)) {
    const kinds = new Set(data.sets.filter((x) => norm(x.requirement) === r.key).map((x) => x.kind));
    if (!kinds.has("valid")) errors.push({ path: "$.sets", message: `${r.key} has no valid data set` });
    if (!kinds.has("invalid") && !kinds.has("boundary") && !kinds.has("empty")) errors.push({ path: "$.sets", message: `${r.key} has no invalid, boundary or empty data set` });
  }
  return errors;
}

/** A value as a table cell, kept exact: in code, pipes escaped and line breaks shown as \\n; an empty one says so. */
const value = (v: string): RawCell => ({ raw: v === "" ? "(empty)" : code(v.replace(/\|/g, "\\|").replace(/\r?\n/g, "\\n")) });

function render(data: TestData, s: DocumentSources, meta: DocumentMeta): string {
  const rs = s.requirements.data.requirements;
  const lines = [`# ${meta.title}: ${meta.input}`, "", `Written from requirements run ${meta.requirementsRun} (${rs.length} issue(s)). Personal data is masked as tokens such as <PERSON_n>; every other value is made up for testing.`];
  lines.push(...section("Summary", [one(data.summary), "", ...table(["Issue", ...DATA_KINDS], rs.map((r) => [r.key, ...DATA_KINDS.map((k) => String(data.sets.filter((x) => norm(x.requirement) === r.key && x.kind === k).length))]))]));
  for (const r of rs) {
    const sets = data.sets.filter((x) => norm(x.requirement) === r.key);
    if (sets.length === 0) continue;
    lines.push("", `## ${r.key}: ${one(r.summary)}`);
    for (const x of sets) {
      const id = `TD-${String(data.sets.indexOf(x) + 1).padStart(3, "0")}`;
      lines.push("", `### ${id} (${x.kind}): ${one(x.description)}`, "", ...table(["Field", "Value", "Note"], x.fields.map((f) => [f.name, value(f.value), f.note ?? ""])), "", `**Expected:** ${one(x.expected)}`);
      if (x.cases.length) lines.push("", `Used by ${x.cases.join(", ")}.`);
    }
  }
  lines.push(...section("Setup", bullets(data.setup)));
  lines.push(...section("Handling rules", bullets(data.rules)));
  return `${lines.join("\n")}\n`;
}

export const TEST_DATA: DocumentType<TestData> = {
  id: "test-data",
  title: "Test data",
  templateVersion: "test-data-1",
  needs: { testCases: "optional", testRun: "unused" },
  schema: testDataSchema,
  instructions: [
    "Write test data sets for the issues in the context. Agent-QA numbers them TD-001, TD-002 and so on, in the order you write them.",
    "For every issue with acceptance criteria, give at least one valid set and at least one invalid, boundary or empty set; add security sets (injection, oversized input) only where the issue takes free input.",
    "Each set lists field names and values, and the expected result. Values must be made up and obviously fake (example.com addresses, 555 numbers, Test User names), never real people or real data.",
    "If the context has testCases, name the cases (TC-...) that use each set; a set and its cases belong to the same issue. Without test cases, leave cases empty.",
    "Values like <PERSON_1> are masked personal data from the issues: keep them exactly as they are and don't make up new ones.",
  ].join("\n"),
  context: (s) => ({ issues: issuesContext(s), ...casesContext(s.testCases?.data) }),
  check,
  render,
};
