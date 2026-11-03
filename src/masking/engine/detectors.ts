import { isIP } from "node:net";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import {
  cnResidentId,
  deSteuerId,
  esDni,
  frNir,
  ibanValid,
  itCodiceFiscale,
  luhn,
  nlBsn,
  ptNif,
  saNationalId,
  ukNino,
  usSsn,
} from "./checksums.js";

/**
 * Pattern detectors. Each finds spans of personal data in text. A detector
 * errs toward masking: a number that passes a checksum is masked even when
 * it might be an order number, because a leak fails the alpha gate and an
 * extra token only costs a little context.
 */

/** Detector names, as `masking.detectors` in agent-qa.yaml lists them. */
export type DetectorName = "email" | "phone" | "iban" | "card" | "national-id" | "name" | "address" | "ip";

export interface Span {
  start: number;
  end: number;
  detector: DetectorName;
  /** Token kind, e.g. EMAIL. */
  kind: string;
  /** The value the token stands for, normalised so that one value in two formats gets one token. */
  value: string;
}

export interface PatternDetector {
  name: Exclude<DetectorName, "name" | "address">;
  find(text: string): Span[];
}

function* matches(re: RegExp, text: string): Generator<RegExpExecArray> {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (let m = g.exec(text); m; m = g.exec(text)) {
    yield m;
    if (m[0] === "") g.lastIndex++;
  }
}

const EMAIL = /(?<![\p{L}\p{N}._%+'-])[\p{L}\p{N}._%+'-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:xn--[a-z0-9-]+|\p{L}{2,})/giu;

export const email: PatternDetector = {
  name: "email",
  find: (text) => [...matches(EMAIL, text)].map((m) => ({ start: m.index, end: m.index + m[0].length, detector: "email", kind: "EMAIL", value: m[0].toLowerCase() })),
};

/** A run of characters between separators, with its offsets in the text. */
interface Piece {
  start: number;
  end: number;
  text: string;
}

function pieces(text: string, start: number, end: number, separators: RegExp): Piece[] {
  const out: Piece[] = [];
  const re = new RegExp(`[^${separators.source}]+`, "g");
  const slice = text.slice(start, end);
  for (const m of slice.matchAll(re)) out.push({ start: start + m.index, end: start + m.index + m[0].length, text: m[0] });
  return out;
}

/**
 * Finds values made of consecutive pieces, longest first, left to right. A
 * candidate run often holds two values, or a value and a neighbour (a CVV, a
 * date): trying sub-runs at piece boundaries finds the value inside.
 */
function scanPieces(list: Piece[], maxPieces: number, accept: (from: number, to: number) => string | undefined): Array<{ from: number; to: number; value: string }> {
  const found: Array<{ from: number; to: number; value: string }> = [];
  for (let i = 0; i < list.length; ) {
    let hit = false;
    for (let j = Math.min(list.length - 1, i + maxPieces - 1); j >= i; j--) {
      const value = accept(i, j);
      if (value !== undefined) {
        found.push({ from: i, to: j, value });
        i = j + 1;
        hit = true;
        break;
      }
    }
    if (!hit) i++;
  }
  return found;
}

/** Regions whose national formats are tried: the 9 languages' main countries. International (+, 00) numbers are found for every region. */
export const PHONE_REGIONS: CountryCode[] = ["FR", "GB", "US", "ES", "DE", "PT", "NL", "IT", "BE", "CH", "MA", "SA", "AE", "EG", "CN", "BR", "MX"];
/** Regions where a number is commonly written as bare digits, with no trunk 0 or separator. */
const BARE_REGIONS: CountryCode[] = ["CN", "ES", "PT", "US", "IT", "BR", "MX"];

/** Digits with spaces, dots, dashes, slashes or brackets on one line, optionally after + or 00. */
const PHONE_RUN = /(?<![\p{L}\p{N}])\+?\(?\d[\d \t ().\/-]*\d/gu;
const PHONE_SEPARATORS = /\s().\/-/;
/** Shapes blanked before the phone scan: IPv4, dates, times, year ranges. */
const NOT_PHONE_SHAPES = [
  /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.]|\.\d)/g,
  // A date stands alone: 06.12.34.56.78 is a phone, not a date followed by more digits.
  /(?<!\d[-/.]?)(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}(?![-/.]?\d)/g,
  /(?<!\d[-/.]?)\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)?\d{2}(?![-/.]?\d)/g,
  /(?<!\d)\d{1,2}:\d{2}(?::\d{2})?(?!\d)/g,
  /(?<!\d)(?:19|20)\d{2}\s?[-–]\s?(?:19|20)\d{2}(?!\d)/g,
];
/** Dates and decimal amounts look like phone numbers to a parser. */
const NOT_A_PHONE = [/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/, /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/, /^\d+[.,]\d{1,2}$/];

export function phoneDetector(regions: CountryCode[] = PHONE_REGIONS): PatternDetector {
  return {
    name: "phone",
    find(original) {
      const out: Span[] = [];
      // IP addresses, dates, times and year ranges are digits and separators too: blank them out
      // (same length, so offsets hold) so no phone run starts or ends inside one.
      let text = original;
      for (const re of NOT_PHONE_SHAPES) text = text.replace(re, (m) => " ".repeat(m.length));
      const cache = new Map<string, string | undefined>();
      const parseOnce = (key: string, run: () => string | undefined) => {
        if (!cache.has(key)) cache.set(key, run());
        return cache.get(key);
      };
      for (const m of matches(PHONE_RUN, text)) {
        // Two or more spaces separate two values in a list or table.
        let offset = 0;
        for (const part of m[0].split(/(?=\s{2,})|(?<=\s{2,})/)) {
          const partStart = m.index + offset;
          offset += part.length;
          if (!/\d/.test(part)) continue;
          const list = pieces(text, partStart, partStart + part.length, PHONE_SEPARATORS);
          const found = scanPieces(list, 8, (from, to) => {
            const raw = text.slice(list[from]!.start, list[to]!.end);
            const digits = raw.replace(/\D/g, "");
            if (digits.length < 7 || digits.length > 15) return undefined;
            if (NOT_A_PHONE.some((re) => re.test(raw))) return undefined;
            const compact = list.slice(from, to + 1).map((p) => p.text).join(" ");
            if (/^(\+|00)/.test(compact)) return parseOnce(compact, () => parse("+" + compact.replace(/^(\+|00)/, "")));
            const shaped = to > from || compact.startsWith("0") || text[list[from]!.start - 1] === "(";
            if (shaped) return parseOnce(compact, () => regions.map((r) => parse(compact, r)).find(Boolean));
            // Bare digits: only where that is the usual way to write a number, or a full number with its country code.
            // Nine digits at least; and a 10-digit run starting with 1 is a Unix timestamp, not a US number.
            if (digits.length < 9 || /^1\d{9}$/.test(digits)) return undefined;
            return parseOnce("bare:" + compact, () => BARE_REGIONS.filter((r) => regions.includes(r)).map((r) => parse(compact, r)).find(Boolean) ?? (digits.length >= 11 ? parse("+" + digits) : undefined));
          });
          for (const f of found) {
            let start = list[f.from]!.start;
            let end = list[f.to]!.end;
            if (text[start - 1] === "(") start--;
            if (text[end] === ")" && text.slice(start, end).includes("(")) end++;
            out.push({ start, end, detector: "phone", kind: "PHONE", value: f.value });
          }
        }
      }
      return out;
    },
  };
}

function parse(text: string, region?: CountryCode): string | undefined {
  const n = parsePhoneNumberFromString(text, region ? { defaultCountry: region } : undefined);
  return n?.isValid() ? n.number : undefined;
}

/** Country code, check digits, then groups of 1 to 4 with optional spaces, dots or dashes; any case. */
// At most 15 groups after the check digits: an IBAN has at most 30 characters there, and an
// unbounded run would follow ordinary words to the end of a paragraph (quadratic).
const IBAN_RUN = /\b[A-Z]{2}[ .-]?\d{2}(?:[ .-]?[A-Z0-9]{1,4}){1,15}/gi;

export const iban: PatternDetector = {
  name: "iban",
  find(text) {
    const out: Span[] = [];
    const re = new RegExp(IBAN_RUN.source, IBAN_RUN.flags);
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const list = pieces(text, m.index, m.index + m[0].length, /\s.-/);
      // An IBAN starts at the country code; the run can continue into the next word or the next IBAN.
      let hit = false;
      for (let j = list.length - 1; j >= 0; j--) {
        const candidate = text.slice(m.index, list[j]!.end);
        if (ibanValid(candidate.replace(/[.]/g, ""))) {
          out.push({ start: m.index, end: list[j]!.end, detector: "iban", kind: "IBAN", value: candidate.replace(/[\s.-]/g, "").toUpperCase() });
          re.lastIndex = list[j]!.end;
          hit = true;
          break;
        }
      }
      // No IBAN here: look again from the next piece, which may start one.
      if (!hit) re.lastIndex = list.length > 1 ? list[1]!.start : m.index + 1;
    }
    return out;
  },
};

const CARD_RUN = /(?<!\d)[2-6]\d*(?:[ .-]?\d+)+/g;

export const card: PatternDetector = {
  name: "card",
  find(text) {
    const out: Span[] = [];
    for (const m of matches(CARD_RUN, text)) {
      const list = pieces(text, m.index, m.index + m[0].length, /\s.-/);
      const found = scanPieces(list, 8, (from, to) => {
        if (!/^[2-6]/.test(list[from]!.text)) return undefined;
        const digits = list.slice(from, to + 1).map((p) => p.text).join("");
        return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? digits : undefined;
      });
      for (const f of found) out.push({ start: list[f.from]!.start, end: list[f.to]!.end, detector: "card", kind: "CARD", value: f.value });
    }
    return out;
  },
};

const IPV4 = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.]|\.\d)/g;
const IPV6 = /(?<![\p{L}\p{N}:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\p{L}\p{N}:])/giu;

export const ip: PatternDetector = {
  name: "ip",
  find(text) {
    const out: Span[] = [];
    for (const m of matches(IPV4, text)) if (isIP(m[0]) === 4) out.push({ start: m.index, end: m.index + m[0].length, detector: "ip", kind: "IP", value: m[0] });
    for (const m of matches(IPV6, text)) {
      // At least one hex letter or a "::", so times such as 10:30:00 are not addresses.
      if (isIP(m[0]) === 6 && (/[a-f]/i.test(m[0]) || m[0].includes("::")) && m[0].replace(/[^:]/g, "").length >= 2) {
        out.push({ start: m.index, end: m.index + m[0].length, detector: "ip", kind: "IP", value: m[0].toLowerCase() });
      }
    }
    return out;
  },
};

const NATIONAL: Array<{ re: RegExp; valid: (s: string) => boolean }> = [
  { re: /\b[12378][ .]?\d{2}[ .]?\d{2}[ .]?(?:\d{2}|2[AB])[ .]?\d{3}[ .]?\d{3}[ .]?\d{2}\b/gi, valid: frNir },
  { re: /\b(?:[XYZ][ .-]?)?\d{1,2}[.]?\d{3}[.]?\d{3}[ .-]?[A-Z]\b/gi, valid: esDni },
  { re: /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/gi, valid: itCodiceFiscale },
  { re: /(?<![\d.-])\d{3}[ .]?\d{3}[ .]?\d{3}(?![\d.-])/g, valid: (s) => nlBsn(s) || ptNif(s) },
  { re: /(?<![\d.-])\d{2}[ ]?\d{3}[ ]?\d{3}[ ]?\d{3}(?![\d.-])/g, valid: deSteuerId },
  { re: /(?<!\d)\d{6}[ ]?\d{8}[ ]?\d{3}[\dXx](?![\dXx])/g, valid: (s) => cnResidentId(s.replace(/\s/g, "")) },
  { re: /(?<![\d-])\d{3}[- ]\d{2}[- ]\d{4}(?![\d-])/g, valid: usSsn },
  // NINO: with its suffix letter in any case; without it only in capitals and in the usual groupings,
  // so "at 250000" or "by 100000" in prose is not an id.
  { re: /\b[A-Z]{2} ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/gi, valid: ukNino },
  { re: /\b[A-Z]{2}(?:\d{6}| \d{2} \d{2} \d{2})\b(?! ?[A-Da-d]\b)/g, valid: ukNino },
  { re: /(?<!\d)[12]\d{9}(?!\d)/g, valid: saNationalId },
];

export const nationalId: PatternDetector = {
  name: "national-id",
  find(text) {
    const out: Span[] = [];
    for (const { re, valid } of NATIONAL) {
      for (const m of matches(re, text)) {
        if (valid(m[0])) out.push({ start: m.index, end: m.index + m[0].length, detector: "national-id", kind: "NATIONAL_ID", value: m[0].replace(/[\s.-]/g, "").toUpperCase() });
      }
    }
    return out;
  },
};

export const PATTERN_DETECTORS: Record<PatternDetector["name"], () => PatternDetector> = {
  email: () => email,
  phone: () => phoneDetector(),
  iban: () => iban,
  card: () => card,
  ip: () => ip,
  "national-id": () => nationalId,
};
