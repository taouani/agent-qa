/**
 * A unified diff of two texts, for hosts whose API gives changed files but no
 * patch (Azure DevOps). Lines are compared with Myers' algorithm; hunks carry
 * three lines of context, as `git diff` does. Undefined when either side looks
 * binary (a NUL byte) or the texts are too large to compare cheaply.
 */

const CONTEXT = 3;
/** Lines on both sides together above which no patch is made (Myers is O((N+M)·D)). */
const MAX_LINES = 20_000;
/** Edits above which the comparison stops: such a patch would be cut by the byte cap anyway. */
const MAX_EDITS = 4_000;

type Op = { kind: " " | "-" | "+"; line: string };

function lines(text: string): string[] {
  if (text === "") return [];
  const parts = text.split("\n");
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/** The shortest edit script from a to b, or undefined past MAX_EDITS. */
function myers(a: string[], b: string[]): Op[] | undefined {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_EDITS);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break outer;
      }
    }
  }
  if (found < 0) return undefined;
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d]!;
    const k = x - y;
    const down = k === -d || (k !== d && prev[offset + k - 1]! < prev[offset + k + 1]!);
    const pk = down ? k + 1 : k - 1;
    const px = prev[offset + pk]!;
    const py = px - pk;
    while (x > px && y > py) {
      ops.push({ kind: " ", line: a[--x]! });
      y--;
    }
    if (down) ops.push({ kind: "+", line: b[--y]! });
    else ops.push({ kind: "-", line: a[--x]! });
  }
  while (x > 0 && y > 0) {
    ops.push({ kind: " ", line: a[--x]! });
    y--;
  }
  return ops.reverse();
}

export function unifiedDiff(before: string, after: string): string | undefined {
  if (before.includes("\0") || after.includes("\0")) return undefined;
  const a = lines(before);
  const b = lines(after);
  if (a.length + b.length > MAX_LINES) return undefined;
  const ops = myers(a, b);
  if (!ops) return undefined;
  const out: string[] = [];
  let i = 0;
  // Line numbers (from 1) in a and b at op i.
  const posA: number[] = [];
  const posB: number[] = [];
  let la = 1;
  let lb = 1;
  for (const op of ops) {
    posA.push(la);
    posB.push(lb);
    if (op.kind !== "+") la++;
    if (op.kind !== "-") lb++;
  }
  while (i < ops.length) {
    if (ops[i]!.kind === " ") {
      i++;
      continue;
    }
    // A hunk: from CONTEXT lines before this change to CONTEXT lines after the last change within reach.
    const start = Math.max(0, i - CONTEXT);
    let end = i;
    let last = i;
    while (end < ops.length) {
      if (ops[end]!.kind !== " ") last = end;
      else if (end - last > 2 * CONTEXT) break;
      end++;
    }
    end = Math.min(ops.length, last + CONTEXT + 1);
    const slice = ops.slice(start, end);
    const countA = slice.filter((o) => o.kind !== "+").length;
    const countB = slice.filter((o) => o.kind !== "-").length;
    const startA = countA === 0 ? posA[start]! - 1 : posA[start]!;
    const startB = countB === 0 ? posB[start]! - 1 : posB[start]!;
    out.push(`@@ -${startA},${countA} +${startB},${countB} @@`);
    for (const o of slice) out.push(`${o.kind}${o.line}`);
    i = end;
  }
  return out.join("\n");
}
