import { describe, expect, it } from "vitest";
import { adfToText } from "../src/connectors/adf.js";
import type { FetchLike } from "../src/connectors/http.js";
import { JiraClient } from "../src/connectors/jira.js";

const doc = (...content: unknown[]) => ({ type: "doc", version: 1, content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string, marks?: unknown[]) => ({ type: "text", text, ...(marks ? { marks } : {}) });

describe("adfToText", () => {
  it("keeps structure as light Markdown", () => {
    const out = adfToText(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [t("Acceptance criteria")] },
        { type: "orderedList", attrs: { order: 1 }, content: [{ type: "listItem", content: [p(t("Given a contact"))] }, { type: "listItem", content: [p(t("When I click "), t("New Case", [{ type: "strong" }]))] }] },
        { type: "bulletList", content: [{ type: "listItem", content: [p(t("outer")), { type: "bulletList", content: [{ type: "listItem", content: [p(t("inner"))] }] }] }] },
        { type: "codeBlock", attrs: { language: "json" }, content: [t('{"a":1}')] },
        { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [p(t("Field"))] }, { type: "tableHeader", content: [p(t("Value"))] }] }, { type: "tableRow", content: [{ type: "tableCell", content: [p(t("Subject"))] }, { type: "tableCell", content: [p(t("a|b"))] }] }] },
        { type: "rule" },
        { type: "taskList", content: [{ type: "taskItem", attrs: { state: "DONE" }, content: [t("done")] }] },
      ),
    );
    expect(out.text).toBe(
      [
        "## Acceptance criteria",
        "1. Given a contact\n2. When I click New Case",
        "- outer\n  - inner",
        '```json\n{"a":1}\n```',
        "| Field | Value |\n| --- | --- |\n| Subject | a\\|b |",
        "---",
        "- [x] done",
      ].join("\n\n"),
    );
  });

  it("collects mentions and links", () => {
    const out = adfToText(
      doc(
        p(t("Ask "), { type: "mention", attrs: { id: "abc", text: "@Marguerite Quillfeather" } }, t(" or "), { type: "mention", attrs: { id: "abc", text: "@Marguerite Quillfeather" } }),
        p(t("spec", [{ type: "link", attrs: { href: "https://x.atlassian.net/wiki/spaces/A/pages/123" } }])),
        { type: "blockCard", attrs: { url: "https://x.atlassian.net/wiki/spaces/A/pages/456" } },
      ),
    );
    expect(out.mentions).toEqual(["Marguerite Quillfeather"]);
    expect(out.links).toEqual(["https://x.atlassian.net/wiki/spaces/A/pages/123", "https://x.atlassian.net/wiki/spaces/A/pages/456"]);
    expect(out.text).toContain("Ask @Marguerite Quillfeather or @Marguerite Quillfeather");
    expect(out.text).toContain("spec (https://x.atlassian.net/wiki/spaces/A/pages/123)");
  });

  it("handles strings, nulls, breaks, dates and unknown nodes", () => {
    expect(adfToText("plain").text).toBe("plain");
    expect(adfToText(null).text).toBe("");
    expect(adfToText(doc(p(t("a"), { type: "hardBreak" }, t("b")))).text).toBe("a\nb");
    expect(adfToText(doc(p({ type: "date", attrs: { timestamp: "1767225600000" } }))).text).toBe("2026-01-01");
    expect(adfToText(doc({ type: "futureThing", content: [p(t("kept"))] })).text).toBe("kept");
    expect(adfToText(doc({ type: "mediaSingle", content: [{ type: "media" }] })).text).toBe("[attachment]");
  });
});

/** A small in-memory Jira: issues, a parent hierarchy, links and remote links. */
function fakeJira(issues: Record<string, { type?: string; parent?: string; links?: string[]; subtask?: boolean; ac?: string; remote?: string[] }>) {
  const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
  const raw = (key: string) => {
    const i = issues[key]!;
    return {
      id: String(Object.keys(issues).indexOf(key) + 10000),
      key,
      fields: {
        summary: `Summary ${key}`,
        description: doc(p(t(`Description of ${key}`))),
        issuetype: { name: i.type ?? "Story", subtask: i.subtask ?? false },
        status: { name: "To Do" },
        priority: { name: "Medium" },
        labels: ["web"],
        components: [{ name: "Cases" }],
        fixVersions: [],
        ...(i.parent ? { parent: { key: i.parent } } : {}),
        subtasks: Object.entries(issues)
          .filter(([, c]) => c.parent === key && c.subtask)
          .map(([k]) => ({ key: k })),
        issuelinks: (i.links ?? []).map((k) => ({ type: { name: "Relates", inward: "relates to", outward: "relates to" }, outwardIssue: { key: k } })),
        assignee: { accountId: "a1", displayName: "Tobias Wrenhallow" },
        reporter: { accountId: "a2", displayName: "Marguerite Quillfeather", emailAddress: "m.quillfeather@example.com" },
        created: "2026-10-01T10:00:00.000+0000",
        updated: "2026-10-02T10:00:00.000+0000",
        ...(i.ac ? { customfield_10050: doc(p(t(i.ac))) } : {}),
      },
    };
  };
  const fetch: FetchLike = async (url, init) => {
    const u = new URL(url);
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method: init.method ?? "GET", path: u.pathname, ...(body ? { body } : {}) });
    const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
    if (u.pathname === "/rest/api/3/field") {
      return ok([
        { id: "summary", name: "Summary", custom: false },
        { id: "customfield_10050", name: "Acceptance Criteria", custom: true },
        { id: "customfield_10060", name: "Team notes", custom: true },
      ]);
    }
    const issueMatch = /^\/rest\/api\/3\/issue\/([A-Z0-9_]+-\d+)(\/remotelink)?$/.exec(u.pathname);
    if (issueMatch) {
      const key = issueMatch[1]!;
      if (!issues[key]) return new Response("{}", { status: 404 });
      if (issueMatch[2]) return ok((issues[key]!.remote ?? []).map((url) => ({ object: { url, title: "Spec" }, application: { type: "com.atlassian.confluence" } })));
      return ok(raw(key));
    }
    if (u.pathname === "/rest/api/3/search/jql") {
      const jql = String(body!.jql);
      let keys: string[];
      const parentIn = /^parent in \(([^)]*)\)/.exec(jql);
      const keyIn = /^key in \(([^)]*)\)/.exec(jql);
      if (parentIn) {
        const parents = parentIn[1]!.split(",");
        keys = Object.keys(issues).filter((k) => parents.includes(issues[k]!.parent ?? ""));
      } else if (keyIn) {
        const wanted = keyIn[1]!.split(",");
        keys = Object.keys(issues).filter((k) => wanted.includes(k));
      } else {
        keys = Object.keys(issues).filter((k) => !issues[k]!.parent).sort();
      }
      // Two per page, to exercise nextPageToken.
      const start = body!.nextPageToken ? Number(body!.nextPageToken) : 0;
      const size = Math.min(2, Number(body!.maxResults));
      const page = keys.slice(start, start + size);
      const more = start + size < keys.length;
      return ok({ issues: page.map(raw), ...(more ? { nextPageToken: String(start + size) } : {}), isLast: !more });
    }
    return new Response("{}", { status: 404 });
  };
  return { fetch, calls };
}

const jira = (fetch: FetchLike) => new JiraClient({ site: "https://example.atlassian.net", email: "bot@example.com", token: "tok", fetch, sleep: async () => {} });

const TREE = {
  "QA-1": { type: "Epic", links: ["QA-9"], remote: ["https://example.atlassian.net/wiki/spaces/QA/pages/123"] },
  "QA-2": { parent: "QA-1", ac: "Given a contact, a case opens" },
  "QA-3": { parent: "QA-1" },
  "QA-4": { parent: "QA-2", type: "Task" },
  "QA-5": { parent: "QA-4", type: "Sub-task", subtask: true },
  "QA-9": { type: "Bug", links: ["QA-10"] },
  "QA-10": { type: "Story" },
};

describe("JiraClient.collect", () => {
  it("follows an epic down to sub-tasks and its links one level out", async () => {
    const { fetch, calls } = fakeJira(TREE);
    const result = await jira(fetch).collect({ key: "QA-1" });
    const byKey = Object.fromEntries(result.issues.map((i) => [i.key, i]));
    expect(Object.keys(byKey).sort()).toEqual(["QA-1", "QA-2", "QA-3", "QA-4", "QA-5", "QA-9"]);
    expect(byKey["QA-1"]).toMatchObject({ role: "root", depth: 0, type: "Epic", children: ["QA-2", "QA-3"] });
    expect(byKey["QA-2"]).toMatchObject({ role: "child", depth: 1, parent: "QA-1", children: ["QA-4"] });
    expect(byKey["QA-4"]).toMatchObject({ role: "child", depth: 2, type: "Task", children: ["QA-5"] });
    expect(byKey["QA-5"]).toMatchObject({ role: "child", depth: 3, subtask: true });
    // Linked issues are fetched but not followed: QA-10 (linked from QA-9) is not included.
    expect(byKey["QA-9"]).toMatchObject({ role: "linked", depth: 0 });
    expect(result.truncated).toBe(false);
    expect(byKey["QA-2"]!.acceptanceCriteria?.text).toBe("Given a contact, a case opens");
    expect(result.acceptanceCriteriaField).toEqual({ id: "customfield_10050", name: "Acceptance Criteria", custom: true });
    expect(byKey["QA-1"]!.remoteLinks).toEqual([{ url: "https://example.atlassian.net/wiki/spaces/QA/pages/123", title: "Spec", application: "com.atlassian.confluence" }]);
    expect(byKey["QA-1"]!.people.map((p) => p.displayName)).toEqual(["Tobias Wrenhallow", "Marguerite Quillfeather"]);
    expect(byKey["QA-1"]!.links).toEqual([{ type: "Relates", direction: "outward", description: "relates to", key: "QA-9" }]);
    // Searches are POSTs to the read-only search endpoint; nothing else is written.
    expect(calls.filter((c) => c.method !== "GET").every((c) => c.path === "/rest/api/3/search/jql")).toBe(true);
    expect(calls.find((c) => c.path === "/rest/api/3/search/jql")!.body!.fields).toContain("customfield_10050");
  });

  it("takes a JQL filter as input, across pages", async () => {
    const { fetch } = fakeJira(TREE);
    const result = await jira(fetch).collect({ jql: "project = QA AND parent is EMPTY" }, { maxDepth: 0, followLinks: false });
    expect(result.issues.map((i) => [i.key, i.role])).toEqual([
      ["QA-1", "root"],
      ["QA-10", "root"],
      ["QA-9", "root"],
    ]);
  });

  it("stops at maxDepth and says it truncated", async () => {
    const { fetch } = fakeJira(TREE);
    const result = await jira(fetch).collect({ key: "QA-1" }, { maxDepth: 1, followLinks: false });
    expect(result.issues.map((i) => i.key).sort()).toEqual(["QA-1", "QA-2", "QA-3"]);
    expect(result.truncated).toBe(true);
  });

  it("stops at maxIssues and says it truncated", async () => {
    const { fetch } = fakeJira(TREE);
    const result = await jira(fetch).collect({ key: "QA-1" }, { maxIssues: 3 });
    expect(result.issues).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it("uses a configured acceptance-criteria field and extra fields by name", async () => {
    const { fetch } = fakeJira(TREE);
    const client = jira(fetch);
    await expect(client.collect({ key: "QA-2" }, { acceptanceCriteriaField: "Nope" })).rejects.toThrow(/no field "Nope"/);
    const result = await client.collect({ key: "QA-2" }, { acceptanceCriteriaField: "acceptance criteria", extraFields: ["Team notes"], maxDepth: 0 });
    expect(result.issues[0]!.acceptanceCriteria?.text).toBe("Given a contact, a case opens");
    await expect(client.collect({ key: "QA-2" }, { extraFields: ["Missing"] })).rejects.toThrow(/no field "Missing"/);
  });

  it("refuses a malformed key before calling Jira", async () => {
    const { fetch, calls } = fakeJira(TREE);
    await expect(jira(fetch).collect({ key: "QA-1/../../myself" })).rejects.toThrow(/Not a Jira issue key/);
    expect(calls.filter((c) => c.path.startsWith("/rest/api/3/issue"))).toHaveLength(0);
  });

  it("sends Basic auth and can't write", async () => {
    const seen: string[] = [];
    const { fetch } = fakeJira(TREE);
    const spy: FetchLike = (url, init) => {
      seen.push((init.headers as Record<string, string>).authorization!);
      return fetch(url, init);
    };
    const client = jira(spy);
    await client.issue("QA-1", ["summary"]);
    expect(seen[0]).toBe("Basic " + Buffer.from("bot@example.com:tok").toString("base64"));
    await expect(client.http.request("/rest/api/3/issue", { method: "POST", body: {} })).rejects.toThrow(/needs a policy grant/);
  });
});
