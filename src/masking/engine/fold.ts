/**
 * Folding for matching: NFKD, no combining marks or invisible format
 * characters, lowercase. `Zoë`, `ZOE` and `Zoë` all fold to `zoe`, and `４`
 * to `4`. `foldWithMap` also says where each folded character came from, so a
 * match in folded text can be replaced in the original.
 */

export function fold(text: string): string {
  // ß is "ss" (STRAUSS, Strauß); final sigma is sigma, so one character at a time folds the same as a word.
  return text.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").toLowerCase().replace(/ß/g, "ss").replace(/ς/g, "σ");
}

export interface Folded {
  text: string;
  /** For each UTF-16 index in `text`, the index in the original where its character starts. */
  starts: number[];
  /** For each UTF-16 index in `text`, the index in the original just after its character. */
  ends: number[];
}

export function foldWithMap(original: string): Folded {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let i = 0;
  for (const ch of original) {
    const end = i + ch.length;
    const f = fold(ch);
    for (let k = 0; k < f.length; k++) {
      starts.push(i);
      ends.push(end);
    }
    text += f;
    i = end;
  }
  return { text, starts, ends };
}

/** The span in the original text that a span of folded text came from. */
export function toOriginal(folded: Folded, start: number, end: number): [number, number] {
  return [folded.starts[start]!, folded.ends[end - 1]!];
}
