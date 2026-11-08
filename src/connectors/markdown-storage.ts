/**
 * Markdown to Confluence storage format (S4-5), for the markdown Agent-QA's
 * documents are rendered as: headings, paragraphs, bullet and numbered
 * lists, tables, block quotes, bold and inline code. Anything else is kept
 * as plain, escaped text, so nothing a model wrote becomes markup.
 */

// Control characters XML 1.0 doesn't allow are dropped: one would make the page body invalid.
const escape = (s: string) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline markdown: `code` (any fence length), **bold**, backslash escapes. Everything is escaped first. In a table cell, `\|` in code is a pipe, as in GFM. */
export function inline(text: string, inTable = false): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const fence = /^`+/.exec(text.slice(i));
    if (fence) {
      const close = text.indexOf(fence[0], i + fence[0].length);
      // A closing fence of the same length, not part of a longer one.
      if (close > 0 && text[close + fence[0].length] !== "`") {
        let code = text.slice(i + fence[0].length, close);
        if (code.startsWith(" ") && code.endsWith(" ") && code.trim() !== "") code = code.slice(1, -1);
        out += `<code>${escape(inTable ? code.replace(/\\\|/g, "|") : code)}</code>`;
        i = close + fence[0].length;
        continue;
      }
      out += escape(fence[0]);
      i += fence[0].length;
      continue;
    }
    if (text.startsWith("**", i)) {
      const close = text.indexOf("**", i + 2);
      if (close > i + 2) {
        out += `<strong>${inline(text.slice(i + 2, close), inTable)}</strong>`;
        i = close + 2;
        continue;
      }
    }
    if (text[i] === "\\" && i + 1 < text.length && /[\\`*|_#>-]/.test(text[i + 1]!)) {
      out += escape(text[i + 1]!);
      i += 2;
      continue;
    }
    out += escape(text[i]!);
    i++;
  }
  return out;
}

/** The cells of a table row, split on pipes that aren't escaped (as GFM does, in code too). */
function cells(row: string): string[] {
  const body = row.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c === "\\" && body[i + 1] === "|") {
      cur += "\\|";
      i++;
      continue;
    }
    if (c === "|") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isSeparator = (line: string) => /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(line);

export function markdownToStorage(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(heading[2]!.trim())}</h${level}>`);
      i++;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1]!)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i]!)) rows.push(cells(lines[i++]!));
      out.push(
        `<table><tbody><tr>${head.map((h) => `<th>${inline(h, true)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${head.map((_, j) => `<td>${inline(r[j] ?? "", true)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*]\s+/, ""));
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*\d+\.\s+/, ""));
      out.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ol>`);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) quoted.push(lines[i++]!.replace(/^\s*>\s?/, ""));
      out.push(`<blockquote><p>${inline(quoted.join(" ").trim())}</p></blockquote>`);
      continue;
    }
    // A paragraph: lines up to a blank line or another block.
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !/^(#{1,6}\s|\s*[-*]\s+|\s*\d+\.\s+|\s*>)/.test(lines[i]!) && !(isTableRow(lines[i]!) && isSeparator(lines[i + 1] ?? ""))) para.push(lines[i++]!.trim());
    if (para.length === 0) para.push(lines[i++]!.trim());
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("");
}
