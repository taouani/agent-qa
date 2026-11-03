/** Checksums that tell a real identifier from a random run of digits. */

export const digitsOf = (s: string) => s.replace(/\D/g, "");

export function luhn(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** ISO 13616 IBAN check (mod 97 = 1), with the country's length where known. */
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AT: 20, BE: 16, BH: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, EG: 29, ES: 24, FI: 18,
  FR: 27, GB: 22, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, JO: 30, KW: 30, LB: 28, LI: 21, LT: 20, LU: 20,
  LV: 21, MA: 28, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, QA: 29, RO: 24, SA: 24, SE: 24, SI: 19, SK: 24,
  SM: 27, TN: 24, TR: 26,
};
export function ibanValid(raw: string): boolean {
  const iban = raw.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const expected = IBAN_LENGTHS[iban.slice(0, 2)];
  if (expected !== undefined && iban.length !== expected) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

/** France: NIR (sécurité sociale), 13 digits + 2-digit key; Corsica uses 2A/2B. */
export function frNir(raw: string): boolean {
  const s = raw.replace(/[\s.-]/g, "").toUpperCase();
  const m = /^([12378]\d{4}(?:\d{2}|2A|2B)\d{6})(\d{2})$/.exec(s);
  if (!m) return false;
  const body = m[1]!.replace("2A", "19").replace("2B", "18");
  return 97 - Number(BigInt(body) % 97n) === Number(m[2]);
}

/** Spain: DNI (8 digits + letter) and NIE (X/Y/Z + 7 digits + letter). */
export function esDni(raw: string): boolean {
  const s = raw.replace(/[\s.-]/g, "").toUpperCase();
  const m = /^([XYZ]?)(\d{7,8})([A-Z])$/.exec(s);
  if (!m) return false;
  if (m[1] && m[2]!.length !== 7) return false;
  if (!m[1] && m[2]!.length !== 8) return false;
  // NIE: X, Y and Z stand for 0, 1 and 2.
  const num = Number((m[1] ? String("XYZ".indexOf(m[1])) : "") + m[2]!);
  return "TRWAGMYFPDXBNJZSQVHLCKE"[num % 23] === m[3];
}

/** Italy: codice fiscale, 16 characters with a check letter. */
export function itCodiceFiscale(raw: string): boolean {
  const s = raw.toUpperCase();
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(s)) return false;
  const odd = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = s[i]!;
    const v = c >= "0" && c <= "9" ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 65;
    sum += i % 2 === 0 ? odd[v]! : v;
  }
  return String.fromCharCode(65 + (sum % 26)) === s[15];
}

/** Netherlands: BSN, 9 digits, the 11-test. */
export function nlBsn(raw: string): boolean {
  const s = digitsOf(raw);
  if (s.length !== 9 || /^0+$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(s[i]) * (9 - i);
  sum -= Number(s[8]);
  return sum % 11 === 0;
}

/** Portugal: NIF, 9 digits, mod 11. */
export function ptNif(raw: string): boolean {
  const s = digitsOf(raw);
  if (s.length !== 9 || s[0] === "0") return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(s[i]) * (9 - i);
  const check = 11 - (sum % 11);
  return (check >= 10 ? 0 : check) === Number(s[8]);
}

/** Germany: Steuerliche Identifikationsnummer, 11 digits, ISO 7064 MOD 11,10. */
export function deSteuerId(raw: string): boolean {
  const s = digitsOf(raw);
  if (s.length !== 11 || s[0] === "0") return false;
  let product = 10;
  for (let i = 0; i < 10; i++) {
    let sum = (Number(s[i]) + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }
  const check = 11 - product;
  return (check === 10 ? 0 : check) === Number(s[10]);
}

/** China: resident identity card, 18 characters, ISO 7064 MOD 11-2. */
export function cnResidentId(raw: string): boolean {
  const s = raw.toUpperCase();
  if (!/^\d{17}[\dX]$/.test(s)) return false;
  const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(s[i]) * w[i]!;
  return "10X98765432"[sum % 11] === s[17];
}

/** US: Social Security number in its usual 3-2-4 form, with the SSA's never-issued ranges excluded. */
export function usSsn(raw: string): boolean {
  const m = /^(\d{3})[- ](\d{2})[- ](\d{4})$/.exec(raw);
  if (!m) return false;
  const [, a, b, c] = m;
  return a !== "000" && a !== "666" && a![0] !== "9" && b !== "00" && c !== "0000";
}

/** UK: National Insurance number, two letters, six digits, a letter A to D (often left off). */
export function ukNino(raw: string): boolean {
  const s = raw.replace(/\s/g, "").toUpperCase();
  if (!/^[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]?$/.test(s)) return false;
  return !/^(BG|GB|NK|KN|TN|NT|ZZ)/.test(s);
}

/** Saudi Arabia: national id or iqama, 10 digits starting 1 or 2, Luhn. */
export function saNationalId(raw: string): boolean {
  const s = digitsOf(raw);
  return s.length === 10 && /^[12]/.test(s) && luhn(s);
}
