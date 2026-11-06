import { z } from "zod";
import type { StepContext, StepDefinition } from "../../core/index.js";
import type { ScriptsData } from "../../data/index.js";

/**
 * In CI, changes to the person's own test files (S3-1) are in the job's
 * checkout: they leave only as a pull request (S2-9), a draft unless the
 * workflow says the result is ready. Shared by `debug` and `review`.
 */

export const testFilesPrRecordSchema = z
  .object({ status: z.enum(["opened", "declined"]), reason: z.string().optional(), number: z.number().optional(), url: z.string().optional(), branch: z.string().optional(), draft: z.boolean().optional() })
  .strict();
export type TestFilesPrRecord = z.infer<typeof testFilesPrRecordSchema>;

/** One change written to a file, as a report records it. */
export interface WrittenChange {
  path: string;
  sha256: string;
  gitBlob: string;
}

/** Each changed file once: its bytes now (the last change's sha256) and its blob on the base (the first change's). */
export function leaving(changes: readonly WrittenChange[]): Array<{ path: string; sha256: string; gitBlob: string }> {
  const out = new Map<string, { path: string; sha256: string; gitBlob: string }>();
  for (const c of changes) out.set(c.path, { path: c.path, sha256: c.sha256, gitBlob: out.get(c.path)?.gitBlob ?? c.gitBlob });
  return [...out.values()];
}

const prSchema = z.object({ open: z.boolean().describe("true to open the pull request") }).strict();

export interface TestFilesPrOptions<I, R> {
  data: Pick<ScriptsData, "pullRequestReadiness" | "openPullRequest">;
  read: (ctx: StepContext<I>) => Promise<R | undefined>;
  save: (ctx: StepContext<I>, record: R) => Promise<unknown>;
  /** Whether the run is over with changes in CI's checkout, and no pull request recorded yet. */
  due: (record: R) => boolean;
  changes: (record: R) => readonly WrittenChange[];
  folder: (record: R) => string;
  pr: (record: R) => TestFilesPrRecord | undefined;
  withPr: (record: R, pr: TestFilesPrRecord) => R;
  title: (record: R) => string;
  /** Masked text only: openPullRequest masks it again. */
  body: (runId: string, record: R) => string;
  /** Ready to merge: otherwise the pull request is a draft. */
  ready: (record: R) => boolean;
  /** What the question says the run ended as. */
  outcome: (record: R) => string;
}

export function testFilesPrStep<I, R>(o: TestFilesPrOptions<I, R>): StepDefinition<I, z.infer<typeof prSchema>> {
  return {
    id: "pr",
    kind: "confirm",
    outputSchema: prSchema,
    when: async (ctx) => {
      const r = await o.read(ctx);
      return !!r && o.due(r) && o.changes(r).length > 0 && !o.pr(r);
    },
    // In CI the policy sends test code out as a pull request without asking: the person's yes was each change (--accept …).
    answers: { yes: { open: true }, no: { open: false }, unattended: { open: true } },
    approval: {
      question: async (ctx) => {
        const r = (await o.read(ctx))!;
        const ready = await o.data.pullRequestReadiness();
        if (!ready.ready) return `No pull request can be opened (${ready.reason}): the changes stay in this checkout only. Submit any answer to finish.`;
        return `Open a pull request on ${ready.repo} with the changes to ${leaving(o.changes(r)).length} file(s) (${o.outcome(r)})?${o.ready(r) ? "" : " It opens as a draft: the run didn't end ready to merge."}`;
      },
    },
    instructions: () => "Ask whether to open a pull request with the changed test files. Submit open: true only if the user said yes.",
    context: async (ctx) => o.body(ctx.runId, (await o.read(ctx))!),
    onAccept: async (ctx, out) => {
      const r = await o.read(ctx);
      if (!r || o.pr(r)) return;
      const ready = await o.data.pullRequestReadiness();
      if (!ready.ready) return void (await o.save(ctx, o.withPr(r, { status: "declined", reason: `no pull request could be opened: ${ready.reason}` })));
      if (!out.open) return void (await o.save(ctx, o.withPr(r, { status: "declined", reason: "the pull request was declined" })));
      const files = leaving(o.changes(r));
      const done = await o.data.openPullRequest(ctx.runId, ctx.runId, o.folder(r), { files, title: o.title(r).slice(0, 200), body: o.body(ctx.runId, r), draft: !o.ready(r) });
      if (done.status !== "done") return void (await o.save(ctx, o.withPr(r, { status: "declined", reason: "the policy said no to opening the pull request" })));
      await o.save(ctx, o.withPr(r, { status: "opened", number: done.number, url: done.url, branch: done.branch, draft: done.draft }));
    },
  };
}
