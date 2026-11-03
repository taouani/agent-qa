import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConfluencePage, JiraCollection, JiraInput, JiraIssue } from "../src/connectors/index.js";
import { configSchema, RunStore, type ConfigInput } from "../src/core/index.js";
import { criteriaFromDescription, MaskedDataService, maskJql, splitCriteria } from "../src/data/index.js";
import { Masker } from "../src/masking/index.js";
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

describe("review fixes", () => {
  it("replaces criteria whole when they come from a description listed in masking.fields", async () => {
    const desc = issue({ key: "ABC-1", description: adf("Private notes: acct 88-1234-ZZ\nAcceptance criteria:\n- Account 88-1234-ZZ of mrs roe can log in") });
    const { svc } = service({ masking: { fields: { jira: ["description"] } } }, new FakeJira([desc]));
    const r = (await svc.requirements({ key: "ABC-1" })).sources.requirements[0]!;
    expect(JSON.stringify(r)).not.toContain("88-1234");
    expect(r.acceptanceCriteria).toEqual([{ id: "AC1", text: expect.stringMatching(/^<PII_\d+>$/) }]);
  });

  it("replaces labels, components and fix versions whole when listed", async () => {
    const tagged = issue({ key: "ABC-1", labels: ["client-jdupont-vip"], components: ["dupont account"], fixVersions: ["dupont-release"] });
    const { svc } = service({ masking: { fields: { jira: ["labels", "components", "fixVersions"] } } }, new FakeJira([tagged]));
    const { sources, report } = await svc.requirements({ key: "ABC-1" });
    expect(JSON.stringify(sources)).not.toMatch(/dupont/i);
    expect(report.wholeFields).toMatchObject({ "jira.labels": 1, "jira.components": 1, "jira.fixVersions": 1 });
  });

  it("reads again when the masking settings change", async () => {
    const phone = issue({ key: "ABC-1", summary: "Call +33 6 12 34 56 78" });
    const first = service({ masking: { detectors: ["email"] } }, new FakeJira([phone]));
    expect((await first.svc.requirements({ key: "ABC-1" })).sources.requirements[0]!.summary).toContain("+33");
    const second = service({ masking: {} }, new FakeJira([phone]));
    const again = await second.svc.requirements({ key: "ABC-1" });
    expect(again.cached).toBe(false);
    expect(again.sources.requirements[0]!.summary).not.toContain("+33");
    expect(JSON.stringify(again.sources)).not.toContain("ABC-1\"}\"");
  });

  it("masks a person's name in the JQL even with language names off", async () => {
    const { svc } = service({ masking: { languages: [] } });
    const { sources } = await svc.requirements({ jql: 'assignee = "Tobias Wrenhallow" OR assignee = wrenhallow' });
    expect(sources.input).toEqual({ jql: 'assignee = "<PERSON_2>" OR assignee = <PERSON_2>' });
    const files = await readFile(join(dir, RUN, "sources.json"), "utf8");
    expect(files).not.toMatch(/wrenhallow/i);
  });

  it("matches standard fields by their Jira names", async () => {
    const tagged = issue({ key: "ABC-1", fixVersions: ["dupont-release"], components: ["dupont account"] });
    const { svc } = service({ masking: { fields: { jira: ["Fix versions", "Component/s"] } } }, new FakeJira([tagged]));
    expect(JSON.stringify((await svc.requirements({ key: "ABC-1" })).sources)).not.toMatch(/dupont/i);
  });

  it("treats an older sources file as a miss", async () => {
    const { svc } = service();
    await svc.requirements({ key: "ABC-1" });
    const { writeFile } = await import("node:fs/promises");
    const file = join(dir, RUN, "sources.json");
    const old = JSON.parse(await readFile(file, "utf8"));
    delete old.data.cacheKey;
    await writeFile(file, JSON.stringify(old));
    expect((await svc.requirements({ key: "ABC-1" })).cached).toBe(false);
  });

  it("does not repeat the acceptance criteria field among the extra fields", async () => {
    const withAc = issue({ key: "ABC-1", acceptanceCriteria: adf("- one"), extraFields: { "Acceptance Criteria": adf("- one") } });
    const jira = new FakeJira([withAc]);
    jira.collect = async (input: JiraInput) => ({
      input,
      issues: [structuredClone(withAc)],
      truncated: false,
      unreachable: [],
      extraFields: [{ id: "customfield_10100", name: "Acceptance Criteria", custom: true }],
      acceptanceCriteriaField: { id: "customfield_10100", name: "Acceptance Criteria", custom: true },
    });
    const { svc } = service({ masking: { fields: { jira: ["CustomField_10100"] } } }, jira);
    const r = (await svc.requirements({ key: "ABC-1" })).sources.requirements[0]!;
    expect(r.extraFields).toEqual({});
    expect(r.acceptanceCriteria).toEqual([{ id: "AC1", text: expect.stringMatching(/^<PII_\d+>$/) }]);
  });
});

describe("acceptance criteria splitting", () => {
  it("keeps numbers and abbreviations at the start of a line, and separate When lines", () => {
    expect(splitCriteria("1.5 s maximum response time\ne.g. the badge\nE-mail is sent\nWhen offline, a banner is shown").map((c) => c.text)).toEqual([
      "1.5 s maximum response time",
      "e.g. the badge",
      "E-mail is sent",
      "When offline, a banner is shown",
    ]);
    expect(splitCriteria("Data is exported nightly\nWhen offline, a banner is shown")).toHaveLength(2);
    expect(splitCriteria("假如用户已登录\n当用户提交").map((c) => c.text)).toEqual(["假如用户已登录\n当用户提交"]);
    expect(criteriaFromDescription("Acceptance criteria:\nGiven a\nThen b\n\nGiven c\nThen d\n\nOther text")).toEqual({
      criteria: "Given a\nThen b\n\nGiven c\nThen d",
      rest: "Other text",
    });
  });

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

describe("maskJql", () => {
  const cases: Array<[string, string]> = [
    ["project = ABC AND assignee = jdoe AND reporter = 5b10ac8d82e05b22cc7d4ef5", "project = ABC AND assignee = <PERSON_1> AND reporter = <PERSON_2>"],
    ['assignee in (jdoe, "Doe, John", currentUser()) ORDER BY assignee DESC', 'assignee in (<PERSON_1>, "<PERSON_3>", currentUser()) ORDER BY assignee DESC'],
    ["status changed by jdoe AND status changed from Open to Done ORDER BY created", "status changed by <PERSON_1> AND status changed from Open to Done ORDER BY created"],
    ["assignee is EMPTY OR assignee = EMPTY OR watcher != 557058:f58131cb-b67d-43c7-b30d-6b58d40bd077", "assignee is EMPTY OR assignee = EMPTY OR watcher != <PERSON_4>"],
    ['text ~ "mail jean.dupont@example.com" AND cf[10001] = 5b10ac8d82e05b22cc7d4ef5', "text ~ \"mail <EMAIL_1>\" AND cf[10001] = <PERSON_2>"],
    ["assignee changed from jdoe to asmith by bob AND status changed from Open to Done", "assignee changed from <PERSON_1> to <PERSON_5> by <PERSON_6> AND status changed from Open to Done"],
    ['"Assignee" = jdoe OR worklogAuthor = asmith OR assignee was jdoe by bob', '"Assignee" = <PERSON_1> OR worklogAuthor = <PERSON_5> OR assignee was <PERSON_1> by <PERSON_6>'],
    ['assignee in (jdoe, "a)b", asmith) AND reporter in membersOf("team")', 'assignee in (<PERSON_1>, "<PERSON_7>", <PERSON_5>) AND reporter in membersOf("team")'],
    ["assignee in (jdoe, asmith", "assignee in (<PERSON_1>, <PERSON_5>"],
    ["issuekey in updatedBy(jdoe) AND approval = pendingBy(asmith)", "issuekey in updatedBy(<PERSON_1>) AND approval = pendingBy(<PERSON_5>)"],
    ["assignee in (jdoe (x), asmith) OR assignee = jdoe(", "assignee in (<PERSON_1> (<PERSON_8>), <PERSON_5>) OR assignee = <PERSON_1>("],
    ["assignee in ((jdoe), asmith) AND summary ~ hello!", "assignee in ((<PERSON_1>), <PERSON_5>) AND summary ~ hello!"],
    ["assignee was jdoe constructor asmith", "assignee was <PERSON_1> constructor asmith"],
  ];
  it("replaces people field values, account ids and detected values with tokens", () => {
    const masker = new Masker({ vault });
    for (const [jql, masked] of cases) expect(maskJql(jql, masker), jql).toBe(masked);
  });

  it("keeps quoted text whole, so a name in it is masked as one", () => {
    const masker = new Masker({ vault });
    masker.addNames(["Marguerite Quillfeather"]);
    for (const jql of ['summary ~ "assignee = Marguerite Quillfeather"', 'status was Done AND summary ~ "written by Marguerite Quillfeather"']) {
      const masked = maskJql(jql, masker);
      expect(masked, jql).not.toMatch(/Marguerite|Quillfeather/);
      expect(masked, jql).toContain("<PERSON_");
    }
  });
});
