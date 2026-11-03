import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConfluencePage, JiraCollection, JiraInput, JiraIssue } from "../src/connectors/index.js";
import { configSchema, RunStore, type ConfigInput } from "../src/core/index.js";
import { criteriaFromDescription, MaskedDataService, splitCriteria } from "../src/data/index.js";
import { MemoryVaultStorage, Vault, type RunVault } from "../src/masking/index.js";

const SITE = "https://acme.atlassian.net";
const adf = (text: string, extra: { mentions?: string[]; links?: string[] } = {}) => ({ text, mentions: extra.mentions ?? [], links: extra.links ?? [] });

function issue(over: Partial<JiraIssue> & { key: string }): JiraIssue {
  return {
    id: "1",
    type: "Story",
    subtask: false,
    summary: "",
    description: adf(""),
    extraFields: {},
    labels: [],
    components: [],
    fixVersions: [],
    children: [],
    links: [],
    remoteLinks: [],
    people: [],
    updated: "2026-11-01T10:00:00.000+0000",
    role: "root",
    depth: 0,
    ...over,
  };
}

const EPIC = issue({
  key: "ABC-1",
  type: "Epic",
  summary: "Case escalation for Marguerite Quillfeather's team",
  description: adf(
    "Escalate cases older than 2 days. Contact jean.dupont@example.com or +33 6 12 34 56 78.\nSee the spec page.\n\nAcceptance criteria:\n- A case older than 2 days is escalated\n- The owner Tobias Wrenhallow is notified\n\nNotes: ask Mme Lefèvre.",
    { links: [`${SITE}/wiki/spaces/QA/pages/123456/Spec`] },
  ),
  children: ["ABC-2"],
  people: [
    { role: "reporter", displayName: "Marguerite Quillfeather", accountId: "a1" },
    { role: "assignee", displayName: "Tobias Wrenhallow", accountId: "a2" },
  ],
  extraFields: { "Customer phone": adf("0612345678"), Notes: adf("Call @Ines Okafor tomorrow", { mentions: ["Ines Okafor"] }) },
  labels: ["escalation"],
});

const STORY = issue({
  key: "ABC-2",
  parent: "ABC-1",
  role: "child",
  depth: 1,
  summary: "Notify the owner",
  description: adf("Send the alert to Tobias."),
  acceptanceCriteria: adf("Given a case older than 2 days\nWhen the job runs\nThen Tobias Wrenhallow gets an email\nAC2: The alert names the case"),
  links: [{ type: "Blocks", direction: "outward", description: "blocks", key: "XYZ-9" }],
  remoteLinks: [{ url: `${SITE}/wiki/spaces/QA/pages/123456/Spec`, application: "com.atlassian.confluence" }],
});

const PAGE: ConfluencePage = {
  id: "123456",
  title: "Spec by Ines Okafor",
  version: 7,
  url: `${SITE}/wiki/spaces/QA/pages/123456/Spec`,
  body: { text: "Owner: Marguerite Quillfeather. IBAN FR76 3000 6000 0112 3456 7890 189.", accountIds: [], links: [], pageTitles: [] },
};

class FakeJira {
  calls = 0;
  constructor(private readonly issues: JiraIssue[]) {}
  async collect(input: JiraInput): Promise<JiraCollection> {
    this.calls++;
    return {
      input,
      issues: structuredClone(this.issues),
      truncated: false,
      unreachable: ["XYZ-9"],
      extraFields: [
        { id: "customfield_10042", name: "Customer phone", custom: true },
        { id: "customfield_10050", name: "Notes", custom: true },
      ],
    };
  }
}

class FakeConfluence {
  calls = 0;
  async pages(urls: string[]) {
    this.calls++;
    return { pages: urls.some((u) => u.includes("123456")) ? [structuredClone(PAGE)] : [], skipped: [] };
  }
}

let dir: string;
let store: RunStore;
let vault: RunVault;
const RUN = "2026-11-03-ABC-1-abcd";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-qa-data-"));
  store = new RunStore(dir);
  await store.create({ workflow: "requirements", context: "ABC-1", host: "cli", driver: "api", id: RUN });
  const key = randomBytes(32);
  vault = await new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => key } }).open(RUN);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function service(config: Partial<ConfigInput> = {}, jira = new FakeJira([EPIC, STORY]), confluence = new FakeConfluence()) {
  const parsed = configSchema.parse({
    version: 1,
    atlassian: { site: SITE, email: "${env:E}", token: "${env:T}" },
    masking: { fields: { jira: ["customfield_10042"] } },
    ...config,
  });
  return { svc: new MaskedDataService({ config: parsed, store, runId: RUN, vault, jira, confluence }), jira, confluence };
}

const SECRETS = ["Marguerite", "Quillfeather", "Tobias", "Wrenhallow", "jean.dupont", "12 34 56 78", "0612345678", "Ines", "Okafor", "Lefèvre", "3000 6000"];

describe("masked data service", () => {
  it("returns masked requirements with stable tokens and no real values", async () => {
    const { svc } = service();
    const { sources, report, cached } = await svc.requirements({ key: "abc-1" });
    expect(cached).toBe(false);
    const json = JSON.stringify(sources);
    for (const s of SECRETS) expect(json, s).not.toContain(s);

    const [epic, story] = sources.requirements;
    expect(sources.input).toEqual({ key: "ABC-1" });
    expect(epic!.people).toEqual([
      { role: "reporter", token: "<PERSON_1>" },
      { role: "assignee", token: "<PERSON_2>" },
    ]);
    expect(epic!.summary).toBe("Case escalation for <PERSON_1>'s team");
    expect(epic!.extraFields["Customer phone"]).toMatch(/^<PII_\d+>$/);
    expect(epic!.extraFields.Notes).toMatch(/^Call @?<PERSON_\d+> tomorrow$/);
    // Criteria under a heading in the description move out of it.
    expect(epic!.acceptanceCriteriaSource).toBe("description");
    expect(epic!.acceptanceCriteria).toEqual([
      { id: "AC1", text: "A case older than 2 days is escalated" },
      { id: "AC2", text: "The owner <PERSON_2> is notified" },
    ]);
    expect(epic!.description).not.toMatch(/Acceptance criteria/);
    expect(epic!.description).toMatch(/Notes: ask Mme <PERSON_\d+>\./);
    // The story keeps its Gherkin scenario as one criterion and is linked to the same page.
    expect(story!.acceptanceCriteriaSource).toBe("field");
    expect(story!.acceptanceCriteria).toEqual([
      { id: "AC1", text: "Given a case older than 2 days\nWhen the job runs\nThen <PERSON_2> gets an email" },
      { id: "AC2", text: "The alert names the case" },
    ]);
    expect(story!.description).toBe("Send the alert to <PERSON_2>.");
    expect(story!.links).toEqual([{ type: "Blocks", direction: "outward", description: "blocks", key: "XYZ-9" }]);
    expect(epic!.linkedPages.map((p) => p.id)).toEqual(["123456"]);
    expect(story!.linkedPages[0]).toEqual(epic!.linkedPages[0]);
    expect(story!.linkedPages[0]!.text).toMatch(/^Owner: <PERSON_1>\. IBAN <IBAN_1>\.$/);
    expect(sources.unreachable).toEqual(["XYZ-9"]);

    expect(report.issues).toBe(2);
    expect(report.pages).toBe(1);
    expect(report.wholeFields).toMatchObject({ "jira.reporter": 1, "jira.assignee": 1, "jira.field.Customer phone": 1 });
    expect(report.byDetector.email).toBe(1);
    expect(report.byDetector.iban).toBe(1);
    expect(report.tokens).toBeGreaterThanOrEqual(6);
    expect(JSON.stringify(report)).not.toMatch(/Marguerite|Tobias|example\.com/);
  });

  it("writes sources and the masking report to the run folder and reuses them", async () => {
    const { svc, jira } = service();
    const first = await svc.requirements({ key: "ABC-1" });
    const files = await Promise.all(["sources.json", "masking-report.json", "masking-report.md"].map((f) => readFile(join(dir, RUN, f), "utf8")));
    for (const f of files) for (const s of SECRETS) expect(f, s).not.toContain(s);
    expect(JSON.parse(files[0]!)).toMatchObject({ schema: "sources@1", masked: true });
    expect(files[2]).toContain("# Masking report");
    const manifest = await store.manifest(RUN);
    expect(JSON.stringify(manifest!.artifacts)).toMatch(/sources@1[\s\S]*masking-report@1/);

    const again = await svc.requirements({ key: "ABC-1" });
    expect(again.cached).toBe(true);
    expect(jira.calls).toBe(1);
    expect(again.sources).toEqual(first.sources);
    expect(again.inputs).toEqual(first.inputs);

    const refreshed = await svc.requirements({ key: "ABC-1" }, { refresh: true });
    expect(refreshed.cached).toBe(false);
    expect(jira.calls).toBe(2);
    expect(refreshed.sources).toEqual(first.sources); // same vault, same tokens
  });

  it("reads again for a different input and masks names in JQL", async () => {
    const { svc, jira } = service();
    await svc.requirements({ key: "ABC-1" });
    const byJql = await svc.requirements({ jql: 'assignee = "Tobias Wrenhallow" AND project = ABC' });
    expect(jira.calls).toBe(2);
    expect(byJql.sources.input).toEqual({ jql: 'assignee = "<PERSON_2>" AND project = ABC' });
  });

  it("changes the source hash when the issue or a linked page changes, not when nothing does", async () => {
    const { svc } = service();
    const a = (await svc.requirements({ key: "ABC-1" })).sources.requirements[1]!.sourceHash;
    const b = (await svc.requirements({ key: "ABC-1" }, { refresh: true })).sources.requirements[1]!.sourceHash;
    expect(b).toBe(a);
    const edited = { ...STORY, updated: "2026-11-02T10:00:00.000+0000" };
    const { svc: svc2 } = service({}, new FakeJira([EPIC, edited]));
    const c = (await svc2.requirements({ key: "ABC-1" }, { refresh: true })).sources.requirements[1]!.sourceHash;
    expect(c).not.toBe(a);
  });

  it("follows masking.languages and detectors from the config", async () => {
    const { svc } = service({ masking: { detectors: ["email", "name"], languages: [] } });
    const { sources, report } = await svc.requirements({ key: "ABC-1" });
    expect(report.languages).toEqual([]);
    expect(report.detectors).toEqual(["email", "name"]);
    // Phone detector off: the number stays; language names off: Mme Lefèvre stays.
    expect(sources.requirements[0]!.description).toContain("+33 6 12 34 56 78");
    expect(sources.requirements[0]!.description).toContain("Mme Lefèvre");
  });

  it("refuses to run without an atlassian section", async () => {
    const parsed = configSchema.parse({ version: 1 });
    const svc = new MaskedDataService({ config: parsed, store, runId: RUN, vault });
    await expect(svc.requirements({ key: "ABC-1" })).rejects.toThrow(/atlassian/);
  });
});

describe("acceptance criteria splitting", () => {
  it("splits bullets and numbered lines, keeping Gherkin continuations", () => {
    expect(splitCriteria("1. First\n2) Second\n* Third")).toEqual([
      { id: "AC1", text: "First" },
      { id: "AC2", text: "Second" },
      { id: "AC3", text: "Third" },
    ]);
    expect(splitCriteria("Scenario: ok\nGiven x\nAnd y\nThen z").map((c) => c.text)).toEqual(["Scenario: ok", "Given x\nAnd y\nThen z"]);
  });

  it("finds criteria headings in the supported languages and stops at the next heading", () => {
    expect(criteriaFromDescription("Intro\nCritères d'acceptation :\n- un\n- deux\nRemarques:\nfin")).toEqual({ criteria: "- un\n- deux", rest: "Intro\nRemarques:\nfin" });
    expect(criteriaFromDescription("Akzeptanzkriterien\n- eins")?.criteria).toBe("- eins");
    expect(criteriaFromDescription("验收标准：\n1. 可以提交")?.criteria).toBe("1. 可以提交");
    expect(criteriaFromDescription("No criteria here")).toBeUndefined();
  });
});
