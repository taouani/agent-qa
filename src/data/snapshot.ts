/**
 * Masks a Playwright accessibility snapshot (S2-4) before a model sees it.
 * Roles, attributes, labels and headings stay, so the model can name elements
 * the way generated code will. Personal data goes:
 *
 * - typed and picked values (textbox, searchbox, spinbutton, combobox, slider) always become tokens;
 * - everything inside a table row or cell (record values: names, amounts,
 *   ids) becomes tokens, except header rows;
 * - link targets keep their path only;
 * - all other text goes through the detectors (emails, phones, names…).
 *
 * - on a record page, the level-1 heading (the record's name) becomes a token.
 *
 * Values the run already knows (one the explorer typed, echoed in a toast)
 * are put back as their tokens before the detectors run (data/explorer.ts).
 *
 * Accepted risk: verify with text, and match counts, let a model test a guess
 * about a masked value. Only a model set on it would, one guess per action.
 *
 * Known gap: field values on a record page that sit outside a table or an
 * input are only as safe as the detectors. The harness's stand-in app (S2-10)
 * measures what reaches a model.
 */

export interface SnapshotMasker {
  /** Free text through the detectors. */
  detect(text: string): string;
  /** A whole value as a token (the same value, the same token). */
  token(value: string): string;
}

export const MAX_SNAPSHOT_CHARS = 40_000;
/** Roles whose `: value` is what was typed or picked: a lookup or picklist (combobox) included. */
const FIELD_ROLES = new Set(["textbox", "searchbox", "spinbutton", "combobox", "slider"]);
const RECORD_ROLES = new Set(["cell", "gridcell", "rowheader"]);
const KEY = /^(\/?[A-Za-z][\w-]*)(?:\s+"((?:[^"\\]|\\.)*)")?((?:\s*\[[^\]]*\])*)\s*$/;

interface Entry {
  indent: number;
  role: string;
  name?: string;
  attrs: string;
  value?: string;
  children: boolean;
  /** The line couldn't be read: masked as free text. */
  raw?: string;
}

/** Splits `key: value` at the first colon outside double quotes. */
function splitKey(entry: string): { key: string; rest: string } {
  if (entry.startsWith("'")) {
    let i = 1;
    while (i < entry.length) {
      if (entry[i] === "'") {
        if (entry[i + 1] === "'") {
          i += 2;
          continue;
        }
        break;
      }
      i++;
    }
    return { key: entry.slice(1, i).replace(/''/g, "'"), rest: entry.slice(i + 1) };
  }
  let quoted = false;
  for (let i = 0; i < entry.length; i++) {
    const c = entry[i];
    if (c === "\\" && quoted) i++;
    else if (c === '"') quoted = !quoted;
    else if (c === ":" && !quoted && (i + 1 === entry.length || entry[i + 1] === " ")) return { key: entry.slice(0, i), rest: entry.slice(i) };
  }
  return { key: entry, rest: "" };
}

function unquote(value: string): string {
  const v = value.trim();
  try {
    if (v.startsWith('"') && v.endsWith('"')) return JSON.parse(v) as string;
  } catch {
    // Not JSON after all: kept as written.
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

function parseLine(line: string): Entry | undefined {
  const m = /^(\s*)- (.*)$/.exec(line);
  if (!m) return line.trim() ? { indent: line.length - line.trimStart().length, role: "", attrs: "", children: false, raw: line.trim() } : undefined;
  const indent = m[1]!.length;
  const { key, rest } = splitKey(m[2]!);
  const k = KEY.exec(key);
  if (!k) return { indent, role: "", attrs: "", children: false, raw: m[2]! };
  let name: string | undefined;
  if (k[2] !== undefined) {
    try {
      name = JSON.parse(`"${k[2]}"`) as string;
    } catch {
      name = k[2];
    }
  }
  const value = rest.startsWith(": ") ? unquote(rest.slice(2)) : undefined;
  return { indent, role: k[1]!, ...(name !== undefined ? { name } : {}), attrs: k[3]!.trim(), ...(value !== undefined ? { value } : {}), children: rest.trim() === ":" };
}

/** A URL's path, without the query or fragment (they can carry search terms and ids), decoded so detectors see the text. */
export function pathOnly(url: string): string {
  const cut = url.search(/[?#]/);
  const path = cut === -1 ? url : url.slice(0, cut);
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** A name or value as YAML would read it: quoted when it could be read as YAML syntax. */
const scalar = (v: string) => (/^[\s\-\[\]{}'"!&*#|>%@`?,]|: |\s$|^$/.test(v) || v.includes(": ") ? JSON.stringify(v) : v);

/**
 * A page title: Lightning titles a record page "{record} | {object} | Salesforce",
 * so every part but the last (the app's name) is a whole value.
 */
export function maskTitle(title: string, masker: SnapshotMasker): string {
  const parts = title.split(" | ");
  if (parts.length < 2) return masker.detect(title);
  return [...parts.slice(0, -1).map((p) => wholeValue(p, masker)), masker.detect(parts.at(-1)!)].join(" | ");
}

const TOKEN_ONLY = /^<[A-Z][A-Z0-9_]*_\d+>$/;

/** A whole value as one token: a detector's token when it is all the value is (an email in a cell), else a VALUE token. */
function wholeValue(v: string, masker: SnapshotMasker): string {
  if (!v.trim()) return v;
  const detected = masker.detect(v.trim());
  return TOKEN_ONLY.test(detected) ? detected : masker.token(v.trim());
}

export interface MaskSnapshotOptions {
  /** A record page (Lightning /lightning/r/…): its level-1 heading is the record's name. */
  recordPage?: boolean;
}

export function maskAriaSnapshot(aria: string, masker: SnapshotMasker, options: MaskSnapshotOptions = {}): { text: string; truncated: boolean } {
  const entries = aria.split(/\r?\n/).map(parseLine);
  // Rows whose cells are column headers hold labels, not records.
  const headerRow = new Set<number>();
  entries.forEach((e, i) => {
    if (e?.role !== "row") return;
    for (let j = i + 1; j < entries.length; j++) {
      const child = entries[j];
      if (!child) continue;
      if (child.indent <= e.indent) break;
      if (child.indent === e.indent + 2 && child.role === "columnheader") headerRow.add(i);
    }
  });
  const value = (v: string) => wholeValue(v, masker);
  const out: string[] = [];
  const stack: Array<{ indent: number; record: boolean }> = [];
  let size = 0;
  let truncated = false;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e) continue;
    while (stack.length && stack[stack.length - 1]!.indent >= e.indent) stack.pop();
    const inRecord = stack.some((s) => s.record);
    const isRecord = RECORD_ROLES.has(e.role) || (e.role === "row" && !headerRow.has(i)) || (options.recordPage === true && e.role === "heading" && /\[level=1\]/.test(e.attrs));
    const pad = " ".repeat(e.indent);
    let line: string;
    if (e.raw !== undefined) {
      line = `${pad}- ${inRecord ? value(e.raw) : masker.detect(e.raw)}`;
    } else {
      const name = e.name === undefined ? undefined : inRecord || isRecord ? value(e.name) : masker.detect(e.name);
      let v = e.value;
      if (v !== undefined) {
        if (e.role === "/url") v = masker.detect(pathOnly(v));
        else if (FIELD_ROLES.has(e.role) || inRecord || isRecord) v = value(v);
        else v = masker.detect(v);
      }
      const key = `${e.role}${name !== undefined ? ` ${JSON.stringify(name)}` : ""}${e.attrs ? ` ${e.attrs}` : ""}`;
      line = `${pad}- ${key}${v !== undefined ? `: ${scalar(v)}` : e.children ? ":" : ""}`;
    }
    if (e.raw === undefined) stack.push({ indent: e.indent, record: isRecord });
    if (size + line.length + 1 > MAX_SNAPSHOT_CHARS) {
      truncated = true;
      break;
    }
    out.push(line);
    size += line.length + 1;
  }
  if (truncated) out.push(`- (snapshot cut at ${MAX_SNAPSHOT_CHARS} characters)`);
  return { text: out.join("\n"), truncated };
}
