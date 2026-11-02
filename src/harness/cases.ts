import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/**
 * Harness case format (slice 0, T11). A case is a set of synthetic tickets
 * that carry seeded personal data, plus the workflow inputs to run. Seeds are
 * the values that must never reach a model; the report names them by id only.
 */

export const SEED_KINDS = ["name", "email", "phone", "iban", "card", "national-id", "address", "ip"] as const;
export type SeedKind = (typeof SEED_KINDS)[number];

export const seedSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase id, e.g. seed-email-1"),
    kind: z.enum(SEED_KINDS),
    value: z.string().min(3),
  })
  .strict();
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
    /** Ids of the seeds placed in these tickets. Every one must appear in the tickets. */
    seeds: z.array(z.string()).default([]),
  })
  .strict();
export type HarnessCase = z.infer<typeof harnessCaseSchema>;
export type HarnessCaseInput = z.input<typeof harnessCaseSchema>;

export const seedsFileSchema = z.object({ seeds: z.array(seedSchema).min(1) }).strict();

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
  { id: "seed-phone-1", kind: "phone", value: "+33 6 12 34 56 78" },
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
          "As an agent I open the contact Marguerite Quillfeather (m.quillfeather@example.com, +33 6 12 34 56 78) " +
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
  const byId = new Map(seeds.map((s) => [s.id, s]));
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new HarnessCaseError(`Duplicate harness case id: ${c.id}`);
    ids.add(c.id);
    const text = c.tickets.map((t) => [t.summary, t.description, ...Object.values(t.fields)].join("\n")).join("\n");
    for (const id of c.seeds) {
      const seed = byId.get(id);
      if (!seed) throw new HarnessCaseError(`Case ${c.id} names unknown seed ${id}`);
      if (!text.includes(seed.value)) throw new HarnessCaseError(`Case ${c.id} names seed ${id}, but its tickets don't contain it`);
    }
  }
}

function parseFile(file: string, text: string): unknown {
  try {
    return file.endsWith(".json") ? JSON.parse(text) : parse(text, { maxAliasCount: 100 });
  } catch (error) {
    throw new HarnessCaseError(`${file} can't be parsed: ${(error as Error).message.split("\n")[0]}`);
  }
}

/** Load `*.yaml`, `*.yml` or `*.json` cases from a fixtures folder, sorted by file name. */
export async function loadCases(dir: string): Promise<HarnessCase[]> {
  const files = (await readdir(dir)).filter((f) => /\.(ya?ml|json)$/.test(f)).sort();
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
  const parsed = seedsFileSchema.safeParse(parseFile(file, await readFile(file, "utf8")));
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    // Never echo a seed value in the error.
    throw new HarnessCaseError(`${file}: ${["$", ...issue.path.map(String)].join(".")}: ${issue.code === "too_small" ? issue.message : "invalid"}`);
  }
  return parsed.data.seeds;
}
