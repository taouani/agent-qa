import type { Span } from "./detectors.js";
import { fold } from "./fold.js";
import {
  AMBIGUOUS_GIVEN,
  ARABIC_AMBIGUOUS,
  ARABIC_GIVEN_NAMES,
  ARABIC_TITLES,
  CHINESE_CUES_BEFORE,
  CHINESE_NOT_NAMES,
  CHINESE_SURNAMES,
  CHINESE_STOP_AFTER,
  CHINESE_TITLES_AFTER,
  CHINESE_WEAK_SURNAMES,
  GIVEN_NAMES,
  NOT_SURNAMES,
  PARTICLES,
  TITLES,
} from "./name-data.js";
import { COMMON_WORDS } from "./names.js";

/**
 * Names that no people field mentions (S1-5), in EN, FR, ES, DE, PT, NL, IT,
 * AR and ZH, found by rules rather than a model:
 *
 * - Latin script: a title (Mme, Herr, Sr., Dhr., Sig.ra...) followed by
 *   capitalised words, or a common given name with the capitalised words and
 *   particles around it ("Jean-Luc de la Fontaine", "Quillfeather, Marguerite").
 * - Arabic script: a title (السيد...) or a common given name, with the name's
 *   following parts (بن, عبد, an ال family name).
 * - Chinese: a common surname plus one or two characters, when a title follows
 *   (先生, 经理), a cue precedes (联系人：), or the name stands alone between
 *   punctuation. Everyday words that start with a surname character are left.
 *
 * Like the other detectors it errs toward masking: a capitalised word next to
 * a given name is taken as a surname.
 */

export type NameLanguage = "en" | "fr" | "es" | "de" | "pt" | "nl" | "it" | "ar" | "zh";
export const NAME_LANGUAGES: NameLanguage[] = ["en", "fr", "es", "de", "pt", "nl", "it", "ar", "zh"];

interface Word {
  text: string;
  folded: string;
  start: number;
  end: number;
  capitalised: boolean;
  /** The word starts a sentence (after . ! ? or at the start of a line). */
  sentenceStart: boolean;
  /** Text between the previous word and this one. */
  gap: string;
}

const LATIN_WORD = /[\p{Script=Latin}][\p{Script=Latin}\p{M}'’-]*/gu;
const ARABIC_WORD = /[\p{Script=Arabic}]+/gu;
const HAN_RUN = /\p{Script=Han}+/gu;

const isTitleCase = (w: string) => /^\p{Lu}/u.test(w);

/** French and Italian elision before a name: l'Anne, d'Anne, dell'Orto. */
const ELISION = /^(?:[cdjlmnst]|qu|dell|all|nell|dall|sull)['’](?=\p{Lu})/iu;
/** A possessive after a name: Jennifer's, Jennifer’s. */
const POSSESSIVE = /['’]s$/iu;

function latinWords(text: string): Word[] {
  const words: Word[] = [];
  let last = 0;
  for (const m of text.matchAll(LATIN_WORD)) {
    const elision = ELISION.exec(m[0])?.[0].length ?? 0;
    const raw = m[0].slice(elision).replace(POSSESSIVE, "").replace(/['’-]+$/, "");
    if (raw === "") continue;
    const start = m.index + elision;
    const gap = text.slice(last, start);
    const prevGap = words.length === 0 ? text.slice(0, start) : gap;
    // Only the gap's last visible character matters; a regex anchored at the end backtracks on long blank runs.
    const visible = prevGap.trimEnd();
    const lastChar = visible.slice(-1);
    words.push({
      text: raw,
      folded: fold(raw),
      start,
      end: start + raw.length,
      capitalised: isTitleCase(raw),
      sentenceStart: words.length === 0 || lastChar === "" || ".!?:-*•".includes(lastChar) || prevGap.slice(visible.length).includes("\n"),
      gap,
    });
    last = start + raw.length;
  }
  return words;
}

const isAllCaps = (w: string) => w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase();

/** Only spaces (or a hyphen in a double name) between two parts of one name. */
const joins = (gap: string) => /^[ \t ]{1,2}$/.test(gap);
/** Titles that are also common abbreviations (Sr = Senior, HR, FR, Ing): a title only with a dot after. */
const DOT_TITLES = new Set(["sr", "hr", "fr", "m", "ra", "ssa", "ing", "sig", "dott", "avv"]);

/** Surnames by first character, longest first, so each position costs one lookup. */
const SURNAMES_BY_FIRST = new Map<string, string[]>();
for (const s of [...CHINESE_SURNAMES].sort((a, b) => b.length - a.length)) {
  const list = SURNAMES_BY_FIRST.get(s[0]!) ?? [];
  list.push(s);
  SURNAMES_BY_FIRST.set(s[0]!, list);
}

export class LanguageNameDetector {
  private readonly given: Set<string>;
  private readonly titles = new Set(TITLES);
  private readonly arabicGiven = new Set(ARABIC_GIVEN_NAMES);
  private readonly arabicTitles = new Set(ARABIC_TITLES);
  private readonly zh: boolean;
  private readonly ar: boolean;
  private readonly latin: boolean;

  constructor(languages: readonly NameLanguage[] = NAME_LANGUAGES) {
    this.given = new Set(languages.flatMap((l) => GIVEN_NAMES[l] ?? []).filter((n) => !COMMON_WORDS.has(n)));
    this.zh = languages.includes("zh");
    this.ar = languages.includes("ar");
    this.latin = languages.some((l) => l !== "zh" && l !== "ar");
  }

  find(text: string): Span[] {
    return [...(this.latin ? this.latinNames(text) : []), ...(this.ar ? this.arabicNames(text) : []), ...(this.zh ? this.chineseNames(text) : [])];
  }

  private span(text: string, start: number, end: number): Span {
    return { start, end, detector: "name", kind: "PERSON", value: text.slice(start, end).replace(/\s+/g, " ") };
  }

  /** A given name, or a double one such as Jean-Luc or Anna-Lena. */
  private isGiven(folded: string): boolean {
    return this.given.has(folded) || (folded.includes("-") && folded.split("-").some((p) => this.given.has(p)));
  }

  /** A word that can be part of a surname: capitalised, not an everyday word, not a title. */
  private surnameLike(w: Word | undefined): boolean {
    return !!w && w.capitalised && !COMMON_WORDS.has(w.folded) && !NOT_SURNAMES.has(w.folded) && !this.titles.has(w.folded);
  }

  /** A title word that really is a title here: "Mme", "Sr.", "dhr."; not "HR Portal", "Sr Developer", "miss". */
  private isTitle(w: Word, next: Word | undefined): boolean {
    if (!this.titles.has(w.folded) || !next) return false;
    const dotted = next.gap.startsWith(".");
    if (isAllCaps(w.text) && !isAllCaps(next.text)) return false;
    if (!w.capitalised && !dotted) return false;
    if (DOT_TITLES.has(w.folded) && !dotted) return false;
    return true;
  }

  private latinNames(text: string): Span[] {
    const words = latinWords(text);
    const spans: Span[] = [];
    const used = new Set<number>();
    const extendRight = (from: number) => {
      // Capitalised parts and particles ("de la", "van der"), ending on a capitalised part.
      let end = from;
      let j = from + 1;
      let parts = 0;
      const initial = (w: Word) => /^\p{Lu}$/u.test(w.text);
      const gapOk = (k: number) => {
        const gap = words[k]!.gap;
        return joins(gap) || /^\s*-\s*$/.test(gap) || (initial(words[k - 1]!) && /^\.[ \t]{1,2}$/.test(gap));
      };
      while (j < words.length && parts < 4 && gapOk(j)) {
        const w = words[j]!;
        if (this.surnameLike(w) || (w.capitalised && this.isGiven(w.folded))) {
          end = j;
          parts++;
        } else if (!PARTICLES.has(w.folded) && !/^\p{Lu}\.?$/u.test(w.text)) break;
        j++;
      }
      return end;
    };

    for (let i = 0; i < words.length; i++) {
      if (used.has(i)) continue;
      const w = words[i]!;
      // A title: "Mme Dupont", "Herr Dr. Müller", "Sr. García López".
      if (this.isTitle(w, words[i + 1])) {
        let k = i + 1;
        while (k < words.length && this.titles.has(words[k]!.folded)) k++;
        const next = words[k];
        if (next && (this.surnameLike(next) || /^\p{Lu}$/u.test(next.text) || (next.capitalised && PARTICLES.has(next.folded))) && /^[.\s]{1,3}$/.test(next.gap)) {
          const end = extendRight(k);
          for (let x = i; x <= end; x++) used.add(x);
          spans.push(this.span(text, next.start, words[end]!.end));
          continue;
        }
      }
      // A given name, with its surname after it ("Marguerite Quillfeather") or before it with a comma ("Quillfeather, Marguerite").
      if (w.capitalised && this.isGiven(w.folded)) {
        let start = i;
        const prev = words[i - 1];
        if (prev && !used.has(i - 1) && this.surnameLike(prev) && /^,\s{1,2}$/.test(w.gap) && !this.isGiven(prev.folded)) start = i - 1;
        else if (prev && !used.has(i - 1) && this.surnameLike(prev) && joins(w.gap) && (!prev.sentenceStart || (isAllCaps(prev.text) && !isAllCaps(w.text))))
          start = i - 1; // "Okafor Jennifer" mid-sentence, or "DUPONT Jean" anywhere
        const end = extendRight(i);
        if (start === i && end === i && AMBIGUOUS_GIVEN.has(w.folded)) continue; // "RAG status: Amber", "Jan Release"
        for (let x = start; x <= end; x++) used.add(x);
        spans.push(this.span(text, words[start]!.start, words[end]!.end));
      }
    }
    return spans;
  }

  private arabicNames(text: string): Span[] {
    const words = [...text.matchAll(ARABIC_WORD)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
    const spans: Span[] = [];
    // Strip a joined prefix (و and, ل ب to, ف so, ك as) stuck to a name: "ومحمد", "لمحمد".
    const prefixLength = (w: string) => (w.length > 3 && "ولبفك".includes(w[0]!) && this.arabicGiven.has(w.slice(1)) ? 1 : 0);
    const bare = (w: string) => w.slice(prefixLength(w));
    const connector = (w: string) => ["بن", "بنت", "ابن", "أبو", "ابو", "عبد", "آل"].includes(w);
    const near = (a: { end: number }, b: { start: number }) => /^\s{1,2}$/.test(text.slice(a.end, b.start));
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      const isTitle = this.arabicTitles.has(w.text);
      if (!isTitle && !this.arabicGiven.has(bare(w.text))) continue;
      let first = isTitle ? i + 1 : i;
      if (first >= words.length || (isTitle && !near(w, words[first]!))) continue;
      let end = first;
      let strong = isTitle || !ARABIC_AMBIGUOUS.has(bare(w.text));
      // Following parts: more given names, connectors and the name after them, or one ال family name.
      for (let j = first + 1; j < words.length && j <= first + 4 && near(words[j - 1]!, words[j]!); j++) {
        const t = words[j]!.text;
        if (this.arabicGiven.has(t) || connector(t) || connector(words[j - 1]!.text)) {
          end = j;
          strong = true;
        } else if (t.startsWith("ال") && t.length > 3) {
          end = j;
          break;
        } else break;
      }
      if (isTitle && end === first && first + 1 < words.length && near(words[first]!, words[first + 1]!)) end = first + 1; // title + two-word name
      if (!strong) continue; // "رقم الهاتف غير صالح": صالح is "valid" here
      const startAt = words[first]!.start + prefixLength(words[first]!.text);
      spans.push(this.span(text, startAt, words[end]!.end));
      i = end;
      first = end;
    }
    return spans;
  }

  private chineseNames(text: string): Span[] {
    const spans: Span[] = [];
    for (const m of text.matchAll(HAN_RUN)) {
      const run = m[0];
      const runStart = m.index;
      const before = text.slice(Math.max(0, runStart - 6), runStart);
      for (let i = 0; i < run.length; i++) {
        const surname = SURNAMES_BY_FIRST.get(run[i]!)?.find((s) => run.startsWith(s, i));
        if (!surname) continue;
        const rest = run.slice(i + surname.length);
        const titleAt = (len: number) => CHINESE_TITLES_AFTER.some((t) => rest.startsWith(t, len));
        // 1. A title right after: 王先生, 李小明经理, 张经理.
        let length = [2, 1, 0].find((len) => len <= rest.length && titleAt(len));
        if (length === undefined) {
          if (CHINESE_WEAK_SURNAMES.has(surname)) continue; // 由于, 请于周五: 于 is "because", "at"
          // 2. A cue before (请联系王小明, 负责人：王小明), or the name alone in its run (，王小明，).
          const inRun = run.slice(0, i);
          const cued = CHINESE_CUES_BEFORE.some((c) => inRun.endsWith(c)) || (i === 0 && (/[:：]\s*$/.test(before) || CHINESE_CUES_BEFORE.some((c) => before.trimEnd().endsWith(c))));
          const alone = i === 0 && rest.length >= 1 && rest.length <= 2;
          // 3. At the start of a run, followed by a verb or particle: 王小明说..., 李娜已经...
          const leads = i === 0 && (CHINESE_STOP_AFTER.has(rest[2] ?? "") || CHINESE_STOP_AFTER.has(rest[1] ?? ""));
          if (!cued && !alone && !leads) continue;
          // The given name ends before a character that usually follows a name (请张伟确认: 确 starts 确认).
          length = CHINESE_STOP_AFTER.has(rest[0] ?? "") ? 0 : CHINESE_STOP_AFTER.has(rest[1] ?? "") ? 1 : Math.min(2, rest.length);
          if (length === 0) continue;
        }
        const candidate = surname + rest.slice(0, length);
        if (CHINESE_NOT_NAMES.has(candidate) || CHINESE_NOT_NAMES.has(run.slice(i, i + 2))) continue;
        const start = runStart + i;
        spans.push(this.span(text, start, start + candidate.length));
        i += candidate.length - 1;
      }
    }
    return spans;
  }
}
