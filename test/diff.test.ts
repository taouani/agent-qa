import { describe, expect, it } from "vitest";
import { diffStats, unifiedDiff } from "../src/core/index.js";

/** Lines with a last line without a newline marked by a trailing NUL. */
const marked = (text: string) => (text === "" ? [] : text.split(/(?<=\n)/).map((l) => (l.endsWith("\n") ? l.slice(0, -1) : `${l}\0`)));

/** Applies a unified diff to `before`, strictly: every context and removed line must match. */
function apply(before: string, diff: string): string {
  if (diff === "") return before;
  const src = marked(before);
  const rows = diff.split("\n").slice(2, -1);
  const ops: string[] = [];
  for (const r of rows) {
    if (r === "\\ No newline at end of file") ops[ops.length - 1] += "\0";
    else ops.push(r);
  }
  const out: string[] = [];
  let at = 0;
  for (const o of ops) {
    const h = /^@@ -(\d+),(\d+) \+\d+,\d+ @@$/.exec(o);
    if (h) {
      const start = Number(h[2]) === 0 ? Number(h[1]) : Number(h[1]) - 1;
      while (at < start) out.push(src[at++]!);
      continue;
    }
    const text = o.slice(1);
    if (o[0] !== "+") expect(src[at++]).toBe(text);
    if (o[0] !== "-") out.push(text);
  }
  while (at < src.length) out.push(src[at++]!);
  return out.map((l) => (l.endsWith("\0") ? l.slice(0, -1) : `${l}\n`)).join("");
}

describe("unifiedDiff", () => {
  it("shows a change with three lines of context, as git does", () => {
    const before = "a\nb\nc\nd\ne\nf\ng\nh\n";
    const after = "a\nb\nc\nd\nE\nf\ng\nh\n";
    expect(unifiedDiff("tests/x.ts", before, after)).toBe(["--- a/tests/x.ts", "+++ b/tests/x.ts", "@@ -2,7 +2,7 @@", " b", " c", " d", "-e", "+E", " f", " g", " h", ""].join("\n"));
    expect(unifiedDiff("x", before, before)).toBe("");
    expect(diffStats(before, after)).toEqual({ added: 1, removed: 1 });
  });

  it("splits far changes into hunks, and shows a changed last newline", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n") + "\n";
    const after = before.replace("l1\n", "L1\n").replace("l18\n", "L18\n");
    expect(unifiedDiff("x", before, after).match(/^@@/gm)).toHaveLength(2);
    expect(unifiedDiff("x", "a\nb", "a\nb\n")).toBe(["--- a/x", "+++ b/x", "@@ -1,2 +1,2 @@", " a", "-b", "\\ No newline at end of file", "+b", ""].join("\n"));
    expect(unifiedDiff("x", "", "a\n")).toBe(["--- a/x", "+++ b/x", "@@ -0,0 +1,1 @@", "+a", ""].join("\n"));
  });

  it("gives back the new text when applied, for random edits", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let round = 0; round < 300; round++) {
      const words = ["a", "b", "c", "d", "  await page.click()", ""];
      const make = () => Array.from({ length: rand(25) }, () => words[rand(words.length)]!).join("\n") + (rand(3) ? "\n" : "");
      const before = make();
      const after = rand(2) ? make() : before.split("\n").map((l) => (rand(5) ? l : `${l}!`)).join("\n");
      const diff = unifiedDiff("f", before, after);
      expect(apply(before, diff)).toBe(after);
    }
  });

  it("keeps changes 6 lines apart in one hunk, and stays small for a whole rewrite", () => {
    const before = Array.from({ length: 12 }, (_, i) => `l${i}`).join("\n") + "\n";
    expect(unifiedDiff("x", before, before.replace("l1\n", "L1\n").replace("l8\n", "L8\n")).match(/^@@/gm)).toHaveLength(1);
    const big = (p: string) => Array.from({ length: 8000 }, (_, i) => `${p}${i}`).join("\n") + "\n";
    const diff = unifiedDiff("x", big("a"), big("b"));
    expect(apply(big("a"), diff)).toBe(big("b"));
    expect(diffStats(big("a"), big("b"))).toEqual({ added: 8000, removed: 8000 });
  });
});
