import { z } from "zod";
import type { ArtifactSpec, RunStore, StepContext, StepDefinition } from "../../core/index.js";
import type { ScriptsData } from "../../data/index.js";
import type { ScriptsDraftArtifact, ScriptsWritten } from "./artifact.js";
import type { ScriptsRun } from "./run.js";

/**
 * S2-9: in CI the generated files leave the job's checkout only as a pull
 * request: one commit of new files on a branch of their own, with the run's
 * report as its description. A draft unless every test passed and stayed
 * stable. Recorded as `scripts-pr@1`.
 */

export const scriptsPrSchema = z
  .object({
    status: z.enum(["opened", "declined"]),
    reason: z.string().optional(),
    number: z.number().optional(),
    url: z.string().optional(),
    base: z.string().optional(),
    branch: z.string().optional(),
    draft: z.boolean().optional(),
    files: z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict()),
  })
  .strict();
export type ScriptsPr = z.infer<typeof scriptsPrSchema>;

export const SCRIPTS_PR_ARTIFACT: ArtifactSpec<ScriptsPr> = {
  name: "scripts-pr",
  schema: "scripts-pr@1",
  data: scriptsPrSchema,
  render: (p) => `# Pull request: ${p.status}\n\n${p.url ? `${p.url}${p.draft ? " (draft)" : ""}\n\n` : ""}${p.reason ? `${p.reason}\n\n` : ""}${p.files.map((f) => `- ${f.path}`).join("\n")}\n`,
};

export const prSchema = z.object({ open: z.boolean().describe("true to open the pull request") }).strict();

export interface PrHelpers<I> {
  data: Pick<ScriptsData, "pullRequestReadiness" | "openPullRequest">;
  runs: Pick<RunStore, "readArtifact" | "writeArtifact">;
  tokensRun: (ctx: StepContext<I>) => Promise<string>;
  draft: (ctx: StepContext<I>) => Promise<{ data: ScriptsDraftArtifact; sourceHash: string }>;
  written: (ctx: StepContext<I>) => Promise<ScriptsWritten | undefined>;
  run: (ctx: StepContext<I>) => Promise<ScriptsRun | undefined>;
}

const one = (s: string) => s.replace(/\s+/g, " ").trim();
const cell = (s: string) => one(s).replace(/\|/g, "\\|").slice(0, 300);

/** What leaves: the files as the run left them (fixes included), else as written. */
function leaving(written: ScriptsWritten, run: ScriptsRun | undefined): Array<{ path: string; sha256: string }> {
  if (run && run.files.length) return run.files.map((f) => ({ path: f.path, sha256: f.sha256 }));
  return written.files;
}

/** The pull request's description: what was generated, and what the run showed. */
export function prBody(runId: string, draft: ScriptsDraftArtifact, files: ReadonlyArray<{ path: string }>, run: ScriptsRun | undefined): string {
  const tests = run?.attempts.at(-1)?.tests ?? [];
  const lines = [
    `Agent-QA generated these tests for ${draft.cases.map((c) => c.id).join(", ")} (run \`${runId}\`).`,
    "",
    "## Run",
    "",
    run
      ? `**${run.status}**${run.reason ? `: ${one(run.reason)}` : ""}${run.rounds ? ` (${run.rounds} fix round(s))` : ""}.`
      : "The tests were not run in CI.",
    ...(run?.stoppedOn ?? []).map((c) => `- ${cell(c.test)}: **${c.kind}** (${cell(c.reason)})`),
    ...(tests.length ? ["", "| Test | Outcome |", "|---|---|", ...tests.map((t) => `| ${cell(t.title)} | ${t.outcome}${t.runs > 1 ? ` (${t.runs - t.failedRuns}/${t.runs} passed)` : ""} |`)] : []),
    ...(run && run.attempts.some((a) => a.classified.length)
      ? ["", "### Fixes", "", ...run.attempts.flatMap((a, i) => a.classified.map((c) => `- Before run ${i + 1}: ${cell(c.test)}: ${c.kind} (${cell(c.reason)})`))]
      : []),
    "",
    "## Files",
    "",
    ...files.map((f) => `- \`${draft.folder === "." ? "" : `${draft.folder}/`}${f.path}\``),
    "",
    "Every file is new: Agent-QA never changes existing files. Fixes were limited to locators, waits and test data. Review the tests, and that each check still checks what its test case says, before merging.",
  ];
  return lines.join("\n");
}

export function prStep<I>(h: PrHelpers<I>): StepDefinition<I, unknown> {
  type Ctx = StepContext<I>;
  const save = async (ctx: Ctx, data: ScriptsPr) => {
    const d = await h.draft(ctx);
    await h.runs.writeArtifact(ctx.runId, SCRIPTS_PR_ARTIFACT, data, { inputs: [{ kind: "artifact", ref: `${ctx.runId}/scripts-draft`, hash: d.sourceHash }], templateVersion: "scripts-pr-1" });
  };
  return {
    id: "pr",
    kind: "confirm",
    outputSchema: prSchema,
    when: async (ctx) => (await h.written(ctx))?.pullRequest === true && (await h.data.pullRequestReadiness()).ready,
    // In CI the policy sends test code out as a pull request without asking, and the person's yes was the review (--accept review).
    answers: { yes: { open: true }, no: { open: false }, unattended: { open: true } },
    approval: {
      question: async (ctx) => {
        const ready = await h.data.pullRequestReadiness();
        const files = leaving((await h.written(ctx))!, await h.run(ctx));
        const run = await h.run(ctx);
        return `Open a pull request on ${ready.ready ? ready.repo : "GitHub"} with ${files.length} new file(s)${run ? ` (tests ${run.status})` : ""}? It is a draft unless every test passed and stayed stable.`;
      },
    },
    instructions: () => "Ask whether to open a pull request with the generated files. Submit open: true only if the user said yes.",
    context: async (ctx: Ctx) => {
      const d = (await h.draft(ctx)).data;
      const files = leaving((await h.written(ctx))!, await h.run(ctx));
      return prBody(ctx.runId, d, files, await h.run(ctx));
    },
    onAccept: async (ctx, out) => {
      const written = (await h.written(ctx))!;
      const run = await h.run(ctx);
      const files = leaving(written, run);
      if (!(out as z.infer<typeof prSchema>).open) return save(ctx, { status: "declined", reason: "the pull request was declined", files });
      const d = (await h.draft(ctx)).data;
      const title = `Agent-QA: tests for ${d.cases.map((c) => c.id).join(", ")}`.slice(0, 200);
      const r = await h.data.openPullRequest(ctx.runId, await h.tokensRun(ctx), d.folder, { files, title, body: prBody(ctx.runId, d, files, run), draft: run?.status !== "passed" });
      if (r.status !== "done") return save(ctx, { status: "declined", reason: "the policy said no to opening the pull request", files });
      await save(ctx, { status: "opened", number: r.number, url: r.url, base: r.base, branch: r.branch, draft: r.draft, files });
    },
  };
}
