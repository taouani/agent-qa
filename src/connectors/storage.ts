import { adfToText, type AdfNode } from "./adf.js";

/**
 * Confluence storage format (XHTML with `ac:` and `ri:` elements) to plain
 * text with light Markdown. The markup is parsed into a small tree, mapped to
 * ADF nodes, and rendered by `adfToText`, so Jira and Confluence text look the
 * same to a model.
 */

export interface StorageText {
  text: string;
  /** Atlassian account ids from user mentions. The body carries no names. */
  accountIds: string[];
  /** URLs from links. */
  links: string[];
  /** Titles of other pages the body links to. */
  pageTitles: string[];
}

interface El {
  name: string;
  attrs: Record<string, string>;
  children: Node[];
}
type Node = El | string;

const VOID = new Set(["br", "hr", "img", "col", "wbr", "input", "meta", "link", "area", "source"]);

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", bull: "•", middot: "·",
  copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", deg: "°", times: "×", rarr: "→", larr: "←",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[ent.toLowerCase()] ?? m;
  });
}

const TOKEN =
  /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<![^>]*>|<\?[\s\S]*?\?>|<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|(<)/g;
const ATTR = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

/** A forgiving parser: unknown tags are kept, stray closing tags are ignored. */
export function parseStorage(xml: string): El {
  const root: El = { name: "#root", attrs: {}, children: [] };
  const stack: El[] = [root];
  const top = () => stack[stack.length - 1]!;
  for (const m of xml.matchAll(TOKEN)) {
    const [, cdata, closing, rawName, rawAttrs, selfClosing, text, lt] = m;
    if (cdata !== undefined) top().children.push(cdata);
    else if (text !== undefined) top().children.push(decodeEntities(text));
    else if (lt !== undefined) top().children.push("<");
    else if (rawName !== undefined) {
      const name = rawName.toLowerCase();
      if (closing) {
        const at = stack.map((e) => e.name).lastIndexOf(name);
        if (at > 0) stack.length = at;
        continue;
      }
      const attrs: Record<string, string> = {};
      for (const a of (rawAttrs ?? "").matchAll(ATTR)) attrs[a[1]!.toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
      const el: El = { name, attrs, children: [] };
      top().children.push(el);
      if (!selfClosing && !VOID.has(name)) stack.push(el);
    }
  }
  return root;
}

const isEl = (n: Node): n is El => typeof n !== "string";
const child = (el: El, name: string) => el.children.find((c): c is El => isEl(c) && c.name === name);
const textContent = (n: Node): string => (isEl(n) ? n.children.map(textContent).join("") : n);
const param = (el: El, name: string) => {
  const p = el.children.find((c): c is El => isEl(c) && c.name === "ac:parameter" && c.attrs["ac:name"] === name);
  return p ? textContent(p).trim() : "";
};

const BLOCK = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "tbody", "thead", "tfoot", "tr", "td", "th",
  "blockquote", "pre", "hr", "ac:structured-macro", "ac:macro", "ac:task-list", "ac:layout", "ac:layout-section",
  "ac:layout-cell", "ac:rich-text-body", "ac:image", "section", "article", "header", "footer", "dl", "dt", "dd", "figure",
]);
const DROP_MACROS = new Set(["toc", "children", "pagetree", "recently-updated", "contentbylabel", "livesearch", "anchor", "excerpt-include", "include", "attachments", "gallery", "profile-picture"]);
const PANEL_MACROS = new Set(["info", "note", "warning", "tip", "panel", "expand", "section", "column", "details", "excerpt", "ui-expand"]);

export function storageToText(xml: string | undefined | null): StorageText {
  const accountIds: string[] = [];
  const links: string[] = [];
  const pageTitles: string[] = [];
  if (!xml) return { text: "", accountIds, links, pageTitles };

  const marked = (n: AdfNode, mark: { type: string; attrs?: Record<string, unknown> }): AdfNode =>
    n.type === "text" ? { ...n, marks: [...(n.marks ?? []), mark] } : { ...n, content: (n.content ?? []).map((c) => marked(c, mark)) };

  const inline = (n: Node, pre = false): AdfNode[] => {
    if (!isEl(n)) {
      const t = pre ? n : n.replace(/\s+/g, " ");
      return t ? [{ type: "text", text: t }] : [];
    }
    const kids = () => n.children.flatMap((c) => inline(c, pre));
    switch (n.name) {
      case "br":
        return [{ type: "hardBreak" }];
      case "a": {
        const href = n.attrs.href ?? "";
        const content = kids();
        if (!/^(https?:|mailto:)/i.test(href)) return content;
        if (content.length === 0) return [{ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }];
        return content.map((c) => marked(c, { type: "link", attrs: { href } }));
      }
      case "code":
        return kids().map((c) => marked(c, { type: "code" }));
      case "time":
        return n.attrs.datetime ? [{ type: "text", text: n.attrs.datetime }] : [];
      case "ac:emoticon":
        return n.attrs["ac:emoji-fallback"] ? [{ type: "text", text: n.attrs["ac:emoji-fallback"] }] : [];
      case "ac:placeholder":
      case "ac:parameter":
        return [];
      case "ac:link": {
        const user = child(n, "ri:user");
        if (user) {
          const id = user.attrs["ri:account-id"] ?? user.attrs["ri:userkey"];
          if (id) accountIds.push(id);
          return [{ type: "text", text: "@user" }];
        }
        const body = child(n, "ac:link-body") ?? child(n, "ac:plain-text-link-body");
        const pageRef = child(n, "ri:page") ?? child(n, "ri:blog-post");
        const title = pageRef?.attrs["ri:content-title"];
        if (title) pageTitles.push(title);
        const urlRef = child(n, "ri:url");
        if (urlRef?.attrs["ri:value"]) links.push(urlRef.attrs["ri:value"]);
        const label = body ? textContent(body).replace(/\s+/g, " ").trim() : "";
        const fallback = title ?? child(n, "ri:attachment")?.attrs["ri:filename"] ?? urlRef?.attrs["ri:value"] ?? "";
        const shown = label || fallback;
        return shown ? [{ type: "text", text: shown }] : [];
      }
      case "ri:user":
        return [];
      default:
        if (BLOCK.has(n.name)) return [{ type: "text", text: " " }, ...inline({ ...n, name: "span" }, pre), { type: "text", text: " " }];
        return kids();
    }
  };

  const paragraph = (nodes: AdfNode[]): AdfNode[] => {
    // Trim the run's edges, and drop it if only whitespace is left.
    const content = [...nodes];
    while (content[0]?.type === "text" && !content[0].text?.trim()) content.shift();
    while (content.at(-1)?.type === "text" && !content.at(-1)!.text?.trim()) content.pop();
    if (content.length === 0) return [];
    const first = content[0]!;
    if (first.type === "text") content[0] = { ...first, text: first.text!.trimStart() };
    const last = content.at(-1)!;
    if (last.type === "text") content[content.length - 1] = { ...last, text: last.text!.trimEnd() };
    return [{ type: "paragraph", content }];
  };

  /** Children to block nodes, wrapping runs of inline content in paragraphs. */
  const blocks = (children: Node[]): AdfNode[] => {
    const out: AdfNode[] = [];
    let run: AdfNode[] = [];
    const flush = () => {
      out.push(...paragraph(run));
      run = [];
    };
    for (const c of children) {
      if (isEl(c) && BLOCK.has(c.name)) {
        flush();
        out.push(...block(c));
      } else run.push(...inline(c));
    }
    flush();
    return out;
  };

  const listItems = (el: El): AdfNode[] =>
    el.children.filter(isEl).filter((c) => c.name === "li").map((li) => ({ type: "listItem", content: blocks(li.children) }));

  const block = (el: El): AdfNode[] => {
    switch (el.name) {
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
        return [{ type: "heading", attrs: { level: Number(el.name[1]) }, content: paragraph(el.children.flatMap((c) => inline(c)))[0]?.content ?? [] }];
      case "p":
        return paragraph(el.children.flatMap((c) => inline(c)));
      case "ul":
        return [{ type: "bulletList", content: listItems(el) }];
      case "ol":
        return [{ type: "orderedList", attrs: { order: Number(el.attrs.start) || 1 }, content: listItems(el) }];
      case "li":
        return [{ type: "bulletList", content: [{ type: "listItem", content: blocks(el.children) }] }];
      case "blockquote":
        return [{ type: "blockquote", content: blocks(el.children) }];
      case "pre":
        return [{ type: "codeBlock", content: [{ type: "text", text: textContent(el).replace(/\n$/, "") }] }];
      case "hr":
        return [{ type: "rule" }];
      case "table": case "tbody": case "thead": case "tfoot": {
        const rows: El[] = [];
        const collect = (e: El) => e.children.filter(isEl).forEach((c) => (c.name === "tr" ? rows.push(c) : ["tbody", "thead", "tfoot"].includes(c.name) && collect(c)));
        collect(el);
        return [{
          type: "table",
          content: rows.map((tr) => ({
            type: "tableRow",
            content: tr.children.filter(isEl).filter((c) => c.name === "td" || c.name === "th").map((cell) => ({ type: "tableCell", content: blocks(cell.children) })),
          })),
        }];
      }
      case "ac:task-list":
        return [{
          type: "taskList",
          content: el.children.filter(isEl).filter((c) => c.name === "ac:task").map((task) => ({
            type: "taskItem",
            attrs: { state: textContent(child(task, "ac:task-status") ?? "").trim() === "complete" ? "DONE" : "TODO" },
            content: child(task, "ac:task-body")?.children.flatMap((c) => inline(c)) ?? [],
          })),
        }];
      case "ac:image":
        return [{ type: "media" }];
      case "ac:structured-macro":
      case "ac:macro": {
        const name = (el.attrs["ac:name"] ?? "").toLowerCase();
        if (DROP_MACROS.has(name)) return [];
        if (name === "code" || name === "noformat") {
          const body = child(el, "ac:plain-text-body");
          return [{ type: "codeBlock", attrs: { language: param(el, "language") }, content: [{ type: "text", text: body ? textContent(body) : "" }] }];
        }
        if (name === "jira") {
          const key = param(el, "key");
          return key ? [{ type: "paragraph", content: [{ type: "text", text: key }] }] : [];
        }
        if (name === "status") {
          const title = param(el, "title");
          return title ? [{ type: "paragraph", content: [{ type: "status", attrs: { text: title } }] }] : [];
        }
        const body = child(el, "ac:rich-text-body") ?? child(el, "ac:plain-text-body");
        if (!body) return [];
        const content = body.name === "ac:plain-text-body" ? [{ type: "paragraph", content: [{ type: "text", text: textContent(body) }] }] : blocks(body.children);
        const title = param(el, "title");
        return PANEL_MACROS.has(name) ? [{ type: "panel", attrs: title ? { title } : {}, content }] : content;
      }
      default:
        return blocks(el.children);
    }
  };

  const doc: AdfNode = { type: "doc", content: blocks(parseStorage(xml).children) };
  const rendered = adfToText(doc);
  return {
    text: rendered.text,
    accountIds: [...new Set(accountIds)],
    links: [...new Set([...rendered.links, ...links])],
    pageTitles: [...new Set(pageTitles)],
  };
}
