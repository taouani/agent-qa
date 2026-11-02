import { describe, expect, it } from "vitest";
import { ConfluenceClient, pageIdFromUrl, pageIdToTiny, tinyToPageId } from "../src/connectors/confluence.js";
import type { FetchLike } from "../src/connectors/http.js";
import { decodeEntities, storageToText } from "../src/connectors/storage.js";

const SITE = "https://example.atlassian.net";

describe("storageToText", () => {
  it("keeps structure as light Markdown", () => {
    const xml = [
      "<h2>Acceptance criteria</h2>",
      "<ol><li><p>Given a contact</p></li><li>When I click <strong>New Case</strong></li></ol>",
      "<ul><li>outer<ul><li>inner</li></ul></li></ul>",
      '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">json</ac:parameter><ac:plain-text-body><![CDATA[{"a": "<b>"}]]></ac:plain-text-body></ac:structured-macro>',
      "<table><tbody><tr><th><p>Field</p></th><th>Value</th></tr><tr><td>Subject</td><td>a|b</td></tr></tbody></table>",
      "<hr/>",
      "<ac:task-list><ac:task><ac:task-id>1</ac:task-id><ac:task-status>complete</ac:task-status><ac:task-body>done</ac:task-body></ac:task><ac:task><ac:task-status>incomplete</ac:task-status><ac:task-body>todo</ac:task-body></ac:task></ac:task-list>",
    ].join("");
    expect(storageToText(xml).text).toBe(
      [
        "## Acceptance criteria",
        "1. Given a contact\n2. When I click New Case",
        "- outer\n  - inner",
        '```json\n{"a": "<b>"}\n```',
        "| Field | Value |\n| --- | --- |\n| Subject | a\\|b |",
        "---",
        "- [x] done\n- [ ] todo",
      ].join("\n\n"),
    );
  });

  it("collects user mentions as account ids, links and page titles", () => {
    const xml =
      '<p>Ask <ac:link><ri:user ri:account-id="5b10ac8d82e05b22cc7d4ef5" /></ac:link> about ' +
      '<ac:link><ri:page ri:content-title="Case rules" ri:space-key="QA" /><ac:plain-text-link-body><![CDATA[the rules]]></ac:plain-text-link-body></ac:link>, ' +
      '<ac:link><ri:page ri:content-title="Glossary" /></ac:link> and <a href="https://help.example.com/x?a=1&amp;b=2">help</a>.</p>';
    const out = storageToText(xml);
    expect(out.text).toBe("Ask @user about the rules, Glossary and help (https://help.example.com/x?a=1&b=2).");
    expect(out.accountIds).toEqual(["5b10ac8d82e05b22cc7d4ef5"]);
    expect(out.pageTitles).toEqual(["Case rules", "Glossary"]);
    expect(out.links).toEqual(["https://help.example.com/x?a=1&b=2"]);
  });

  it("keeps panel text, drops navigation macros and parameters, marks images", () => {
    const xml =
      '<ac:structured-macro ac:name="info"><ac:parameter ac:name="title">Note</ac:parameter><ac:rich-text-body><p>Only admins</p></ac:rich-text-body></ac:structured-macro>' +
      '<ac:structured-macro ac:name="toc"><ac:parameter ac:name="maxLevel">2</ac:parameter></ac:structured-macro>' +
      '<ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">QA-7</ac:parameter></ac:structured-macro>' +
      '<ac:image><ri:attachment ri:filename="screen.png" /></ac:image>' +
      '<p>Due <time datetime="2026-12-13" /> <ac:emoticon ac:name="tick" ac:emoji-fallback="✅" /></p>';
    expect(storageToText(xml).text).toBe("Note\nOnly admins\n\nQA-7\n\n[attachment]\n\nDue 2026-12-13 ✅");
  });

  it("tolerates sloppy markup and decodes entities", () => {
    expect(storageToText("<p>a &amp; b&nbsp;&rarr; &#233;&#x4E2D; &bogus;</p></div><p>c < d").text).toBe("a & b → é中 &bogus;\n\nc < d");
    expect(storageToText("").text).toBe("");
    expect(storageToText(undefined).text).toBe("");
    expect(storageToText("<p>line<br/>break</p><!-- hidden -->").text).toBe("line\nbreak");
    expect(decodeEntities("&#0; &#99999999;")).toBe("&#0; &#99999999;");
  });

  it("ignores non-http links and does not run inside CDATA", () => {
    const out = storageToText('<p><a href="javascript:alert(1)">x</a></p><pre><![CDATA[<p>raw</p>]]></pre>');
    expect(out.links).toEqual([]);
    expect(out.text).toBe("x\n\n```\n<p>raw</p>\n```");
  });
});

describe("page URLs", () => {
  it("finds the page id in the common URL forms", () => {
    expect(pageIdFromUrl(`${SITE}/wiki/spaces/QA/pages/123456/Case+rules`, SITE)).toEqual({ id: "123456" });
    expect(pageIdFromUrl(`${SITE}/wiki/spaces/QA/pages/123456`, SITE)).toEqual({ id: "123456" });
    expect(pageIdFromUrl(`${SITE}/wiki/spaces/QA/pages/edit-v2/123456`, SITE)).toEqual({ id: "123456" });
    expect(pageIdFromUrl(`${SITE}/wiki/pages/viewpage.action?pageId=987`, SITE)).toEqual({ id: "987" });
    expect(pageIdFromUrl(`${SITE}/wiki/x/${pageIdToTiny("2148139010")}`, SITE)).toEqual({ id: "2148139010" });
  });

  it("skips other sites and non-page links", () => {
    expect(pageIdFromUrl("https://other.atlassian.net/wiki/spaces/QA/pages/1", SITE)).toEqual({ skip: "other-site" });
    expect(pageIdFromUrl(`${SITE}/browse/QA-1`, SITE)).toEqual({ skip: "not-confluence" });
    expect(pageIdFromUrl(`${SITE}/wiki/spaces/QA/overview`, SITE)).toEqual({ skip: "not-a-page" });
    expect(pageIdFromUrl(`${SITE}/wiki/pages/viewpage.action?pageId=1;drop`, SITE)).toEqual({ skip: "not-a-page" });
    expect(pageIdFromUrl("not a url", SITE)).toEqual({ skip: "not-confluence" });
  });

  it("round-trips tiny links", () => {
    for (const id of ["1", "255", "256", "65536", "98765", "2148139010", "9007199254740993"]) expect(tinyToPageId(pageIdToTiny(id))).toBe(id);
    expect(tinyToPageId("")).toBeUndefined();
    expect(tinyToPageId("a/b")).toBeUndefined();
  });
});

type Call = { url: string; init: RequestInit };

function fakeConfluence(pages: Record<string, { title: string; version: number; body: string; status?: number }>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const u = new URL(url);
    const m = /^\/wiki\/api\/v2\/pages\/(\d+)$/.exec(u.pathname);
    const page = m ? pages[m[1]!] : undefined;
    if (!page) return new Response(JSON.stringify({ errors: [{ title: "Not found" }] }), { status: 404 });
    if (page.status) return new Response("{}", { status: page.status });
    return new Response(
      JSON.stringify({
        id: m![1],
        title: page.title,
        spaceId: "4456",
        version: { number: page.version, createdAt: "2026-10-30T10:00:00.000Z" },
        body: { storage: { value: page.body, representation: "storage" } },
        _links: { webui: `/spaces/QA/pages/${m![1]}/x` },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { fetch, calls };
}

describe("ConfluenceClient", () => {
  const client = (fetch: FetchLike) => new ConfluenceClient({ site: SITE, email: "qa@example.com", token: "secret-token", fetch, retries: 0 });

  it("reads a page as text with its version, through the v2 API and Basic auth", async () => {
    const { fetch, calls } = fakeConfluence({ "123": { title: "Case rules", version: 7, body: "<p>Hello</p>" } });
    const page = await client(fetch).page("123");
    expect(page).toMatchObject({ id: "123", title: "Case rules", version: 7, spaceId: "4456", versionCreatedAt: "2026-10-30T10:00:00.000Z" });
    expect(page.url).toBe(`${SITE}/wiki/spaces/QA/pages/123/x`);
    expect(page.body.text).toBe("Hello");
    expect(calls[0]!.url).toBe(`${SITE}/wiki/api/v2/pages/123?body-format=storage`);
    const auth = (calls[0]!.init.headers as Record<string, string>).authorization;
    expect(auth).toBe("Basic " + Buffer.from("qa@example.com:secret-token").toString("base64"));
  });

  it("fetches each linked page once and reports what it skipped", async () => {
    const { fetch, calls } = fakeConfluence({
      "1": { title: "A", version: 1, body: "<p>a</p>" },
      "2": { title: "B", version: 2, body: "<p>b</p>" },
      "3": { title: "Secret", version: 1, body: "", status: 403 },
    });
    const urls = [
      `${SITE}/wiki/spaces/QA/pages/1/A`,
      `${SITE}/wiki/pages/viewpage.action?pageId=1`,
      `${SITE}/wiki/x/${pageIdToTiny("2")}`,
      `${SITE}/wiki/spaces/QA/pages/3`,
      `${SITE}/wiki/spaces/QA/pages/404`,
      "https://elsewhere.example.com/doc",
      `${SITE}/wiki/spaces/QA/pages/5`,
    ];
    const { pages, skipped } = await client(fetch).pages(urls, { maxPages: 4 });
    expect(pages.map((p) => p.title)).toEqual(["A", "B"]);
    expect(skipped).toEqual([
      { url: urls[3], reason: "forbidden" },
      { url: urls[4], reason: "not-found" },
      { url: urls[5], reason: "other-site" },
      { url: urls[6], reason: "limit" },
    ]);
    expect(calls).toHaveLength(4);
  });

  it("refuses bad page ids and has no way to write", async () => {
    const { fetch, calls } = fakeConfluence({});
    const c = client(fetch);
    await expect(c.page("1/../../x")).rejects.toThrow(/Not a Confluence page id/);
    await expect(c.http.request("/api/v2/pages", { method: "POST", body: {} })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("stays under /wiki on the configured site", async () => {
    const { fetch } = fakeConfluence({});
    await expect(client(fetch).http.get("/../rest/api/3/myself")).rejects.toMatchObject({ code: "OFF_ORIGIN" });
  });
});
