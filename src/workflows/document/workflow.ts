import { z } from "zod";
import { EngineError, type Artifact, type InputRef, type OutputError, type StepContext, type StepDefinition, type WorkflowDefinition } from "../../core/index.js";
import { REQUIREMENTS_ARTIFACT } from "../requirements/artifact.js";
import { analysisReuse, type ReuseDeps } from "../requirements/reuse.js";
import { analyzeStep, sealJiraInputs, withPullRequestsInput } from "../requirements/workflow.js";
import { TEST_CASES_ARTIFACT } from "../test-cases/artifact.js";
import { TEST_RUN_ARTIFACT } from "../run-tests/workflow.js";
import { PULL_REQUESTS_ARTIFACT, type DocumentData, type MaskedPullRequest, type RequirementsData } from "../../data/index.js";
import { CONFLUENCE_PAGE_ARTIFACT, DOCUMENT_ARTIFACT, DOCUMENT_DRAFT_ARTIFACT, DOCUMENT_ENGINE_VERSION, type DocumentArtifact, type DocumentDraft } from "./artifact.js";
import { code, one } from "./markdown.js";
import { RELEASE_NOTES } from "./release-notes.js";
import { RISK_REGISTER } from "./risk-register.js";
import { TEST_CHARTER } from "./test-charter.js";
import { TEST_DATA } from "./test-data.js";
import { TEST_PLAN } from "./test-plan.js";
import { TEST_STRATEGY } from "./test-strategy.js";
import { TRACEABILITY } from "./traceability.js";
import type { DocumentMeta, DocumentSources, DocumentType } from "./types.js";

/**
 * The `document` workflow (S4-3, decision F1): one engine for every document
 * type, each type a schema, a prompt and a view.
 *
 * 1. Analyze (only from a key or JQL): the requirements workflow's step.
 * 2. Draft, by the model: the one `draft-{type}` step of the chosen type, on
 *    a masked context of the sources the type reads. The core checks the
 *    type's rules (every requirement once, ids that exist) and that every
 *    token comes from the context, then writes `document-draft@1`.
 * 3. Review (confirm): the person changes or removes texts by path; their
 *    words are masked with the requirements run's vault, the result is
 *    checked again, and the core writes `document@1` (`document.md`).
 * 4. Publish (confirm, S4-5; only with `publish: confluence`): the person's
 *    own yes publishes the document as a Confluence page, created under
 *    `parentPageId` or updated when Agent-QA made it; `confluence-page@1`.
 *
 * The document's tokens are those of the requirements run's vault. A test
 * run masks with its own vault, so its tokens are shown as [masked] and
 * can't reach the document.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DOCUMENT_TYPES: ReadonlyArray<DocumentType<any>> = [TEST_STRATEGY, TEST_PLAN, TEST_CHARTER, RISK_REGISTER, TEST_DATA, TRACEABILITY, RELEASE_NOTES];

const KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const TOKEN = /<[A-Z][A-Z0-9_]*_\d+>/g;
const TOKEN_TEST = /<[A-Z][A-Z0-9_]*_\d+>/;
const SEALED = /^<INPUT_\d+>$/;
const runId = (what: string) => z.string().regex(RUN_ID, "must be a run id").optional().describe(what);

const ids = DOCUMENT_TYPES.map((t) => t.id) as [string, ...string[]];

export const documentInputSchema = z
  .object({
    type: z.enum(ids).optional().describe(`The document to write: ${DOCUMENT_TYPES.map((t) => `${t.id} (${t.title.toLowerCase()})`).join(", ")}`),
    key: z.string().trim().toUpperCase().regex(KEY, "must be a Jira issue key such as ABC-123").optional().describe("One Jira issue key, e.g. ABC-123"),
    jql: z
      .string()
      .trim()
      .min(1)
      .max(4000)
      .refine((q) => !SEALED.test(q), "must be a JQL filter, not a vault token")
      .optional()
      .describe("A JQL filter"),
    requirementsRun: runId("Id of a finished requirements (or test-cases) run whose requirements@1 the document is written from, instead of reading Jira again"),
    testCasesRun: runId("Id of a test-cases run whose reviewed cases the document uses; its requirements are used too"),
    testRunRun: runId("Id of a run-tests run whose results the document uses"),
    withPullRequests: withPullRequestsInput,
    publish: z.literal("confluence").optional().describe("Publish the reviewed document as a Confluence page (asks first)"),
    documentRun: runId("Id of an earlier document run whose reviewed document (document@1) this run only publishes, with publish: confluence and nothing else"),
  })
  .strict()
  .refine(
    (i) =>
      i.documentRun === undefined ||
      (i.publish === "confluence" && [i.key, i.jql, i.requirementsRun, i.testCasesRun, i.testRunRun, i.withPullRequests].every((v) => v === undefined)),
    { message: "documentRun only publishes an earlier run's reviewed document: give it with publish: confluence (and type, if you like) and nothing else" },
  )
  .refine((i) => i.documentRun !== undefined || i.type !== undefined, { message: "give the document type" })
  .refine((i) => i.documentRun !== undefined || [i.key, i.jql, i.requirementsRun].filter((v) => v !== undefined).length === 1 || (i.key === undefined && i.jql === undefined && i.requirementsRun === undefined && i.testCasesRun !== undefined), {
    message: "give exactly one of key, jql or requirementsRun (or testCasesRun alone)",
  })
  .refine((i) => i.testCasesRun === undefined || (i.key === undefined && i.jql === undefined), {
    message: "testCasesRun brings its own requirements: give it with requirementsRun or alone, not with key or jql",
  });
export type DocumentInputs = z.infer<typeof documentInputSchema>;

type Ctx = StepContext<DocumentInputs>;

/** A change of the review: a new text at a path of the draft's content, or, with no value, the removal of a list item. */
const changeSchema = z
  .object({
    path: z.string().regex(/^\$(\.(?:[A-Za-z_][A-Za-z0-9_]*|0|[1-9]\d*))+$/, "must be a path such as $.objectives.2, numbers with no leading zero").describe("Where the text is, as the context lists it, e.g. $.objectives.2"),
    value: z.string().max(4000).optional().describe("The new text. Leave out to remove this item of a list"),
  })
  .strict();
const reviewSchema = z
  .object({
    approved: z.boolean().describe("true once the user has reviewed the document; false if they stopped the run (nothing is saved)"),
    changes: z.array(changeSchema).max(200).describe("Only the texts the user changed or removed; every other text is kept as written"),
    unattended: z.literal(true).optional().describe("Leave this out. Set only by the CLI's --yes, when nobody reviewed the document"),
  })
  .strict();
type Review = z.infer<typeof reviewSchema>;
type Change = z.infer<typeof changeSchema>;

/** Every string in a value, with its path. */
function texts(value: unknown, path = "$"): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => texts(v, `${path}.${i}`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => texts(v, `${path}.${k}`));
  return [];
}

const tokensIn = (text: string) => new Set(text.match(TOKEN) ?? []);

function unknownTokens(content: unknown, known: Set<string>): OutputError[] {
  return texts(content).flatMap(([path, text]) => {
    const unknown = [...new Set((text.match(TOKEN) ?? []).filter((t) => !known.has(t)))];
    return unknown.length ? [{ path, message: `uses ${unknown.join(", ")}, which the context doesn't have; keep only tokens from the context` }] : [];
  });
}

const segments = (path: string) => path.slice(2).split(".");

/** Paths in document order, numbers compared as numbers; a path comes before the paths inside it. */
function comparePaths(a: string, b: string): number {
  const [x, y] = [segments(a), segments(b)];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    const [m, n] = [Number(x[i]), Number(y[i])];
    return Number.isInteger(m) && Number.isInteger(n) ? m - n : x[i]! < y[i]! ? -1 : 1;
  }
  return x.length - y.length;
}

/** The content with the changes made: new texts first, then removals from the last item back, so indexes hold. */
function applyChanges(content: unknown, changes: readonly Change[]): unknown {
  const copy = structuredClone(content) as Record<string, unknown>;
  const parentOf = (path: string): [Record<string, unknown> | unknown[], string] => {
    const parts = segments(path);
    let at: unknown = copy;
    for (const p of parts.slice(0, -1)) at = (at as Record<string, unknown>)[p];
    return [at as Record<string, unknown>, parts[parts.length - 1]!];
  };
  for (const c of changes) {
    if (c.value === undefined) continue;
    const [parent, last] = parentOf(c.path);
    (parent as Record<string, unknown>)[last] = c.value;
  }
  // Deepest and last first: a removal never moves an item another removal names.
  const removals = changes.filter((c) => c.value === undefined).sort((a, b) => comparePaths(b.path, a.path));
  for (const c of removals) {
    const [parent, last] = parentOf(c.path);
    (parent as unknown[]).splice(Number(last), 1);
  }
  return copy;
}

/** Why a change can't be made to this content, or undefined. Never repeats the person's text: it may hold personal data. */
function changeError(content: unknown, change: Change): string | undefined {
  const parts = segments(change.path);
  let parent: unknown;
  let at: unknown = content;
  for (const p of parts) {
    parent = at;
    if (Array.isArray(at) && /^\d+$/.test(p) && Number(p) < at.length) at = at[Number(p)];
    else if (at && typeof at === "object" && !Array.isArray(at) && Object.hasOwn(at, p)) at = (at as Record<string, unknown>)[p];
    else return "isn't a text of the draft: use a path the context lists";
  }
  if (change.value === undefined) return Array.isArray(parent) ? undefined : "only an item of a list can be removed; give a value to change this text";
  if (typeof at !== "string") return "isn't a text of the draft: use a path the context lists";
  if (change.value.trim() === "") return "a new text can't be empty; leave out value to remove a list item";
  return undefined;
}

const publishSchema = z.object({ approve: z.boolean().describe("true only if the user said to publish the document to Confluence") }).strict();
type Publish = z.infer<typeof publishSchema>;

export type DocumentDeps = ReuseDeps & { data: RequirementsData & DocumentData };

/** The page title: the document's heading, without backticks. */
export const titleOf = (doc: Pick<DocumentArtifact, "markdown" | "title">) => (/^# (.+)$/m.exec(doc.markdown)?.[1] ?? doc.title).replace(/`/g, "").trim();
/** The page body: the markdown without its heading, which Confluence shows as the title. */
export const bodyOf = (doc: Pick<DocumentArtifact, "markdown" | "review">) =>
  `${doc.review.unattended ? "> Not reviewed: written unattended (--yes).\n\n" : ""}${doc.markdown.replace(/^# .*\n+/, "")}`;

export function documentWorkflow(deps: DocumentDeps): WorkflowDefinition<DocumentInputs> {
  const typeOf = (ctx: { inputs: DocumentInputs }) => DOCUMENT_TYPES.find((t) => t.id === ctx.inputs.type)!;
  /** The run whose requirements@1 (and vault) the document uses: given, or this run's own analysis. */
  const { reused, step: reuseStep } = analysisReuse<DocumentInputs>(deps);
  const documentRunOf = (ctx: Pick<Ctx, "inputs" | "runId">) => ctx.inputs.documentRun ?? ctx.runId;
  const requirementsRunOf = (ctx: Pick<Ctx, "inputs" | "outputs" | "runId">) => ctx.inputs.requirementsRun ?? reused(ctx) ?? ctx.runId;

  async function artifacts(ctx: Ctx) {
    const run = requirementsRunOf(ctx);
    const requirements = await deps.runs.readArtifact(run, REQUIREMENTS_ARTIFACT);
    if (!requirements) throw new Error(`Run ${run} has no requirements@1`);
    const read = async <T>(id: string | undefined, spec: Parameters<typeof deps.runs.readArtifact<T>>[1]): Promise<Artifact<T> | undefined> => {
      if (id === undefined) return undefined;
      const art = await deps.runs.readArtifact(id, spec);
      if (!art) throw new Error(`Run ${id} has no ${spec.schema}`);
      return art;
    };
    const testCases = await read(ctx.inputs.testCasesRun, TEST_CASES_ARTIFACT);
    const testRun = await read(ctx.inputs.testRunRun, TEST_RUN_ARTIFACT);
    // The pull requests the analysis was given, as it saw them: those its requirements@1 names, with the same hash.
    const named = typeOf(ctx).usesPullRequests ? requirements.data.requirements.filter((r) => r.pullRequests?.length) : [];
    const prs = named.length ? await read(run, PULL_REQUESTS_ARTIFACT) : undefined;
    let pullRequests: { art: NonNullable<typeof prs>; byIssue: Record<string, MaskedPullRequest[]> } | undefined;
    if (prs) {
      const byIssue: Record<string, MaskedPullRequest[]> = {};
      for (const r of named) {
        byIssue[r.key] = r.pullRequests!.map((want) => {
          const found = (prs.data.byIssue[r.key] ?? []).find((p) => p.id === want.id && p.hash === want.hash);
          if (!found) throw new Error(`Run ${run}'s pull-requests@1 no longer holds pull request ${want.id} of ${r.key} as the analysis saw it: start a new run`);
          return found;
        });
      }
      pullRequests = { art: prs, byIssue };
    }
    return { run, requirements, testCases, testRun, pullRequests };
  }

  async function sourcesOf(ctx: Ctx): Promise<DocumentSources> {
    const a = await artifacts(ctx);
    return {
      requirements: { run: a.run, data: a.requirements.data },
      ...(a.testCases ? { testCases: { run: ctx.inputs.testCasesRun!, data: a.testCases.data } } : {}),
      // Its tokens belong to another vault: hidden, so the document can't hold one meaning someone else.
      ...(a.testRun ? { testRun: { run: ctx.inputs.testRunRun!, data: JSON.parse(JSON.stringify(a.testRun.data).replace(TOKEN, "[masked]")) as typeof a.testRun.data } } : {}),
      ...(a.pullRequests ? { pullRequests: { run: a.run, byIssue: a.pullRequests.byIssue } } : {}),
    };
  }

  async function metaOf(ctx: Ctx, sources: DocumentSources): Promise<DocumentMeta> {
    const input = sources.requirements.data.input;
    return {
      title: typeOf(ctx).title,
      requirementsRun: sources.requirements.run,
      testCasesRun: sources.testCases?.run,
      testRunRun: sources.testRun?.run,
      input: "key" in input ? input.key : `JQL ${code(one(input.jql))}`,
    };
  }

  const contextOf = async (ctx: Ctx) => JSON.stringify({ document: typeOf(ctx).title, ...(typeOf(ctx).context(await sourcesOf(ctx)) as object) }, null, 2);

  async function inputsOf(ctx: Ctx): Promise<InputRef[]> {
    const a = await artifacts(ctx);
    return [
      { kind: "artifact", ref: `${a.run}/requirements`, hash: a.requirements.sourceHash },
      ...(a.testCases ? [{ kind: "artifact" as const, ref: `${ctx.inputs.testCasesRun}/test-cases`, hash: a.testCases.sourceHash }] : []),
      ...(a.testRun ? [{ kind: "artifact" as const, ref: `${ctx.inputs.testRunRun}/test-run`, hash: a.testRun.sourceHash }] : []),
      ...(a.pullRequests ? [{ kind: "artifact" as const, ref: `${a.run}/pull-requests`, hash: a.pullRequests.art.sourceHash }] : []),
    ];
  }

  async function documentOf(ctx: Ctx, content: unknown): Promise<DocumentDraft> {
    const type = typeOf(ctx);
    const a = await artifacts(ctx);
    const sources = await sourcesOf(ctx);
    return {
      type: type.id,
      title: type.title,
      templateVersion: `${DOCUMENT_ENGINE_VERSION}/${type.templateVersion}`,
      sources: {
        requirements: { run: a.run, sourceHash: a.requirements.sourceHash },
        ...(a.testCases ? { testCases: { run: ctx.inputs.testCasesRun!, sourceHash: a.testCases.sourceHash } } : {}),
        ...(a.testRun ? { testRun: { run: ctx.inputs.testRunRun!, sourceHash: a.testRun.sourceHash } } : {}),
      },
      content: content as Record<string, unknown>,
      markdown: type.render(content, sources, await metaOf(ctx, sources)),
    };
  }

  const draftOf = async (ctx: Ctx): Promise<DocumentDraft> => {
    const draft = await deps.runs.readArtifact(ctx.runId, DOCUMENT_DRAFT_ARTIFACT);
    if (!draft) throw new Error(`Run ${ctx.runId} has no document-draft@1`);
    return draft.data;
  };

  /** The content of the draft with the review's changes, checked as the draft step checked the model's. */
  async function reviewedContent(ctx: Ctx, changes: readonly Change[]): Promise<{ content?: unknown; errors: OutputError[] }> {
    const type = typeOf(ctx);
    const parsed = type.schema.safeParse(applyChanges((await draftOf(ctx)).content, changes));
    // Paths only: the messages of a schema can't echo the person's words, and the type's checks name keys.
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => ({ path: `$.${i.path.join(".")}`, message: `doesn't fit the ${type.title.toLowerCase()} once changed (${i.code})` })) };
    // A type's message may quote what it checks, here the person's words: such a message is replaced.
    // Compared as checks quote keys: spaces collapsed, upper-cased.
    const same = (text: string) => one(text).toUpperCase();
    const typed = changes.flatMap((c) => (c.value !== undefined && c.value.trim() !== "" ? [c.value.trim()] : []));
    const errors = type.check(await sourcesOf(ctx), parsed.data).map((e) =>
      typed.some((t) => same(e.message).includes(same(t))) ? { path: e.path, message: `breaks a rule of the ${type.title.toLowerCase()} once changed: undo or fix this change` } : { path: e.path, message: `once changed: ${e.message}` },
    );
    return { content: parsed.data, errors };
  }

  const draftSteps = DOCUMENT_TYPES.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (type): StepDefinition<DocumentInputs, any> => ({
      id: `draft-${type.id}`,
      kind: "generate",
      outputSchema: type.schema,
      when: (ctx) => ctx.inputs.documentRun === undefined && ctx.inputs.type === type.id,
      instructions: () => type.instructions,
      context: contextOf,
      check: async (ctx, content) => [...type.check(await sourcesOf(ctx), content), ...unknownTokens(content, tokensIn(await contextOf(ctx)))],
      onAccept: async (ctx, content) => {
        await deps.runs.writeArtifact(ctx.runId, DOCUMENT_DRAFT_ARTIFACT, await documentOf(ctx, content), { inputs: await inputsOf(ctx), templateVersion: `${DOCUMENT_ENGINE_VERSION}/${type.templateVersion}` });
      },
    }),
  );

  return {
    id: "document",
    description: `Write a QA document (${DOCUMENT_TYPES.map((t) => t.id).join(", ")}) from a Jira issue, a JQL filter or earlier runs (requirements, reviewed test cases, test results), let the user review it, and keep it as document@1 (document.md).`,
    inputSchema: documentInputSchema,
    summary: async (ctx) => {
      const doc = (await reviewed(ctx).catch(() => undefined))?.data;
      const page = (await deps.runs.readArtifact(ctx.runId, CONFLUENCE_PAGE_ARTIFACT).catch(() => undefined))?.data;
      if (!doc && !page) return undefined;
      return [
        ...(doc ? [`The ${doc.title.toLowerCase()} is document.md in the run folder of ${documentRunOf(ctx)}${doc.review.unattended ? " (not reviewed: written unattended)" : ""}.`] : []),
        ...(page ? [`Confluence: ${page.action === "create" ? "created" : "updated"} page ${page.pageId} (version ${page.version}): ${page.url}`] : ctx.inputs.publish === "confluence" ? ["Confluence: not published."] : []),
      ].join("\n");
    },
    prepareInputs: async (runId, inputs) => {
      const refuse = (message: string): never => {
        throw new EngineError("INVALID_INPUTS", message);
      };
      if (inputs.documentRun !== undefined) {
        // Only the publish: of an earlier run's reviewed document, with its own requirements run's vault.
        const doc = await deps.runs.readArtifact(inputs.documentRun, DOCUMENT_ARTIFACT).catch(() => undefined);
        if (!doc) return refuse(`Run ${inputs.documentRun} has no reviewed document (document@1): give the id of a document run whose review was approved`);
        if (inputs.type !== undefined && inputs.type !== doc.data.type) return refuse(`Run ${inputs.documentRun} holds a ${doc.data.type}, not a ${inputs.type}: leave out type`);
        if (!(await deps.data.confluenceEnabled())) refuse("publish: confluence needs atlassian.confluence.spaceKey in agent-qa.yaml, and a write policy that doesn't deny Confluence");
        return { ...inputs, type: doc.data.type, requirementsRun: doc.data.sources.requirements.run };
      }
      const type = DOCUMENT_TYPES.find((t) => t.id === inputs.type)!;
      const name = type.title.toLowerCase();
      if (type.needs.testCases === "required" && inputs.testCasesRun === undefined) refuse(`A ${name} is written from reviewed test cases: give testCasesRun`);
      if (type.needs.testCases === "unused" && inputs.testCasesRun !== undefined) refuse(`A ${name} doesn't use test cases: leave out testCasesRun`);
      if (type.needs.testRun === "required" && inputs.testRunRun === undefined) refuse(`A ${name} is written from test results: give testRunRun`);
      if (type.needs.testRun === "unused" && inputs.testRunRun !== undefined) refuse(`A ${name} doesn't use test results: leave out testRunRun`);
      let prepared = inputs;
      if (inputs.testCasesRun !== undefined) {
        const cases = await deps.runs.readArtifact(inputs.testCasesRun, TEST_CASES_ARTIFACT).catch(() => undefined);
        if (!cases) return refuse(`Run ${inputs.testCasesRun} has no reviewed test cases (test-cases@1): give the id of a test-cases run whose review was approved`);
        // The cases' tokens are those of their requirements run's vault: the document must use the same one.
        const own = cases.data.requirements.run;
        if (inputs.requirementsRun !== undefined && inputs.requirementsRun !== own) {
          return refuse(`The test cases of run ${inputs.testCasesRun} were written from the requirements of run ${own}, not ${inputs.requirementsRun}: leave out requirementsRun, or give ${own}`);
        }
        prepared = { ...prepared, requirementsRun: own };
      }
      if (prepared.requirementsRun !== undefined) {
        const art = await deps.runs.readArtifact(prepared.requirementsRun, REQUIREMENTS_ARTIFACT).catch(() => undefined);
        if (!art) return refuse(`Run ${prepared.requirementsRun} has no requirements@1: give the id of a finished requirements or test-cases run, or start from a key or JQL`);
      }
      if (inputs.publish === "confluence" && !(await deps.data.confluenceEnabled())) {
        refuse("publish: confluence needs atlassian.confluence.spaceKey in agent-qa.yaml, and a write policy that doesn't deny Confluence");
      }
      if (inputs.testRunRun !== undefined && !(await deps.runs.readArtifact(inputs.testRunRun, TEST_RUN_ARTIFACT).catch(() => undefined))) {
        refuse(`Run ${inputs.testRunRun} has no test results (test-run@1): give the id of a run-tests run`);
      }
      return sealJiraInputs(deps, runId, prepared);
    },
    steps: [
      // An earlier analysis of the same, unchanged input may be reused instead (as in test-cases).
      reuseStep(),
      { ...analyzeStep<DocumentInputs>(deps), when: (ctx) => ctx.inputs.requirementsRun === undefined && reused(ctx) === undefined },
      ...draftSteps,
      {
        id: "review",
        kind: "confirm",
        outputSchema: reviewSchema,
        when: (ctx) => ctx.inputs.documentRun === undefined,
        personalAnswer: true,
        answers: { yes: { approved: true, changes: [] }, no: { approved: false, changes: [] }, unattended: { approved: true, changes: [], unattended: true } },
        instructions: ({ runId }) =>
          [
            `Ask the user to review the draft document: it is in document-draft.md in this run's folder (.agent-qa/runs/${runId}/), and its texts are listed in the context by path. Wait for their answer.`,
            "Submit approved: true with changes listing only what the user changed: for a changed text its path and the new value; to remove an item of a list, its path with no value. Every text not listed is kept.",
            "If the user wants to stop, submit approved: false and nothing is saved.",
          ].join("\n"),
        context: async (ctx) => {
          const draft = await draftOf(ctx);
          const lines = texts(draft.content).map(([path, text]) => `${path}: ${one(text)}`);
          return [`Draft ${draft.title.toLowerCase()}, ${lines.length} text(s) the user can change:`, ...lines].join("\n");
        },
        check: async (ctx, review: Review) => {
          // A user who stops the run isn't asked to fix their changes: nothing is saved anyway.
          if (!review.approved) return [];
          const draft = await draftOf(ctx);
          const errors: OutputError[] = [];
          const seen = new Set<string>();
          review.changes.forEach((change, i) => {
            const at = `$.changes.${i}`;
            if (seen.has(change.path)) errors.push({ path: `${at}.path`, message: "this text is changed more than once" });
            seen.add(change.path);
            const removed = review.changes.find((c) => c !== change && c.value === undefined && change.path.startsWith(`${c.path}.`));
            if (removed) errors.push({ path: `${at}.path`, message: "is inside an item this review removes: leave out one of the two changes" });
            const why = changeError(draft.content, change);
            if (why) errors.push({ path: `${at}.path`, message: why });
          });
          if (errors.length) return errors;
          const known = tokensIn(JSON.stringify(draft) + (await contextOf(ctx)));
          const tokens = review.changes.flatMap((c, i) => {
            const unknown = [...tokensIn(c.value ?? "")].filter((t) => !known.has(t));
            return unknown.length ? [{ path: `$.changes.${i}.value`, message: `uses ${unknown.join(", ")}, which the document doesn't have` }] : [];
          });
          return [...tokens, ...(await reviewedContent(ctx, review.changes)).errors];
        },
        // The person's words may name people: masked with the requirements run's vault before the run keeps them.
        sanitize: async (ctx, review: Review): Promise<Review> => {
          if (!review.approved) return { approved: false, changes: [] };
          const unattended = review.unattended ? { unattended: true as const } : {};
          const edits = review.changes.filter((c) => c.value !== undefined);
          if (edits.length === 0) return { approved: true, changes: review.changes, ...unattended };
          const run = requirementsRunOf(ctx);
          // An expired vault starts again from <PERSON_1>, which would give a new value an old token.
          // Tokens of the sources count too: the requirements and cases use them, even where the draft doesn't show them.
          const a = await artifacts(ctx);
          if (TOKEN_TEST.test(JSON.stringify([await draftOf(ctx), a.requirements.data, a.testCases?.data])) && !(await deps.data.hasVault(run))) {
            throw new Error(`the token vault of run ${run} has expired or was deleted, so edits can't be masked consistently; start a new run`);
          }
          const masked = await deps.data.maskTexts(run, edits.map((c) => c.value!), "review.edit");
          const byPath = new Map(edits.map((c, i) => [c.path, masked[i]!]));
          const changes = review.changes.map((c) => (c.value === undefined ? c : { path: c.path, value: byPath.get(c.path)! }));
          const { errors } = await reviewedContent(ctx, changes);
          if (errors.length) throw new Error(`the changes no longer fit once personal data is masked (${errors.map((e) => e.path).join(", ")}); shorten them and submit again`);
          return { approved: true, changes, ...unattended };
        },
        onAccept: async (ctx, review: Review) => {
          if (!review.approved) return;
          const { content } = await reviewedContent(ctx, review.changes);
          const type = typeOf(ctx);
          await deps.runs.writeArtifact(
            ctx.runId,
            DOCUMENT_ARTIFACT,
            { ...(await documentOf(ctx, content)), review: { edited: review.changes.length, ...(review.unattended ? { unattended: true as const } : {}) } },
            { inputs: await inputsOf(ctx), templateVersion: `${DOCUMENT_ENGINE_VERSION}/${type.templateVersion}` },
          );
        },
      },
      {
        id: "publish",
        kind: "confirm",
        outputSchema: publishSchema,
        // Publishing is never unattended: it takes the person's own yes (a terminal answer or --accept publish).
        answers: { yes: { approve: true }, no: { approve: false }, unattended: { approve: false } },
        approval: { question: async (ctx) => publishQuestion(ctx) },
        when: async (ctx) => ctx.inputs.publish === "confluence" && (await reviewed(ctx).catch(() => undefined)) !== undefined,
        instructions: () =>
          [
            "Ask the user whether to publish the reviewed document to Confluence. The context names the space and says whether a new page is created or Agent-QA's earlier page is updated. Wait for their answer.",
            "Submit approve: true only if they said yes; approve: false publishes nothing and ends the run. If the context says another page has the title, don't ask: submit approve: false.",
          ].join("\n"),
        context: async (ctx) => publishQuestion(ctx),
        onAccept: async (ctx, out: Publish) => {
          if (!out.approve) return;
          // Resumed after a crash between the write and the saved answer: published already.
          if (await deps.runs.readArtifact(ctx.runId, CONFLUENCE_PAGE_ARTIFACT).catch(() => undefined)) return;
          const doc = (await reviewed(ctx))!;
          const page = await pageOf(ctx, doc.data);
          const result = await deps.data.publishToConfluence(ctx.runId, requirementsRunOf(ctx), { ...page, markdown: bodyOf(doc.data) }, true);
          if (result.status !== "done") return;
          await deps.runs.writeArtifact(
            ctx.runId,
            CONFLUENCE_PAGE_ARTIFACT,
            { document: { run: documentRunOf(ctx), sourceHash: doc.sourceHash }, space: result.page.space, pageId: result.page.id, version: result.page.version, url: result.page.url, action: result.page.action, title: result.page.title },
            { inputs: [{ kind: "artifact", ref: `${documentRunOf(ctx)}/document`, hash: doc.sourceHash }], templateVersion: DOCUMENT_ENGINE_VERSION },
          );
        },
      },
    ],
  };

  /** The page title: the heading of a key's document; for a JQL filter's, the type and the filter (hashed by the data layer). */
  async function pageOf(ctx: Ctx, doc: DocumentArtifact): Promise<{ title: string; filter?: string }> {
    const input = (await deps.runs.readArtifact(requirementsRunOf(ctx), REQUIREMENTS_ARTIFACT))!.data.input;
    return "jql" in input ? { title: doc.title, filter: input.jql } : { title: titleOf(doc) };
  }

  /** The reviewed document: this run's, or the earlier run's that `documentRun` names. */
  function reviewed(ctx: Ctx) {
    return deps.runs.readArtifact(documentRunOf(ctx), DOCUMENT_ARTIFACT);
  }

  async function publishQuestion(ctx: Ctx): Promise<string> {
    const doc = (await reviewed(ctx))!;
    const page = await pageOf(ctx, doc.data);
    const plan = await deps.data.confluencePlan(requirementsRunOf(ctx), page.title, page.filter);
    const what =
      plan.action === "create"
        ? `It creates a new page${plan.parentPageId ? ` under page ${plan.parentPageId}` : " at the top of the space"}.`
        : plan.action === "update"
          ? `It updates Agent-QA's page ${plan.page!.id} (now version ${plan.page!.version}): ${plan.page!.url}`
          : `Page ${plan.page!.id} already has this title and Agent-QA didn't create it, so it can't be published: rename or move that page first.`;
    return `Publish the ${doc.data.title.toLowerCase()} "${plan.title}" to Confluence space ${plan.space}? ${what}`;
  }
}
