import { isIP } from "node:net";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import {
  cnResidentId,
  deSteuerId,
  digitsOf,
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

const EMAIL = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;

export const email: PatternDetector = {
  name: "email",
  find: (text) => [...matches(EMAIL, text)].map((m) => ({ start: m.index, end: m.index + m[0].length, detector: "email", kind: "EMAIL", value: m[0].toLowerCase() })),
};

/** Regions whose national formats are tried: the 9 languages' main countries. International (+, 00) numbers are found for every region. */
export const PHONE_REGIONS: CountryCode[] = ["FR", "GB", "US", "ES", "DE", "PT", "NL", "IT", "BE", "CH", "MA", "SA", "AE", "EG", "CN", "BR", "MX"];

/** Phone-like runs: digits with spaces, dots, dashes or brackets, optionally after + or 00. */
const PHONE_CANDIDATE = /(?<![\p{L}\p{N}+])(?:\+|00)?\(?\d[\d\s().-]{5,}\d(?![\p{L}\p{N}])/gu;
/** Dates, decimal amounts and dotted versions look like phone numbers to a parser. */
const NOT_A_PHONE = [/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/, /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/, /^\d+\.\d{1,2}$/, /^\d+(\.\d+){2,}$/];

export function phoneDetector(regions: CountryCode[] = PHONE_REGIONS): PatternDetector {
  return {
    name: "phone",
    find(text) {
      const out: Span[] = [];
      for (const m of matches(PHONE_CANDIDATE, text)) {
        const raw = m[0].replace(/[\s.(-]+$/, "");
        const compact = raw.trim();
        if (NOT_A_PHONE.some((re) => re.test(compact))) continue;
        const international = /^(\+|00)/.test(compact);
        // A bare run of digits in national format is too often an id or an amount; a phone number
        // written nationally almost always has a trunk 0, a separator or brackets.
        if (!international && !/^[(0]/.test(compact) && !/[\s.()-]/.test(compact)) continue;
        const number = international ? parse(compact.replace(/^00/, "+")) : regions.map((r) => parse(compact, r)).find(Boolean);
        if (number) out.push({ start: m.index, end: m.index + raw.length, detector: "phone", kind: "PHONE", value: number });
      }
      return out;
    },
  };
}

function parse(text: string, region?: CountryCode): string | undefined {
  const n = parsePhoneNumberFromString(text, region ? { defaultCountry: region } : undefined);
  return n?.isValid() ? n.number : undefined;
}

const IBAN = /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{1,4}){3,8}\b/g;

export const iban: PatternDetector = {
  name: "iban",
  find(text) {
    const out: Span[] = [];
    for (const m of matches(IBAN, text)) {
      // The pattern can run into a following word or number: try shorter prefixes, group by group.
      const groups = m[0].split(/(?=[ -])/);
      for (let n = groups.length; n >= 1; n--) {
        const candidate = groups.slice(0, n).join("");
        if (ibanValid(candidate)) {
          out.push({ start: m.index, end: m.index + candidate.length, detector: "iban", kind: "IBAN", value: candidate.replace(/[\s-]/g, "").toUpperCase() });
          break;
        }
      }
    }
    return out;
  },
};

const CARD = /(?<![\d-])[2-6]\d{3}(?:[ -]?\d){9,15}(?![\d-])/g;

export const card: PatternDetector = {
  name: "card",
  find: (text) =>
    [...matches(CARD, text)].flatMap((m) => {
      const digits = digitsOf(m[0]);
      return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? [{ start: m.index, end: m.index + m[0].length, detector: "card" as const, kind: "CARD", value: digits }] : [];
    }),
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
  { re: /\b[12378][ .]?\d{2}[ .]?\d{2}[ .]?(?:\d{2}|2[AB])[ .]?\d{3}[ .]?\d{3}[ .]?\d{2}\b/g, valid: frNir },
  { re: /\b[XYZ]?\d{7,8}-?[A-Z]\b/g, valid: esDni },
  { re: /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/g, valid: itCodiceFiscale },
  { re: /(?<![\d.-])\d{3}[ .]?\d{3}[ .]?\d{3}(?![\d.-])/g, valid: (s) => nlBsn(s) || ptNif(s) },
  { re: /(?<![\d.-])\d{2}[ ]?\d{3}[ ]?\d{3}[ ]?\d{3}(?![\d.-])/g, valid: deSteuerId },
  { re: /(?<!\d)\d{17}[\dXx](?![\dXx])/g, valid: cnResidentId },
  { re: /(?<![\d-])\d{3}[- ]\d{2}[- ]\d{4}(?![\d-])/g, valid: usSsn },
  { re: /\b[A-Z]{2} ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/g, valid: ukNino },
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
