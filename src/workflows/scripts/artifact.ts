import { z } from "zod";
import type { ArtifactSpec } from "../../core/index.js";
import { CASE_ID } from "../test-cases/artifact.js";

/**
 * `scripts-draft@1` (S2-6): the code the model generated for reviewed test
 * cases, after the server's checks, before the person's review (S2-7). Every
 * file is new: generated code calls the repo's existing page objects and
 * steps, and never changes them. No file holds a token or a real value: data
 * goes into a test-data file of named made-up values (faker where the repo
 * has it).
 */

export const SCRIPTS_TEMPLATE_VERSION = "scripts-1";

/** Files in a draft, the helper file the server adds included. */
export const SCRIPTS_MAX_FILES = 30;

export const FILE_ROLES = ["spec", "feature", "steps", "page", "data", "helper"] as const;
export type FileRole = (typeof FILE_ROLES)[number];

export const generatedFileSchema = z
  .object({
    path: z.string().min(1).max(300).describe("Path from the framework folder, with forward slashes, e.g. tests/features/ABC-1.feature"),
    role: z.enum(FILE_ROLES).describe("spec: a Playwright test file; feature: Gherkin; steps: step definitions; page: a page object; data: test data; helper: the pack's lightning.ts"),
    content: z.string().max(60_000).describe("The whole file"),
  })
  .strict();
export type GeneratedFile = z.infer<typeof generatedFileSchema>;

export const stepLinkSchema = z
  .object({
    step: z.number().int().min(1).max(30).describe("The test step (1-based)"),
    file: z.string().min(1).max(300).describe("The generated file that performs it: the feature (BDD) or the spec"),
    line: z.number().int().min(1).describe("The line: the Gherkin step, or the test.step(...) call"),
  })
  .strict();

export const caseCodeSchema = z
  .object({
    id: z.string().regex(CASE_ID),
    steps: z.array(stepLinkSchema).min(1).max(30),
  })
  .strict();

export const scriptsDraftSchema = z
  .object({
    files: z.array(generatedFileSchema).min(1).max(SCRIPTS_MAX_FILES),
    cases: z.array(caseCodeSchema).min(1).max(20),
    /** Anything the model wants the person to know: a step it couldn't automate, a value they must fill in. Masked. */
    notes: z.array(z.string().max(500)).max(20).default([]),
  })
  .strict();
export type ScriptsDraft = z.infer<typeof scriptsDraftSchema>;

export const scriptsDraftArtifactSchema = scriptsDraftSchema.extend({
  testCases: z.object({ run: z.string(), sourceHash: z.string() }).strict(),
  exploration: z.object({ run: z.string(), sourceHash: z.string() }).strict().optional(),
  folder: z.string(),
  kind: z.enum(["playwright", "playwright-bdd"]),
  /** passed: no errors with the repo's own TypeScript; skipped: the person said no; unavailable: no typescript or tsconfig in the repo. */
  typeCheck: z.object({ status: z.enum(["passed", "skipped", "unavailable"]), reason: z.string().optional() }).strict(),
});
export type ScriptsDraftArtifact = z.infer<typeof scriptsDraftArtifactSchema>;

function renderDraft(d: ScriptsDraftArtifact): string {
  const lines = [`# Generated scripts (draft)`, "", `Framework: ${d.kind} in ${d.folder || "."}. Test cases: run ${d.testCases.run}${d.exploration ? `; exploration: run ${d.exploration.run}` : ""}.`, `Type check: ${d.typeCheck.status}${d.typeCheck.reason ? ` (${d.typeCheck.reason})` : ""}.`, "", "| File | Role | Lines |", "|---|---|---|"];
  for (const f of d.files) lines.push(`| ${f.path} | ${f.role} | ${f.content.split("\n").length} |`);
  lines.push("", "| Case | Steps covered |", "|---|---|");
  for (const c of d.cases) lines.push(`| ${c.id} | ${c.steps.map((s) => `${s.step} → ${s.file}:${s.line}`).join(", ")} |`);
  if (d.notes.length) lines.push("", "## Notes", ...d.notes.map((n) => `- ${n.replace(/\s+/g, " ")}`));
  return `${lines.join("\n")}\n`;
}

export const SCRIPTS_DRAFT_ARTIFACT: ArtifactSpec<ScriptsDraftArtifact> = {
  name: "scripts-draft",
  schema: "scripts-draft@1",
  data: scriptsDraftArtifactSchema,
  render: renderDraft,
};

/**
 * `scripts-written@1` (S2-7): what the person's review did with the draft.
 * written: every file was created in the repo (none replaced); declined:
 * nothing was written. pullRequest: written in CI's own checkout, so they
 * leave only as a pull request (S2-9).
 */
export const scriptsWrittenSchema = z
  .object({
    status: z.enum(["written", "declined"]),
    pullRequest: z.literal(true).optional(),
    folder: z.string(),
    files: z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict()),
  })
  .strict();
export type ScriptsWritten = z.infer<typeof scriptsWrittenSchema>;

export const SCRIPTS_WRITTEN_ARTIFACT: ArtifactSpec<ScriptsWritten> = {
  name: "scripts-written",
  schema: "scripts-written@1",
  data: scriptsWrittenSchema,
  render: (w) => `# Generated scripts: ${w.status}\n\n${w.files.map((f) => `- ${w.folder === "." ? "" : `${w.folder}/`}${f.path}`).join("\n")}\n`,
};
