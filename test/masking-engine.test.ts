import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checksums, fold, foldWithMap, Masker, MemoryVaultStorage, NameIndex, Vault, type KeyProvider } from "../src/masking/index.js";
import { card, email, iban, ip, nationalId, phoneDetector } from "../src/masking/engine/detectors.js";

const key = randomBytes(32);
const keys: KeyProvider = { description: "test", getKey: async () => key };
const runVault = () => new Vault({ storage: new MemoryVaultStorage(), keys }).open("r1");
const values = (spans: Array<{ value: string }>) => spans.map((s) => s.value);

describe("checksums", () => {
  it("accepts known-valid identifiers and rejects a changed digit", () => {
    const cases: Array<[(s: string) => boolean, string, string]> = [
      [checksums.ibanValid, "GB82 WEST 1234 5698 7654 32", "GB82 WEST 1234 5698 7654 33"],
      [checksums.ibanValid, "FR1420041010050500013M02606", "FR1420041010050500013M02607"],
      [checksums.luhn, "4111111111111111", "4111111111111112"],
      [checksums.frNir, "1 84 07 75 123 456 57", "1 84 07 75 123 456 58"],
      [checksums.esDni, "12345678Z", "12345678A"],
      [checksums.esDni, "X1234567L", "X1234567A"],
      [checksums.itCodiceFiscale, "RSSMRA85T10A562S", "RSSMRA85T10A562T"],
      [checksums.nlBsn, "111222333", "111222334"],
      [checksums.ptNif, "123456789", "123456788"],
      [checksums.deSteuerId, "86095742719", "86095742718"],
      [checksums.cnResidentId, "11010519491231002X", "110105194912310021"],
      [checksums.ukNino, "AB123456C", "AB123456E"],
      [checksums.saNationalId, "1000000008", "1000000009"],
      [checksums.usSsn, "123-45-6789", "666-45-6789"],
    ];
    for (const [valid, good, bad] of cases) {
      expect(valid(good), good).toBe(true);
      expect(valid(bad), bad).toBe(false);
    }
  });
});

describe("pattern detectors", () => {
  it("finds emails and normalises case", () => {
    expect(values(email.find("Write to M.Quillfeather@Example.com or zoë@exämple.fr."))).toEqual(["m.quillfeather@example.com", "zoë@exämple.fr"]);
  });

  it("finds phone numbers in national and international formats, one value per number", () => {
    const spans = phoneDetector().find("Call +33 6 12 34 56 78, 06 12 34 56 78, (415) 555-2671 or 0044 20 7946 0958.");
    expect(values(spans)).toEqual(expect.arrayContaining(["+33612345678", "+14155552671", "+442079460958"]));
    // The FR mobile written twice gets the same value, so the same token.
    expect(values(spans).filter((v) => v === "+33612345678")).toHaveLength(2);
  });

  it("does not take bare ids, amounts or dates for phone numbers", () => {
    expect(phoneDetector().find("Order 123456789 for 2026-11-02, total 1234567.89, case 00012345")).toEqual([]);
  });

  it("finds IBANs with spaces and stops at the next word", () => {
    const spans = iban.find("Pay GB82 WEST 1234 5698 7654 32 AND FR1420041010050500013M02606, not GB00 WEST 1234 5698 7654 32");
    expect(values(spans)).toEqual(["GB82WEST12345698765432", "FR1420041010050500013M02606"]);
    expect(spans[0]!.end - spans[0]!.start).toBe("GB82 WEST 1234 5698 7654 32".length);
  });

  it("finds cards that pass Luhn", () => {
    expect(values(card.find("Card 4111 1111 1111 1111, ref 4111 1111 1111 1112, phone 0612345678"))).toEqual(["4111111111111111"]);
  });

  it("finds IPv4 and IPv6, not versions or times", () => {
    expect(values(ip.find("Host 10.0.12.7 and fe80::1ff:fe23:4567:890a, build 1.2.3, at 10:30:00, bad 999.1.1.1"))).toEqual(["10.0.12.7", "fe80::1ff:fe23:4567:890a"]);
  });

  it("finds national ids from the supported countries", () => {
    const text =
      "NIR 1 84 07 75 123 456 57, DNI 12345678Z, NIE X1234567L, CF RSSMRA85T10A562S, BSN 111222333, NIF 123 456 789, " +
      "IdNr 86095742719, 身份证 11010519491231002X, SSN 123-45-6789, NINO AB 12 34 56 C, هوية 1000000008";
    expect(values(nationalId.find(text)).sort()).toEqual(
      ["184077512345657", "12345678Z", "X1234567L", "RSSMRA85T10A562S", "111222333", "123456789", "86095742719", "11010519491231002X", "123456789", "AB123456C", "1000000008"].sort(),
    );
  });
});

describe("names", () => {
  it("folds case, accents and full-width characters, keeping offsets", () => {
    expect(fold("ZOË Ｑuillfeather")).toBe("zoe quillfeather");
    const f = foldWithMap("Zoë!");
    expect(f.text).toBe("zoe!");
    expect([f.starts[2], f.ends[2]]).toEqual([2, 3]);
  });

  it("finds a full name and each part, in any case and without accents", () => {
    const index = new NameIndex();
    index.add(["Zoë van der Berg-Quillfeather", "@Tobias Wrenhallow"]);
    const text = "zoe VAN DER BERG-QUILLFEATHER said Quillfeather's notes and Zoë agree; ask tobias. Berger is someone else.";
    const found = index.find(text).map((s) => [text.slice(s.start, s.end), s.value]);
    expect(found).toEqual([
      ["zoe VAN DER BERG-QUILLFEATHER", "Zoë van der Berg-Quillfeather"],
      ["Quillfeather", "Zoë van der Berg-Quillfeather"],
      ["Zoë", "Zoë van der Berg-Quillfeather"],
      ["tobias", "Tobias Wrenhallow"],
    ]);
  });

  it("doesn't mask everyday words that are also name parts, alone", () => {
    const index = new NameIndex();
    index.add(["Grace Hill"]);
    expect(index.find("By the grace of the hill, Grace Hill approved.").map((s) => s.value)).toEqual(["Grace Hill"]);
  });
});

describe("Masker", () => {
  it("masks free text with stable tokens and counts by detector and field", async () => {
    const vault = await runVault();
    const masker = new Masker({ vault });
    masker.addNames(["Marguerite Quillfeather"]);
    const a = masker.mask("Marguerite Quillfeather (m.quillfeather@example.com, +33 6 12 34 56 78) owns it.", { field: "jira.description" });
    const b = masker.mask("Ask Marguerite or mail M.Quillfeather@example.com.", { field: "jira.comment" });
    expect(a).toBe("<PERSON_1> (<EMAIL_1>, <PHONE_1>) owns it.");
    expect(b).toBe("Ask <PERSON_1> or mail <EMAIL_1>.");
    expect(masker.report()).toEqual({
      byDetector: { name: 2, email: 2, phone: 1 },
      byField: { "jira.description": 3, "jira.comment": 2 },
      wholeFields: {},
      tokens: 3,
    });
    expect(vault.valueOf("<PERSON_1>")).toBe("Marguerite Quillfeather");
  });

  it("prefers the longer span when detectors overlap", async () => {
    const masker = new Masker({ vault: await runVault(), names: ["Quillfeather"] });
    // The email holds the name; the IBAN holds digit runs.
    expect(masker.mask("quillfeather@example.com GB82 WEST 1234 5698 7654 32")).toBe("<EMAIL_1> <IBAN_1>");
  });

  it("replaces a whole field with one token", async () => {
    const masker = new Masker({ vault: await runVault() });
    expect(masker.mask("  Acme Health Partners  ", { field: "jira.customfield_10042", whole: "VALUE" })).toBe("<VALUE_1>");
    expect(masker.mask("", { field: "jira.customfield_10042", whole: "VALUE" })).toBe("");
    expect(masker.report().wholeFields).toEqual({ "jira.customfield_10042": 1 });
  });

  it("runs only the configured detectors", async () => {
    const masker = new Masker({ vault: await runVault(), detectors: ["email"], names: ["Marguerite Quillfeather"] });
    expect(masker.mask("Marguerite at m.q@example.com, 4111 1111 1111 1111")).toBe("Marguerite at <EMAIL_1>, 4111 1111 1111 1111");
  });

  it("returns a copy of the report", async () => {
    const masker = new Masker({ vault: await runVault() });
    masker.mask("a@example.com");
    masker.report().byDetector.email = 99;
    expect(masker.report().byDetector.email).toBe(1);
  });

  it("handles large text in reasonable time", async () => {
    const masker = new Masker({ vault: await runVault(), names: ["Marguerite Quillfeather", "Tobias Wrenhallow"] });
    const chunk = "Case 12345 opened by Tobias for m.q@example.com on 2026-11-02 with 06 12 34 56 78. ";
    const text = chunk.repeat(2000);
    const started = Date.now();
    const out = masker.mask(text);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(out).not.toContain("Tobias");
    expect(out).not.toContain("m.q@example.com");
  });
});
