import { z } from "zod";
import type { ArtifactSpec } from "../../core/index.js";

/**
 * `requirements@1` (S1-8): the masked requirements of a run, each with a
 * quality score and open questions, ready for the test-cases workflow.
 * Every text value holds tokens such as <PERSON_1>, never real values.
 */

export const REQUIREMENTS_TEMPLATE_VERSION = "requirements-1";

export const QUALITY_GAPS = [
  "acceptance-criteria",
  "testable-criteria",
  "description",
  "scope",
  "error-handling",
  "data-rules",
  "roles-and-permissions",
  "non-functional",
  "dependencies",
  "consistency",
] as const;

const criterion = z
  .object({
    id: z.string().regex(/^AC\d+$/),
    text: z.string(),
    /** `jira`: written in the issue. `inferred`: proposed by the analysis because the issue had none. */
    origin: z.enum(["jira", "inferred"]),
    /** An inferred criterion taken from a feature file of the repo, not from the issue: its path. Check it with the author. */
    from: z.string().optional(),
  })
  .strict();

export const analyzedRequirementSchema = z
  .object({
    key: z.string(),
    type: z.string(),
    status: z.string().optional(),
    priority: z.string().optional(),
    role: z.enum(["root", "child", "linked"]),
    depth: z.number().int().min(0),
    parent: z.string().optional(),
    children: z.array(z.string()),
    links: z.array(z.object({ type: z.string(), direction: z.enum(["inward", "outward"]), description: z.string(), key: z.string() }).strict()),
    summary: z.string(),
    description: z.string(),
    acceptanceCriteria: z.array(criterion),
    acceptanceCriteriaSource: z.enum(["field", "description", "inferred", "none"]),
    /** The fields listed in `atlassian.jira.extraFields`, masked, by name. */
    extraFields: z.record(z.string(), z.string()),
    labels: z.array(z.string()),
    components: z.array(z.string()),
    fixVersions: z.array(z.string()),
    linkedPages: z.array(z.object({ id: z.string(), title: z.string(), version: z.number().int() }).strict()),
    quality: z.object({ score: z.number().int().min(0).max(100), missing: z.array(z.enum(QUALITY_GAPS)) }).strict(),
    openQuestions: z.array(z.string()),
    /** The issue's own hash from `sources@1`: same hash, same source. */
    sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type AnalyzedRequirement = z.infer<typeof analyzedRequirementSchema>;

export const requirementsArtifactSchema = z
  .object({
    /** The masked input: an issue key, or the JQL with personal data replaced. */
    input: z.union([z.object({ key: z.string() }).strict(), z.object({ jql: z.string() }).strict()]),
    requirements: z.array(analyzedRequirementSchema),
    /** True when the Jira read hit maxIssues or maxDepth. */
    truncated: z.boolean(),
    unreachable: z.array(z.string()),
  })
  .strict();
export type RequirementsArtifact = z.infer<typeof requirementsArtifactSchema>;

export const REQUIREMENTS_ARTIFACT: ArtifactSpec<RequirementsArtifact> = {
  name: "requirements",
  schema: "requirements@1",
  data: requirementsArtifactSchema,
  render: renderRequirements,
};

const one = (s: string) => s.replace(/\s+/g, " ").trim();

/** Inline code that survives backticks in the text: a longer fence, padded. */
function code(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((t) => t.length));
  const fence = "`".repeat(longest + 1);
  return longest ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

export function renderRequirements(data: RequirementsArtifact): string {
  const input = "key" in data.input ? data.input.key : `JQL ${code(one(data.input.jql))}`;
  const scores = data.requirements.map((r) => r.quality.score);
  const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const lines = [
    `# Requirements: ${input}`,
    "",
    `${data.requirements.length} issue(s), average quality ${average}/100. Personal data is masked as tokens such as <PERSON_1>.`,
  ];
  if (data.truncated) lines.push("", "**Note:** the Jira read hit a limit (maxIssues or maxDepth), so some issues are missing.");
  if (data.unreachable.length) lines.push("", `**Not readable:** ${data.unreachable.join(", ")}`);
  for (const r of data.requirements) {
    lines.push("", `## ${r.key}: ${one(r.summary)}`, "");
    const facts = [r.type, r.status, r.priority, r.role === "root" ? undefined : r.role, r.parent ? `parent ${r.parent}` : undefined].filter(Boolean);
    lines.push(`${facts.join(" · ")}`, "", `**Quality:** ${r.quality.score}/100${r.quality.missing.length ? `, missing ${r.quality.missing.join(", ")}` : ""}`);
    lines.push("", "### Acceptance criteria", "");
    if (r.acceptanceCriteria.length === 0) lines.push("None.");
    for (const ac of r.acceptanceCriteria) lines.push(`- **${ac.id}**${ac.from ? ` (inferred from repo: ${one(ac.from)})` : ac.origin === "inferred" ? " (inferred)" : ""}: ${one(ac.text)}`);
    if (r.openQuestions.length) {
      lines.push("", "### Open questions", "");
      for (const q of r.openQuestions) lines.push(`- ${one(q)}`);
    }
    if (r.links.length || r.children.length || r.linkedPages.length) {
      lines.push("", "### Related", "");
      if (r.children.length) lines.push(`- Children: ${r.children.join(", ")}`);
      for (const l of r.links) lines.push(`- ${l.description} ${l.key}`);
      for (const p of r.linkedPages) lines.push(`- Confluence: ${one(p.title)} (page ${p.id}, v${p.version})`);
    }
  }
  return lines.join("\n") + "\n";
}
