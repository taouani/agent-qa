import { describe, expect, it } from "vitest";
import { LanguageNameDetector } from "../src/masking/index.js";

const detector = new LanguageNameDetector();
const names = (text: string) => detector.find(text).map((s) => text.slice(s.start, s.end));

describe("names without a known list", () => {
  it("finds names after titles in the Latin-script languages", () => {
    expect(names("Please call Mrs Henderson-Blake about the renewal.")).toEqual(["Henderson-Blake"]);
    expect(names("Contacter Mme Dupont ou M. Lefèvre avant lundi.")).toEqual(["Dupont", "Lefèvre"]);
    expect(names("Llamar al Sr. García López y a la Sra. Fernández.")).toEqual(["García López", "Fernández"]);
    expect(names("Rückruf an Herr Dr. Müller-Lüdenscheidt bitte.")).toEqual(["Müller-Lüdenscheidt"]);
    expect(names("Bel dhr. Van Dijk of mevr. De Vries.")).toEqual(["Van Dijk", "De Vries"]);
    expect(names("Inviare a Sig.ra Bianchi e Dott. Esposito.")).toEqual(["Bianchi", "Esposito"]);
  });

  it("finds a given name with the surname around it, in each language", () => {
    expect(names("Assigned to Jennifer Okafor yesterday.")).toEqual(["Jennifer Okafor"]);
    expect(names("Le dossier de Jean-Luc de la Fontaine est clos.")).toEqual(["Jean-Luc de la Fontaine"]);
    expect(names("El cliente Alejandro Ruiz Zafón llamó.")).toEqual(["Alejandro Ruiz Zafón"]);
    expect(names("Ansprechpartner: Jürgen Weißmüller.")).toEqual(["Jürgen Weißmüller"]);
    expect(names("O gestor Gonçalo dos Santos aprovou.")).toEqual(["Gonçalo dos Santos"]);
    expect(names("Contactpersoon Sanne van der Berg belt terug.")).toEqual(["Sanne van der Berg"]);
    expect(names("Il referente è Giulia Caruso.")).toEqual(["Giulia Caruso"]);
    expect(names("Owner: Youssef El Amrani")).toEqual(["Youssef El Amrani"]);
  });

  it("takes the surname before a comma, and all-caps names", () => {
    expect(names("Requested by Quillfeather, Marguerite on Monday")).toEqual(["Quillfeather, Marguerite"]);
    expect(names("REPORTER: MARIA KOWALCZYK")).toEqual(["MARIA KOWALCZYK"]);
  });

  it("finds Arabic-script names after titles and from given names", () => {
    expect(names("يرجى التواصل مع السيد خالد المنصوري غدا")).toEqual(["خالد المنصوري"]);
    expect(names("أرسل الطلب إلى فاطمة الزهراء")).toEqual(["فاطمة الزهراء"]);
    expect(names("وافق محمد بن سلمان على التغيير")).toEqual(["محمد بن سلمان"]);
  });

  it("finds Chinese names with a title, a cue, or standing alone", () => {
    expect(names("请联系王小明确认需求")).toEqual(["王小明"]);
    expect(names("负责人：李娜，截止日期周五")).toEqual(["李娜"]);
    expect(names("张经理已批准")).toEqual(["张"]);
    expect(names("客户欧阳娜娜女士投诉")).toEqual(["欧阳娜娜"]);
    expect(names("审批：陈晓东 / 刘洋")).toEqual(["陈晓东", "刘洋"]);
  });

  it("leaves everyday text alone", () => {
    expect(names("The Account owner can edit the Case status when the Lead converts.")).toEqual([]);
    expect(names("Grace period ends in May; Will the Mark field stay?")).toEqual([]);
    expect(names("Le statut passe à Clos quand le dossier est validé.")).toEqual([]);
    expect(names("谢谢！周末前完成高级方案的设计。")).toEqual([]);
    expect(names("用户可以在周一提交申请")).toEqual([]);
    expect(names("QA-123 links to Salesforce Lightning and Jira Cloud.")).toEqual([]);
  });

  it("can be limited to some languages", () => {
    const zhOnly = new LanguageNameDetector(["zh"]);
    expect(zhOnly.find("Assigned to Jennifer Okafor, 联系人：王小明").map((s) => s.value)).toEqual(["王小明"]);
  });

  it("is fast on large text", () => {
    const text = "Assigned to Jennifer Okafor. 请联系王小明. السيد خالد المنصوري. The Account owner edits the Case. ".repeat(3000);
    const started = Date.now();
    expect(detector.find(text).length).toBe(9000);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe("Masker with language names", () => {
  it("masks found names next to known ones, keeping the known token for the full name", async () => {
    const { randomBytes } = await import("node:crypto");
    const { Masker, MemoryVaultStorage, Vault } = await import("../src/masking/index.js");
    const key = randomBytes(32);
    const vault = await new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => key } }).open("r");
    const masker = new Masker({ vault, names: ["Marguerite Quillfeather"] });
    expect(masker.mask("Marguerite Quillfeather asked Mme Dupont and 联系人：王小明.")).toBe("<PERSON_1> asked Mme <PERSON_2> and 联系人：<PERSON_3>.");
    expect(vault.valueOf("<PERSON_1>")).toBe("Marguerite Quillfeather");
    const knownOnly = new Masker({ vault, nameLanguages: [] });
    expect(knownOnly.mask("Mme Dupont")).toBe("Mme Dupont");
  });
});

describe("name edges found in review", () => {
  it("stops a cued Chinese name before the verb after it", () => {
    expect(names("请张伟确认")).toEqual(["张伟"]);
    expect(names("请王确认")).toEqual([]);
    expect(names("联系人：李娜说可以")).toEqual(["李娜"]);
  });

  it("does not take a lowercase word that is also a given name", () => {
    expect(names("Marie said hi")).toEqual(["Marie"]);
    expect(names("Ask Jennifer Okafor and Said")).toEqual(["Jennifer Okafor", "Said"]);
  });
});
