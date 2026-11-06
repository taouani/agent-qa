/**
 * A unified diff of two texts, line by line (S3-1): what the person reviews
 * before Agent-QA changes a file it didn't write. Myers' algorithm, so the
 * diff is a shortest one; three lines of context, as `git diff` shows.
 */

export interface DiffStats {
  added: number;
  removed: number;
}

type Op = { kind: " " | "-" | "+"; line: string };

/** Marks a last line without a newline, so it differs from the same line with one, as in git. */
const NO_EOL = "\u0000no-eol";

/** Lines of a text; a last line without a newline is still a line, marked. */
function lines(text: string): string[] {
  if (text === "") return [];
  const parts = text.split("\n");
  if (parts[parts.length - 1] === "") parts.pop();
  else parts[parts.length - 1] += NO_EOL;
  return parts;
}

/** The edit script from a to b, shortest first (Myers 1986), with a cap on the work. */
function script(a: string[], b: string[]): Op[] {
  // The common start and end need no search.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head: Op[] = a.slice(0, start).map((line) => ({ kind: " ", line }));
  const tail: Op[] = a.slice(endA).map((line) => ({ kind: " ", line }));
  const x = a.slice(start, endA);
  const y = b.slice(start, endB);
  const n = x.length;
  const m = y.length;
  const max = n + m;
  // Beyond this many differences, a plain "all removed, all added" is shown: the review still sees everything.
  const limit = Math.min(max, 4_000);
  const v = new Map<number, number>([[1, 0]]);
  const trace: Array<Map<number, number>> = [];
  let found = -1;
  for (let d = 0; d <= limit && found < 0; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1));
      let i = down ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let j = i - k;
      while (i < n && j < m && x[i] === y[j]) {
        i++;
        j++;
      }
      v.set(k, i);
      if (i >= n && j >= m) {
        found = d;
        break;
      }
    }
  }
  let middle: Op[];
  if (found < 0) {
    middle = [...x.map((line) => ({ kind: "-" as const, line })), ...y.map((line) => ({ kind: "+" as const, line }))];
  } else {
    middle = [];
    let i = n;
    let j = m;
    for (let d = found; d > 0; d--) {
      const prev = trace[d]!;
      const k = i - j;
      const down = k === -d || (k !== d && (prev.get(k - 1) ?? -1) < (prev.get(k + 1) ?? -1));
      const pk = down ? k + 1 : k - 1;
      const pi = prev.get(pk) ?? 0;
      const pj = pi - pk;
      while (i > pi + (down ? 0 : 1) && j > pj + (down ? 1 : 0)) {
        middle.push({ kind: " ", line: x[--i]! });
        j--;
      }
      if (down) middle.push({ kind: "+", line: y[--j]! });
      else middle.push({ kind: "-", line: x[--i]! });
    }
    while (i > 0 && j > 0) {
      middle.push({ kind: " ", line: x[--i]! });
      j--;
    }
    middle.reverse();
  }
  return [...head, ...middle, ...tail];
}

/**
 * The unified diff of `before` and `after` for one file, with `---`/`+++`
 * headers and @@ hunks, or "" when they are the same. A changed last newline
 * shows as git shows it ("\ No newline at end of file").
 */
export function unifiedDiff(path: string, before: string, after: string, context = 3): string {
  if (before === after) return "";
  const a = lines(before);
  const b = lines(after);
  const ops = script(a, b);
  const out = [`--- a/${path}`, `+++ b/${path}`];
  // Each op's line number in a and in b.
  const at: Array<{ ai: number; bi: number }> = [];
  let ai = 0;
  let bi = 0;
  for (const o of ops) {
    at.push({ ai, bi });
    if (o.kind !== "+") ai++;
    if (o.kind !== "-") bi++;
  }
  const changed = ops.map((o, i) => (o.kind === " " ? -1 : i)).filter((i) => i >= 0);
  let h = 0;
  while (h < changed.length) {
    const from = Math.max(0, changed[h]! - context);
    let to = changed[h]!;
    while (h < changed.length && changed[h]! <= to + 2 * context) to = changed[h++]!;
    const end = Math.min(ops.length - 1, to + context);
    const slice = ops.slice(from, end + 1);
    const aCount = slice.filter((o) => o.kind !== "+").length;
    const bCount = slice.filter((o) => o.kind !== "-").length;
    const aStart = aCount ? at[from]!.ai + 1 : at[from]!.ai;
    const bStart = bCount ? at[from]!.bi + 1 : at[from]!.bi;
    out.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`);
    for (let i = from; i <= end; i++) {
      const o = ops[i]!;
      const bare = o.line.endsWith(NO_EOL) ? o.line.slice(0, -NO_EOL.length) : o.line;
      out.push(`${o.kind}${bare}`);
      if (bare !== o.line) out.push("\\ No newline at end of file");
    }
  }
  return `${out.join("\n")}\n`;
}

/** Lines added and removed between two texts. */
export function diffStats(before: string, after: string): DiffStats {
  const ops = script(lines(before), lines(after));
  return { added: ops.filter((o) => o.kind === "+").length, removed: ops.filter((o) => o.kind === "-").length };
}
