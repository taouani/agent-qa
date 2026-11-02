import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { SeedScanner } from "./scanner.js";

/**
 * Harness case format (slice 0, T11). A case is a set of synthetic tickets
 * that carry seeded personal data, plus the workflow inputs to run. Seeds are
 * the values that must never reach a model; the report names them by id only.
 */

export const SEED_KINDS = ["name", "email", "phone", "iban", "card", "national-id", "address", "ip"] as const;
export type SeedKind = (typeof SEED_KINDS)[number];

const DIGIT_SEED_KINDS: ReadonlySet<string> = new Set(["phone", "iban", "card", "national-id"]);

export const seedSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase id, e.g. seed-email-1"),
    kind: z.enum(SEED_KINDS),
    value: z.string().min(3, "is too short to detect reliably"),
  })
  .strict()
  .superRefine((seed, ctx) => {
    // Short digit seeds would match inside unrelated numbers. The message never echoes the value.
    // Phone and card numbers count digits only; IBANs and national ids may contain letters.
    const counted = seed.kind === "phone" || seed.kind === "card" ? seed.value.replace(/\D/g, "") : seed.value.replace(/[^\p{L}\p{N}]/gu, "");
    if (DIGIT_SEED_KINDS.has(seed.kind) && counted.length < 8) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "needs at least 8 digits (letters count for iban and national-id)" });
    }
  });
export type Seed = z.infer<typeof seedSchema>;

export const syntheticTicketSchema = z
  .object({
    key: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/),
    summary: z.string().min(1),
    description: z.string(),
    /** Extra Jira fields, e.g. reporter or a custom field. */
    fields: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export type SyntheticTicket = z.infer<typeof syntheticTicketSchema>;

export const harnessCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    description: z.string().min(1),
    workflow: z.string().min(1),
    inputs: z.record(z.string(), z.unknown()),
    tickets: z.array(syntheticTicketSchema).min(1),
    /** Ids of the seeds placed in these tickets. Every one must appear in the tickets; a case without seeds proves nothing. */
    seeds: z.array(z.string()).min(1),
  })
  .strict();
export type HarnessCase = z.infer<typeof harnessCaseSchema>;
export type HarnessCaseInput = z.input<typeof harnessCaseSchema>;

export const seedsFileSchema = z
  .object({ seeds: z.array(seedSchema).min(1) })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.seeds.forEach((seed, i) => {
      if (seen.has(seed.id)) ctx.addIssue({ code: "custom", path: ["seeds", i, "id"], message: `duplicate seed id ${seed.id}` });
      seen.add(seed.id);
    });
  });

export class HarnessCaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessCaseError";
  }
}

/** Every value is fake: reserved example domains, test IBAN and card numbers, fictional names. */
export const DEFAULT_SEEDS: Seed[] = [
  { id: "seed-name-1", kind: "name", value: "Marguerite Quillfeather" },
  { id: "seed-name-2", kind: "name", value: "Tobias Wrenhallow" },
  { id: "seed-email-1", kind: "email", value: "m.quillfeather@example.com" },
  { id: "seed-phone-1", kind: "phone", value: "+33 6 39 98 12 34" }, // range reserved for fiction
  { id: "seed-iban-1", kind: "iban", value: "DE89 3704 0044 0532 0130 00" },
  { id: "seed-card-1", kind: "card", value: "4111 1111 1111 1111" },
];

export const DEFAULT_CASES: HarnessCase[] = [
  {
    id: "contact-case-form",
    description: "A support story that names a customer, with their email and phone in the description.",
    workflow: "spike-test-cases",
    inputs: { ticket: "QAH-1" },
    tickets: [
      {
        key: "QAH-1",
        summary: "Create a case from a contact record",
        description:
          "As an agent I open the contact Marguerite Quillfeather (m.quillfeather@example.com, +33 6 39 98 12 34) " +
          "and click New Case. The case form opens with the contact pre-filled.",
        fields: { reporter: "Tobias Wrenhallow" },
      },
    ],
    seeds: ["seed-name-1", "seed-email-1", "seed-phone-1", "seed-name-2"],
  },
  {
    id: "refund-payment-details",
    description: "A billing story with an IBAN and a card number in the acceptance criteria.",
    workflow: "spike-test-cases",
    inputs: { ticket: "QAH-2" },
    tickets: [
      {
        key: "QAH-2",
        summary: "Refund to the original payment method",
        description:
          "Given the customer paid with card 4111 1111 1111 1111, the refund goes back to that card. " +
          "When the card has expired, refund to IBAN DE89 3704 0044 0532 0130 00 instead.",
        fields: {},
      },
    ],
    seeds: ["seed-card-1", "seed-iban-1"],
  },
];

/** Check that every seed a case names exists and actually appears in its tickets. */
export function validateCases(cases: HarnessCase[], seeds: Seed[]): void {
  const byId = new Map<string, Seed>();
  for (const seed of seeds) {
    if (byId.has(seed.id)) throw new HarnessCaseError(`Duplicate seed id: ${seed.id}`);
    byId.set(seed.id, seed);
  }
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new HarnessCaseError(`Duplicate harness case id: ${c.id}`);
    ids.add(c.id);
    const text = c.tickets.map((t) => [t.summary, t.description, ...Object.values(t.fields)].join("\n")).join("\n");
    for (const id of c.seeds) {
      const seed = byId.get(id);
      if (!seed) throw new HarnessCaseError(`Case ${c.id} names unknown seed ${id}`);
      // Fixtures must carry the whole value, not just one part of a name.
      const hit = new SeedScanner([seed]).scan(text)[0];
      if (!hit || hit.match === "name-part" || hit.match === "email-local") throw new HarnessCaseError(`Case ${c.id} names seed ${id}, but its tickets don't contain it`);
    }
  }
}

function parseFile(file: string, text: string): unknown {
  try {
    return file.endsWith(".json") ? JSON.parse(text) : parse(text, { maxAliasCount: 100 });
  } catch (error) {
    // Parser messages can quote the source text, which may hold seed values: report only where it broke.
    if (file.endsWith(".json")) {
      const at = /position (\d+)/.exec((error as Error).message)?.[1];
      if (at === undefined) throw new HarnessCaseError(`${file} is not valid JSON`);
      const before = text.slice(0, Number(at)).split("\n");
      throw new HarnessCaseError(`${file} is not valid JSON (line ${before.length}, column ${before.at(-1)!.length + 1})`);
    }
    const line = (error as { linePos?: Array<{ line: number; col: number }> }).linePos?.[0];
    throw new HarnessCaseError(`${file} is not valid YAML${line ? ` (line ${line.line}, column ${line.col})` : ""}`);
  }
}

/** Load `*.yaml`, `*.yml` or `*.json` cases from a fixtures folder, sorted by file name. */
export async function loadCases(dir: string): Promise<HarnessCase[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    throw new HarnessCaseError(`Fixtures folder ${dir} can't be read (${(error as NodeJS.ErrnoException).code ?? "error"})`);
  }
  const files = names.filter((f) => /\.(ya?ml|json)$/.test(f)).sort();
  const cases: HarnessCase[] = [];
  for (const file of files) {
    const parsed = harnessCaseSchema.safeParse(parseFile(file, await readFile(join(dir, file), "utf8")));
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new HarnessCaseError(`${file}: ${["$", ...issue.path.map(String)].join(".")}: ${issue.message}`);
    }
    cases.push(parsed.data);
  }
  return cases;
}

/** Load the seeds file named by `harness.seededPersonalData`. */
export async function loadSeeds(file: string): Promise<Seed[]> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    throw new HarnessCaseError(`Seeds file ${file} can't be read (${(error as NodeJS.ErrnoException).code ?? "error"})`);
  }
  const parsed = seedsFileSchema.safeParse(parseFile(file, text));
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    // Never echo a seed value in the error.
    throw new HarnessCaseError(`${file}: ${["$", ...issue.path.map(String)].join(".")}: ${issue.message}`);
  }
  return parsed.data.seeds;
}
