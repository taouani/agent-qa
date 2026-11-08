import { z } from "zod";
import type { OutputError } from "../../core/index.js";
import { bullets, code, one, section } from "./markdown.js";
import { casesContext, everyIssueOnce, issuesContext, knownKeys, norm, runContext } from "./shared.js";
import type { DocumentMeta, DocumentSources, DocumentType } from "./types.js";

/**
 * The `release-notes` document type (S4-4, from v1's generate-release-notes):
 * every issue once, by category, in words a user reads, with known issues
 * and the testing done (counted by Agent-QA from the reviewed cases and the
 * test run when given).
 *
 * With pull requests (S4-7: the requirements analysis ran with
 * withPullRequests), a technical section too: per issue with pull requests,
 * what the code changed and the files that matter, checked against the
 * issue's own pull request files. Agent-QA lists the pull requests itself.
 */

const text = (max = 1000) => z.string().trim().min(1).max(max);
export const RELEASE_CATEGORIES = ["feature", "improvement", "fix", "other"] as const;
const CATEGORY_TITLES: Record<(typeof RELEASE_CATEGORIES)[number], string> = { feature: "New features", improvement: "Improvements", fix: "Fixes", other: "Other changes" };

export const releaseNotesSchema = z
  .object({
    summary: text(2000).describe("What this release brings, for its users, in one short paragraph"),
    highlights: z.array(text()).max(10),
    items: z
      .array(z.object({ key: z.string(), category: z.enum(RELEASE_CATEGORIES), note: text().describe("The change as a user would describe it") }).strict())
      .min(1)
      .describe("Every issue of the context, once"),
    knownIssues: z.array(z.object({ description: text(), requirements: z.array(z.string()) }).strict()).max(30),
    upgradeNotes: z.array(text()).max(20).describe("What users or admins must do: configuration, data, permissions; empty if nothing"),
    technical: z
      .array(
        z
          .object({
            key: z.string(),
            changes: text(2000).describe("What the code changed, for developers and testers: components, behaviour, data, configuration"),
            files: z.array(z.string()).max(20).describe("The changed files that matter most, paths exactly as in the issue's pullRequests"),
          })
          .strict(),
      )
      .max(100)
      .optional()
      .describe("Only when the context has pullRequests: every issue with pull requests, once. Leave out otherwise"),
  })
  .strict();
export type ReleaseNotes = z.infer<typeof releaseNotesSchema>;

/** The fix versions every issue shares, or all of them when they share none. */
export function versionsOf(s: DocumentSources): string[] {
  const rs = s.requirements.data.requirements;
  const all = [...new Set(rs.flatMap((r) => r.fixVersions))];
  const shared = all.filter((v) => rs.every((r) => r.fixVersions.includes(v)));
  return shared.length ? shared : all;
}

/** The issues with pull requests, in the requirements' order. */
const withPrs = (s: DocumentSources) => s.requirements.data.requirements.filter((r) => s.pullRequests?.byIssue[r.key]?.length);

function check(s: DocumentSources, notes: ReleaseNotes): OutputError[] {
  const errors = [
    ...everyIssueOnce(s, "$.items", notes.items.map((i) => i.key)),
    ...knownKeys(s, notes.knownIssues.flatMap((k, i) => k.requirements.map((key, j): [string, string] => [`$.knownIssues.${i}.requirements.${j}`, key]))),
  ];
  const technical = notes.technical ?? [];
  const expected = withPrs(s).map((r) => r.key);
  if (expected.length === 0) {
    if (technical.length) errors.push({ path: "$.technical", message: "the context has no pullRequests: leave technical out" });
    return errors;
  }
  const seen = new Set<string>();
  technical.forEach((t, i) => {
    const key = norm(t.key);
    if (!expected.includes(key)) errors.push({ path: `$.technical.${i}.key`, message: `${t.key} has no pullRequests in the context` });
    else if (seen.has(key)) errors.push({ path: `$.technical.${i}.key`, message: `${key} is listed more than once` });
    seen.add(key);
    const files = new Set((s.pullRequests?.byIssue[key] ?? []).flatMap((p) => p.files.map((f) => f.path)));
    t.files.forEach((f, j) => {
      if (!files.has(f)) errors.push({ path: `$.technical.${i}.files.${j}`, message: `${f} isn't a file of ${key}'s pullRequests` });
    });
  });
  const missing = expected.filter((k) => !seen.has(k));
  if (missing.length) errors.push({ path: "$.technical", message: `no technical entry for ${missing.join(", ")}` });
  return errors;
}

function render(notes: ReleaseNotes, s: DocumentSources, meta: DocumentMeta): string {
  const summaries = new Map(s.requirements.data.requirements.map((r) => [r.key, r.summary]));
  const versions = versionsOf(s);
  const lines = [`# ${meta.title}${versions.length ? `: ${versions.join(", ")}` : `: ${meta.input}`}`, "", `Written from requirements run ${meta.requirementsRun} (${summaries.size} issue(s)). Personal data is masked as tokens such as <PERSON_n>.`];
  lines.push(...section("Summary", [one(notes.summary), ...(notes.highlights.length ? ["", "Highlights:", "", ...bullets(notes.highlights)] : [])]));
  for (const category of RELEASE_CATEGORIES) {
    const items = notes.items.filter((i) => i.category === category);
    if (items.length) lines.push(...section(CATEGORY_TITLES[category], items.map((i) => `- **${norm(i.key)}** (${one(summaries.get(norm(i.key)) ?? "")}): ${one(i.note)}`)));
  }
  lines.push(...section("Known issues", bullets(notes.knownIssues.map((k) => `${k.description}${k.requirements.length ? ` (${k.requirements.map(norm).join(", ")})` : ""}`))));
  lines.push(...section("Upgrade notes", bullets(notes.upgradeNotes, "Nothing to do.")));
  const testing: string[] = [];
  if (s.testCases) {
    const cases = s.testCases.data;
    testing.push(`- ${cases.cases.length} reviewed test case(s) (run ${s.testCases.run}), ${cases.uncovered.length} criteria without a case.`);
  }
  if (s.testRun) {
    const c = s.testRun.data.counts;
    testing.push(`- Test run ${s.testRun.run}: ${s.testRun.data.status}, ${c.passed} passed, ${c.failed} failed, ${c.flaky} flaky, ${c.skipped} skipped.`);
  }
  if (testing.length) lines.push(...section("Testing", testing));
  const prsOf = (key: string) => s.pullRequests?.byIssue[key] ?? [];
  const technical = withPrs(s);
  if (technical.length) {
    const byKey = new Map((notes.technical ?? []).map((t) => [norm(t.key), t]));
    lines.push("", "## Technical changes", "", `From the pull requests that name each issue (requirements run ${s.pullRequests!.run}).`);
    for (const r of technical) {
      const t = byKey.get(r.key);
      const prs = prsOf(r.key);
      lines.push("", `### ${r.key}: ${one(r.summary)}`, "", ...(t ? [one(t.changes), ""] : []));
      lines.push(...prs.map((p) => `- #${p.id} ${one(p.title)} (${p.state}, ${p.files.length} file(s)): ${p.url}`));
      if (t?.files.length) lines.push("", `Files: ${t.files.map((f) => code(f)).join(", ")}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export const RELEASE_NOTES: DocumentType<ReleaseNotes> = {
  id: "release-notes",
  title: "Release notes",
  templateVersion: "release-notes-2",
  needs: { testCases: "optional", testRun: "optional" },
  schema: releaseNotesSchema,
  instructions: [
    "Write release notes for the issues in the context, usually one fix version's issues.",
    "Name every issue once under items, with a category (feature, improvement, fix, other) and a note that says the change the way a user would, not how it was built. Highlights are the few changes that matter most.",
    "Known issues are what the context shows still open: open questions, criteria without a case, failed tests. Name the issues each is about. Upgrade notes are only what someone must do; leave them empty if nothing.",
    "Agent-QA adds the version and the testing figures itself: don't count tests. Don't invent changes the issues don't describe.",
    "If the context has pullRequests (the code changes that name each issue, masked, some diffs left out past a size cap), add technical: for every issue with pull requests, once, what the code changed (for developers and testers: components, behaviour, data, configuration) and the files that matter most, with their paths exactly as given. Agent-QA lists the pull requests itself. Without pullRequests, leave technical out.",
    "Values like <PERSON_1> are masked personal data: keep them exactly as they are and don't make up new ones. Test results show masked values as [masked].",
  ].join("\n"),
  context: (s) => ({
    versions: versionsOf(s),
    issues: issuesContext(s, 800),
    ...casesContext(s.testCases?.data),
    ...runContext(s.testRun?.data),
    ...(withPrs(s).length
      ? {
          pullRequests: Object.fromEntries(
            withPrs(s).map((r) => [
              r.key,
              s.pullRequests!.byIssue[r.key]!.map((p) => ({ id: p.id, title: p.title, state: p.state, files: p.files.map((f) => ({ path: f.path, status: f.status, diff: f.patch ?? "(left out: over the size cap, or not sent by the host)" })) })),
            ]),
          ),
        }
      : {}),
  }),
  check,
  render,
};
