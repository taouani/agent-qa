/**
 * Atlassian Document Format (Jira Cloud rich text) to plain text with light
 * Markdown: headings, lists, tables, code and quotes keep their shape so a
 * model can read them. Bold, italic and colour are dropped: they rarely carry
 * meaning a test case needs. Mentions are returned separately as well: they are
 * people's names, and the masking layer treats them as known names.
 */

export interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export interface AdfText {
  text: string;
  /** Display names from mention nodes, without the leading "@". */
  mentions: string[];
  /** URLs from links and smart cards, e.g. Confluence pages. */
  links: string[];
}

const isNode = (v: unknown): v is AdfNode => !!v && typeof v === "object" && typeof (v as AdfNode).type === "string";

export function adfToText(doc: unknown): AdfText {
  const mentions: string[] = [];
  const links: string[] = [];
  if (typeof doc === "string") return { text: doc, mentions, links };
  if (!isNode(doc)) return { text: "", mentions, links };

  const str = (v: unknown) => (typeof v === "string" ? v : "");

  const inline = (nodes: AdfNode[] | undefined): string =>
    (nodes ?? [])
      .filter(isNode)
      .map((n) => {
        switch (n.type) {
          case "text": {
            let t = n.text ?? "";
            for (const mark of n.marks ?? []) {
              if (mark.type === "link") {
                const href = str(mark.attrs?.href);
                if (href) {
                  links.push(href);
                  if (href !== t) t = `${t} (${href})`;
                }
              } else if (mark.type === "code") t = `\`${t}\``;
            }
            return t;
          }
          case "hardBreak":
            return "\n";
          case "mention": {
            const name = str(n.attrs?.text).replace(/^@/, "");
            if (name) mentions.push(name);
            return name ? `@${name}` : "@someone";
          }
          case "emoji":
            return str(n.attrs?.text) || str(n.attrs?.shortName);
          case "inlineCard":
          case "blockCard":
          case "embedCard": {
            const url = str(n.attrs?.url);
            if (url) links.push(url);
            return url;
          }
          case "status":
            return `[${str(n.attrs?.text)}]`;
          case "date": {
            const ts = Number(n.attrs?.timestamp);
            return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : "";
          }
          case "placeholder":
            return "";
          default:
            return inline(n.content);
        }
      })
      .join("");

  const block = (n: AdfNode, indent = ""): string => {
    switch (n.type) {
      case "doc":
        return blocks(n.content, indent);
      case "paragraph":
        return indent + inline(n.content).replace(/\n/g, `\n${indent}`);
      case "heading": {
        const level = Math.min(6, Math.max(1, Number(n.attrs?.level) || 1));
        return `${"#".repeat(level)} ${inline(n.content)}`;
      }
      case "bulletList":
      case "orderedList": {
        const start = Number(n.attrs?.order) || 1;
        return (n.content ?? [])
          .filter(isNode)
          .map((item, i) => {
            const marker = n.type === "bulletList" ? "- " : `${start + i}. `;
            const inner = (item.content ?? []).filter(isNode);
            const [first, ...rest] = inner;
            const head = first ? block(first).trimStart() : "";
            const tail = rest.map((r) => block(r, indent + "  ")).filter(Boolean);
            return [indent + marker + head, ...tail].join("\n");
          })
          .join("\n");
      }
      case "taskList":
        return (n.content ?? [])
          .filter(isNode)
          .map((item) => `${indent}- [${item.attrs?.state === "DONE" ? "x" : " "}] ${inline(item.content)}`)
          .join("\n");
      case "decisionList":
        return (n.content ?? []).filter(isNode).map((item) => `${indent}- Decision: ${inline(item.content)}`).join("\n");
      case "codeBlock":
        return "```" + str(n.attrs?.language) + "\n" + inline(n.content) + "\n```";
      case "blockquote":
        return blocks(n.content)
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n");
      case "panel":
      case "expand":
      case "nestedExpand":
      case "layoutSection":
      case "layoutColumn":
      case "bodiedExtension": {
        const title = str(n.attrs?.title);
        const body = blocks(n.content, indent);
        return title ? `${title}\n${body}` : body;
      }
      case "rule":
        return "---";
      case "table": {
        const rows = (n.content ?? []).filter(isNode).map((row) =>
          (row.content ?? [])
            .filter(isNode)
            .map((cell) => blocks(cell.content).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim()),
        );
        if (rows.length === 0) return "";
        const width = Math.max(...rows.map((r) => r.length));
        const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
        return [line(rows[0]!), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n");
      }
      case "mediaSingle":
      case "mediaGroup":
      case "media":
        return "[attachment]";
      case "extension":
        return "";
      default:
        // Unknown block: keep any text it holds.
        return n.content ? blocks(n.content, indent) : inline([n]);
    }
  };

  const blocks = (nodes: AdfNode[] | undefined, indent = ""): string =>
    (nodes ?? [])
      .filter(isNode)
      .map((n) => block(n, indent))
      .filter((s) => s !== "")
      .join("\n\n");

  const text = block(doc).replace(/\n{3,}/g, "\n\n").trim();
  return { text, mentions: [...new Set(mentions)], links: [...new Set(links)] };
}
