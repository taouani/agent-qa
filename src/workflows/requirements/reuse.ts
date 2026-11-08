import { z } from "zod";
import type { RunStore, StepContext, StepDefinition } from "../../core/index.js";
import { REQUIREMENTS_ARTIFACT } from "./artifact.js";
import { inputFingerprint, jiraInputOf, pullRequestsOf, relatedFeaturesOf, type JiraInputs, type RequirementsDeps } from "./workflow.js";

/**
 * Reusing an earlier analysis (#81, Tarek 7 Nov 2026): when an earlier run
 * analyzed the same input (the same issues at the same Jira version, the same
 * related feature files and pull requests), the person may reuse it instead
 * of asking the model again. Shared by `test-cases` and `document`.
 */

/** Runs searched for an earlier analysis of the same input: the newest this many. */
export const MAX_REUSE_RUNS = 200;

export const reuseSchema = z
  .object({
    reuse: z.boolean().describe("true to reuse the earlier analysis named in the context, false to analyze again"),
    /** Set by Agent-QA, never by the model: the run whose analysis is reused. */
    run: z.string().optional(),
  })
  .strict();
export type Reuse = z.infer<typeof reuseSchema>;

/** An earlier run whose analysis had the same input as this run's. */
interface Earlier {
  run: string;
  created: string;
  issues: number;
  criteria: number;
  quality: number;
}

export type ReuseDeps = RequirementsDeps & { runs: RequirementsDeps["runs"] & Partial<Pick<RunStore, "list">> };
type ReuseInputs = JiraInputs & { requirementsRun?: string | undefined };

export function analysisReuse<I extends ReuseInputs>(deps: ReuseDeps) {
  /** The run whose analysis the person chose to reuse, if any. */
  const reused = (ctx: Pick<StepContext<I>, "outputs">) => {
    const r = ctx.outputs.reuse as Reuse | undefined;
    return r?.reuse && r.run ? r.run : undefined;
  };

  /** Whether an earlier run of this key left an analysis whose tokens are still in its vault: no Jira read (the run may not exist yet). */
  const analyzedBefore = async (ctx: StepContext<I>): Promise<boolean> => {
    const key = ctx.inputs.key;
    if (!deps.runs.list || ctx.inputs.requirementsRun !== undefined || key === undefined) return false;
    for (const id of (await deps.runs.list()).filter((r) => r !== ctx.runId).slice(-MAX_REUSE_RUNS).reverse()) {
      const art = await deps.runs.readArtifact(id, REQUIREMENTS_ARTIFACT).catch(() => undefined);
      if (art && "key" in art.data.input && art.data.input.key === key && (await deps.data.hasVault(id))) return true;
    }
    return false;
  };

  const memo = new Map<string, Promise<Earlier | undefined>>();
  /**
   * The newest earlier run whose analysis was given the same input as this one
   * would be. Its vault must still hold the tokens. Jira is read for this,
   * with no model.
   */
  const earlierOf = (ctx: StepContext<I>, fresh = false): Promise<Earlier | undefined> => {
    let found = fresh ? undefined : memo.get(ctx.runId);
    if (!found) {
      found = (async () => {
        if (!deps.runs.list || ctx.inputs.requirementsRun !== undefined) return undefined;
        const loaded = await deps.data.requirements(ctx.runId, jiraInputOf(ctx.inputs));
        const related = await relatedFeaturesOf(deps, ctx.runId, loaded);
        const prs = await pullRequestsOf(deps, ctx.runId, ctx.inputs, loaded);
        const want = inputFingerprint(loaded.sources.requirements.map((r) => ({ key: r.key, sourceHash: r.sourceHash, related: related[r.key], pullRequests: prs[r.key] })));
        let best: (Earlier & { at: string }) | undefined;
        for (const id of (await deps.runs.list()).filter((r) => r !== ctx.runId).slice(-MAX_REUSE_RUNS)) {
          const art = await deps.runs.readArtifact(id, REQUIREMENTS_ARTIFACT).catch(() => undefined);
          if (!art || inputFingerprint(art.data.requirements) !== want) continue;
          if (best && best.at >= art.createdAt) continue;
          if (!(await deps.data.hasVault(id))) continue;
          const rs = art.data.requirements;
          best = { run: id, at: art.createdAt, created: art.createdAt.slice(0, 10), issues: rs.length, criteria: rs.reduce((n, r) => n + r.acceptanceCriteria.length, 0), quality: rs.length ? Math.round(rs.reduce((n, r) => n + r.quality.score, 0) / rs.length) : 0 };
        }
        return best && { run: best.run, created: best.created, issues: best.issues, criteria: best.criteria, quality: best.quality };
      })();
      found.catch(() => memo.delete(ctx.runId));
      if (memo.size > 16) memo.delete(memo.keys().next().value!);
      memo.set(ctx.runId, found);
    }
    return found;
  };

  /** The `reuse` confirm step, entered when an earlier run analyzed the same key (and `when` allows). */
  const step = (when: (ctx: StepContext<I>) => boolean | Promise<boolean> = () => true): StepDefinition<I, Reuse> => ({
    id: "reuse",
    kind: "confirm",
    outputSchema: reuseSchema,
    // Unattended (--yes), the same input gives the same analysis: reuse it.
    answers: { yes: { reuse: true }, no: { reuse: false }, unattended: { reuse: true } },
    // Whether Jira and the repo files are unchanged needs Jira, which is read once the run exists (in the context).
    when: async (ctx) => (await when(ctx)) && analyzedBefore(ctx),
    instructions: () =>
      [
        "The context says whether an earlier run analyzed the same Jira issues, unchanged since, with the same related feature files of the repo.",
        "If it names such a run, ask the user whether to reuse that analysis (its criteria, quality scores and open questions) or analyze again, and wait for their answer: submit reuse: true to reuse it, reuse: false to analyze again.",
        "If it says the input changed, don't ask: submit reuse: false.",
      ].join("\n"),
    context: async (ctx) => {
      const e = await earlierOf(ctx);
      if (!e) return "No earlier analysis with the same input can be reused (the issues or the related feature files changed since, or its run is gone): it will be analyzed again. Submit reuse: false without asking.";
      return `Run ${e.run} (${e.created}) analyzed the same ${e.issues} issue(s), unchanged in Jira since, with the same related feature files: ${e.criteria} criteria, average quality ${e.quality}/100. Its requirements.md is in that run's folder.`;
    },
    // The run is Agent-QA's to name: the one found, whatever the answer says; with none, nothing is reused.
    sanitize: async (ctx, out: Reuse) => {
      // Checked again at the answer: Jira or the repo may have changed while the question waited.
      const e = out.reuse ? await earlierOf(ctx, true) : undefined;
      return e ? { reuse: true, run: e.run } : { reuse: false };
    },
  });

  return { reused, step };
}
