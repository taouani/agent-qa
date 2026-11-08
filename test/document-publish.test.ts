import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JiraCollection, JiraInput, JiraIssue } from "../src/connectors/index.js";
import { configSchema, MemoryAuditSink, RunStore, WorkflowEngine, type WriteGrant } from "../src/core/index.js";
import { CONFLUENCE_LABEL, DataAccess, type ConfluenceWriter } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";
import { CONFLUENCE_PAGE_ARTIFACT, DOCUMENT_ARTIFACT, documentWorkflow, requirementsWorkflow, type TestPlan } from "../src/workflows/index.js";

const SITE = "https://acme.atlassian.net";
const adf = (text: string) => ({ text, mentions: [], links: [] });
const ISSUE: JiraIssue = {
  id: "1",
  key: "ABC-1",
  type: "Story",
  subtask: false,
  summary: "Escalate old cases for Marguerite Quillfeather",
  description: adf("Escalate cases older than 2 days.\n\nAcceptance criteria:\n- A case older than 2 days is escalated"),
  extraFields: {},
  labels: [],
  components: [],
  fixVersions: [],
  children: [],
  links: [],
  remoteLinks: [],
  people: [{ role: "reporter", displayName: "Marguerite Quillfeather", accountId: "a1" }],
  updated: "2026-11-01T10:00:00.000+0000",
  role: "root",
  depth: 0,
};
const jira = { collect: async (input: JiraInput): Promise<JiraCollection> => ({ input, issues: [structuredClone(ISSUE)], truncated: false, unreachable: [], extraFields: [] }) };

const plan: TestPlan = {
  summary: "Tests the escalation of old cases for <PERSON_1>.",
  objectives: ["Old cases are escalated on time"],
  inScope: ["Escalation"],
  outOfScope: [],
  approach: "Functional tests in a sandbox.",
  requirements: [{ key: "ABC-1", risk: "high", focus: "The 2-day boundary" }],
  risks: [{ risk: "Time zones", impact: "high", mitigation: "Test around midnight", requirements: ["ABC-1"] }],
  environments: ["UAT"],
  testData: ["Cases aged 1, 2 and 3 days"],
  entryCriteria: ["Stories done"],
  exitCriteria: ["No open P1 defect"],
  assumptions: [],
};

interface Page {
  id: string;
  spaceId: string;
  parentId?: string | undefined;
  title: string;
  storage: string;
  version: number;
  labels: string[];
}

/** An in-memory Confluence space that records every write and the grant it came with. */
class FakeConfluence implements ConfluenceWriter {
  pages: Page[] = [];
  writes: Array<{ op: string; target: string }> = [];
  failLabel = false;
  async spaceId(key: string) {
    return key === "QA" ? "4456" : undefined;
  }
  async pageByTitle(spaceId: string, title: string) {
    const p = this.pages.find((x) => x.spaceId === spaceId && x.title === title);
    return p && { id: p.id, title: p.title, version: p.version, labels: [...p.labels], url: `${SITE}/wiki/spaces/QA/pages/${p.id}/${encodeURIComponent(p.title)}` };
  }
  async createPage(page: { spaceId: string; parentId?: string | undefined; title: string; storage: string }, grant: WriteGrant) {
    this.writes.push({ op: "create", target: grant.target });
    const id = String(100 + this.pages.length);
    this.pages.push({ ...page, id, version: 1, labels: [] });
    return { id, version: 1, url: "" };
  }
  async updatePage(page: { id: string; title: string; storage: string; version: number }, grant: WriteGrant) {
    this.writes.push({ op: "update", target: grant.target });
    const p = this.pages.find((x) => x.id === page.id)!;
    Object.assign(p, { title: page.title, storage: page.storage, version: page.version });
    return { id: p.id, version: p.version, url: "" };
  }
  async addLabel(id: string, name: string, grant: WriteGrant) {
    this.writes.push({ op: "label", target: grant.target });
    if (this.failLabel) throw new Error("403");
    this.pages.find((x) => x.id === id)!.labels.push(name);
  }
}

let dir: string;
let runs: RunStore;
let confluence: FakeConfluence;
let audit: MemoryAuditSink;
let storage: MemoryVaultStorage;
const key = randomBytes(32);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-qa-publish-"));
  runs = new RunStore(join(dir, "runs"));
  confluence = new FakeConfluence();
  audit = new MemoryAuditSink();
  storage = new MemoryVaultStorage();
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function setup(over: { confluence?: boolean; restoreOnWrite?: boolean; rule?: "allow" | "ask" | "deny"; mode?: "ide" | "ci" } = {}) {
  const config = configSchema.parse({
    version: 1,
    atlassian: { site: SITE, email: "${env:E}", token: "${env:T}", ...(over.confluence === false ? {} : { confluence: { spaceKey: "QA", parentPageId: "500" } }) },
    ...(over.rule ? { policy: { writes: { xray: "ask", confluence: over.rule, testCode: "ask", jira: "deny", commands: "ask" } } } : {}),
    ...(over.restoreOnWrite ? { masking: { restoreOnWrite: true } } : {}),
  });
  const vault = new Vault({ storage, keys: { description: "t", getKey: async () => key } });
  const data = new DataAccess({ root: dir, store: runs, config, vault, jira, confluence: { pages: async () => ({ pages: [], skipped: [] }) }, confluenceWriter: confluence, audit, ...(over.mode ? { mode: over.mode } : {}) });
  const engine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId }).register(requirementsWorkflow({ data, runs })).register(documentWorkflow({ data, runs }));
  return { data, engine, vault };
}

/** A test plan run up to the publish step. */
async function reviewedPlan(engine: WorkflowEngine, input: { key: string } | { jql: string } = { key: "ABC-1" }) {
  const first = await engine.start("document", { type: "test-plan", ...input, publish: "confluence" });
  // An earlier run analyzed the same issue: analyze again here.
  if (first.stepId === "reuse") await engine.submit(first.runId, "reuse", { reuse: false });
  await engine.submit(first.runId, "analyze", { issues: [{ key: "ABC-1", quality: { score: 80, missing: [] }, openQuestions: [], inferredCriteria: [] }] });
  await engine.submit(first.runId, "draft-test-plan", plan);
  const publishing = await engine.submit(first.runId, "review", { approved: true, changes: [] });
  return { runId: first.runId, publishing };
}

describe("publishing a document to Confluence (S4-5)", () => {
  it("asks, creates the page under the parent with the agent-qa label, and writes confluence-page@1", async () => {
    const { engine } = setup();
    const { runId, publishing } = await reviewedPlan(engine);
    expect(publishing.next).toMatchObject({ stepId: "publish", kind: "confirm" });
    expect(publishing.next.context).toContain('Publish the test plan "Test plan: ABC-1" to Confluence space QA? It creates a new page under page 500.');
    expect(confluence.writes).toEqual([]);

    const done = await engine.submit(runId, "publish", { approve: true });
    expect(done.next.kind).toBe("done");
    expect(confluence.writes).toEqual([
      { op: "create", target: "confluence" },
      { op: "label", target: "confluence" },
    ]);
    const page = confluence.pages[0]!;
    expect(page).toMatchObject({ spaceId: "4456", parentId: "500", title: "Test plan: ABC-1", version: 1, labels: [CONFLUENCE_LABEL] });
    expect(page.storage).toContain("<h2>Summary</h2>");
    expect(page.storage).not.toContain("<h1>");
    // Without restoreOnWrite the page holds the tokens.
    expect(page.storage).toContain("&lt;PERSON_1&gt;");
    expect(page.storage).not.toContain("Marguerite");
    const art = (await runs.readArtifact(runId, CONFLUENCE_PAGE_ARTIFACT))!;
    expect(art.data).toMatchObject({ space: "QA", pageId: page.id, version: 1, action: "create", title: "Test plan: ABC-1", url: `${SITE}/wiki/pages/viewpage.action?pageId=${page.id}` });
    expect(art.data.document.run).toBe(runId);
    expect(audit.entries.map((e) => [e.target, e.summary, e.runId, e.outcome])).toEqual([
      ["confluence", 'Publish "Test plan: ABC-1" to Confluence space QA', runId, "approved"],
      ["confluence", 'Publish "Test plan: ABC-1" to Confluence space QA', runId, "done"],
    ]);
  });

  it("reuses an earlier analysis of the same issue, and publishes an earlier run's reviewed document later, in a run of its own", async () => {
    const { engine } = setup();
    // Reviewed, but not published then.
    const a = await reviewedPlan(engine);
    expect((await engine.submit(a.runId, "publish", { approve: false })).next).toMatchObject({ kind: "done", context: expect.stringContaining("Confluence: not published.") });
    expect(confluence.writes).toEqual([]);

    // The same issue again: the earlier analysis is offered, and a yes goes straight to the draft.
    const b = await engine.start("document", { type: "test-strategy", key: "ABC-1" });
    expect(b).toMatchObject({ stepId: "reuse", kind: "confirm" });
    expect(b.context).toContain(`Run ${a.runId}`);
    expect((await engine.submit(b.runId, "reuse", { reuse: true })).next.stepId).toBe("draft-test-strategy");

    // Later: only the publish, of run a's document.
    const c = await engine.start("document", { documentRun: a.runId, publish: "confluence" });
    expect(c).toMatchObject({ stepId: "publish", kind: "confirm" });
    expect(c.context).toContain('Publish the test plan "Test plan: ABC-1" to Confluence space QA?');
    const done = await engine.submit(c.runId, "publish", { approve: true });
    expect(done.next.context).toMatch(/Confluence: created page \d+ \(version 1\)/);
    expect(done.next.context).toContain(`document.md in the run folder of ${a.runId}`);
    expect((await runs.readArtifact(c.runId, CONFLUENCE_PAGE_ARTIFACT))!.data.document.run).toBe(a.runId);
    expect(confluence.pages).toHaveLength(1);

    await expect(engine.start("document", { documentRun: a.runId })).rejects.toThrow(/Invalid inputs/);
    await expect(engine.start("document", { documentRun: a.runId, publish: "confluence", key: "ABC-1" })).rejects.toThrow(/Invalid inputs/);
    await expect(engine.start("document", { documentRun: a.runId, publish: "confluence", type: "test-strategy" })).rejects.toThrow(/holds a test-plan/);
    await expect(engine.start("document", { documentRun: b.runId, publish: "confluence" })).rejects.toThrow(/no reviewed document/);

    // A document written unattended says so in the question; one whose requirements run is gone is refused at start.
    const doc = (await runs.readArtifact(a.runId, DOCUMENT_ARTIFACT))!.data;
    await runs.create({ workflow: "document", context: "ABC-1", host: "cli", driver: "api", id: "unattended-doc" });
    await runs.writeArtifact("unattended-doc", DOCUMENT_ARTIFACT, { ...doc, review: { ...doc.review, unattended: true } }, { inputs: [], templateVersion: "document-1" });
    expect((await engine.start("document", { documentRun: "unattended-doc", publish: "confluence" })).context).toContain("Nobody reviewed this document");
    await runs.create({ workflow: "document", context: "ABC-1", host: "cli", driver: "api", id: "orphan-doc" });
    await runs.writeArtifact("orphan-doc", DOCUMENT_ARTIFACT, { ...doc, sources: { ...doc.sources, requirements: { ...doc.sources.requirements, run: "gone-run" } } }, { inputs: [], templateVersion: "document-1" });
    await expect(engine.start("document", { documentRun: "orphan-doc", publish: "confluence" })).rejects.toThrow(/no requirements@1 any more/);
  });

  it("updates its own page on a rerun, to the next version", async () => {
    const { engine } = setup();
    const a = await reviewedPlan(engine);
    await engine.submit(a.runId, "publish", { approve: true });
    const b = await reviewedPlan(engine);
    expect(b.publishing.next.context).toContain(`It updates Agent-QA's page ${confluence.pages[0]!.id} (now version 1): ${SITE}/wiki/pages/viewpage.action?pageId=${confluence.pages[0]!.id}`);
    await engine.submit(b.runId, "publish", { approve: true });
    expect(confluence.pages).toHaveLength(1);
    expect(confluence.pages[0]!.version).toBe(2);
    expect((await runs.readArtifact(b.runId, CONFLUENCE_PAGE_ARTIFACT))!.data).toMatchObject({ action: "update", version: 2 });
  });

  it("gives each JQL filter its own page, kept across reruns, with no filter text in the title", async () => {
    const { engine, data } = setup({ restoreOnWrite: true });
    const one = await reviewedPlan(engine, { jql: "fixVersion = 1.0 AND reporter = 'Marguerite Quillfeather'" });
    expect(one.publishing.next.context).toMatch(/"Test plan: JQL #[0-9a-f]{10}"/);
    await engine.submit(one.runId, "publish", { approve: true });
    const two = await reviewedPlan(engine, { jql: "fixVersion = 2.0" });
    await engine.submit(two.runId, "publish", { approve: true });
    const again = await reviewedPlan(engine, { jql: "fixVersion = 2.0" });
    await engine.submit(again.runId, "publish", { approve: true });
    expect(confluence.pages.map((p) => [p.title.replace(/#[0-9a-f]{10}/, "#h"), p.version])).toEqual([["Test plan: JQL #h", 1], ["Test plan: JQL #h", 2]]);
    expect(confluence.pages[0]!.title).not.toBe(confluence.pages[1]!.title);
    for (const p of confluence.pages) expect(p.title).not.toContain("fixVersion");
    expect((await runs.readArtifact(two.runId, CONFLUENCE_PAGE_ARTIFACT))!.data.title).toBe(confluence.pages[1]!.title);

    const long = await data.confluencePlan(one.runId, `Test plan: ${"x".repeat(400)}`);
    expect(long.title).toHaveLength(255);
  });

  it("never overwrites a page with the title that Agent-QA didn't create", async () => {
    const { engine } = setup();
    confluence.pages.push({ id: "42", spaceId: "4456", title: "Test plan: ABC-1", storage: "<p>mine</p>", version: 5, labels: ["other"] });
    const { runId, publishing } = await reviewedPlan(engine);
    expect(publishing.next.context).toContain("Page 42 already has this title and Agent-QA didn't create it");
    await expect(engine.submit(runId, "publish", { approve: true })).rejects.toThrow(/isn't overwritten/);
    expect(confluence.writes).toEqual([]);
    expect(confluence.pages[0]!.storage).toBe("<p>mine</p>");
    expect(await runs.readArtifact(runId, CONFLUENCE_PAGE_ARTIFACT).catch(() => undefined)).toBeUndefined();
  });

  it("publishes nothing on no or unattended, and refuses publish when Confluence isn't set up", async () => {
    const { engine } = setup();
    const { runId } = await reviewedPlan(engine);
    expect((await engine.submit(runId, "publish", { approve: false })).next.kind).toBe("done");
    expect(confluence.writes).toEqual([]);
    expect(audit.entries).toEqual([]);

    const off = setup({ confluence: false });
    await expect(off.engine.start("document", { type: "test-plan", key: "ABC-1", publish: "confluence" })).rejects.toMatchObject({ code: "INVALID_INPUTS" });
    expect(await off.data.confluenceEnabled()).toBe(false);
    expect(await setup({ rule: "deny" }).data.confluenceEnabled()).toBe(false);
    // In CI, "ask" denies: nobody is there to answer.
    expect(await setup({ mode: "ci" }).data.confluenceEnabled()).toBe(false);
    expect(await setup({ mode: "ci", rule: "allow" }).data.confluenceEnabled()).toBe(true);
    // Without publish there is no publish step.
    const plain = await engine.start("document", { type: "test-plan", key: "ABC-1" });
    await engine.submit(plain.runId, "reuse", { reuse: false });
    await engine.submit(plain.runId, "analyze", { issues: [{ key: "ABC-1", quality: { score: 80, missing: [] }, openQuestions: [], inferredCriteria: [] }] });
    await engine.submit(plain.runId, "draft-test-plan", plan);
    expect((await engine.submit(plain.runId, "review", { approved: true, changes: [] })).next.kind).toBe("done");
  });

  it("restores real values with restoreOnWrite and refuses when the vault lost them", async () => {
    const { engine, data } = setup({ restoreOnWrite: true });
    const { runId } = await reviewedPlan(engine);
    await engine.submit(runId, "publish", { approve: true });
    expect(confluence.pages[0]!.storage).toContain("Marguerite Quillfeather");
    expect(confluence.pages[0]!.storage).not.toContain("PERSON_1");

    await expect(data.publishToConfluence(runId, runId, { title: "Plan for <PERSON_9>", markdown: "x" }, true)).rejects.toThrow(/has no value for 1 token/);
    expect(await data.publishToConfluence(runId, runId, { title: "T", markdown: "x" }, false)).toEqual({ status: "declined" });
  });

  it("says how to fix a page whose label couldn't be added", async () => {
    const { engine } = setup();
    confluence.failLabel = true;
    const { runId } = await reviewedPlan(engine);
    await expect(engine.submit(runId, "publish", { approve: true })).rejects.toThrow(/label couldn't be added .*add the label by hand/);
    expect(confluence.pages).toHaveLength(1);
  });
});
