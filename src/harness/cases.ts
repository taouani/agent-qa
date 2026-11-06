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

const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

/**
 * A synthetic Jira issue, shaped like what the Jira connector returns, so the
 * masked pipeline reads it the way it reads Jira. Each place personal data can
 * sit in Jira has a field: summary, description, the acceptance-criteria
 * field, other text fields, people, labels and components.
 */
export const syntheticTicketSchema = z
  .object({
    key: z.string().regex(ISSUE_KEY),
    /** Issue type. Default Story. */
    type: z.string().min(1).default("Story"),
    summary: z.string().min(1),
    description: z.string(),
    /** The acceptance-criteria field's text, when the project has one. */
    acceptanceCriteria: z.string().optional(),
    /** Other Jira text fields by name, e.g. a "Customer notes" custom field. */
    fields: z.record(z.string(), z.string()).default({}),
    status: z.string().min(1).optional(),
    priority: z.string().min(1).optional(),
    fixVersions: z.array(z.string()).default([]),
    /** Names of people @-mentioned in the description (Jira keeps them apart from the text too). */
    mentions: z.array(z.string().min(1)).default([]),
    /** Confluence pages linked from the issue (as remote links). */
    pages: z.array(z.object({ title: z.string().min(1), body: z.string() }).strict()).default([]),
    /** Reporter, assignee and creator, with an optional email. */
    people: z
      .array(z.object({ role: z.enum(["assignee", "reporter", "creator"]), displayName: z.string().min(1), email: z.string().optional() }).strict())
      .default([]),
    labels: z.array(z.string()).default([]),
    components: z.array(z.string()).default([]),
    /** The parent issue's key (a story's epic, a sub-task's story), in the same case. */
    parent: z.string().regex(ISSUE_KEY).optional(),
    /** Issue links to other tickets of the same case. */
    links: z.array(z.object({ type: z.string().min(1).default("Relates"), key: z.string().regex(ISSUE_KEY) }).strict()).default([]),
  })
  .strict();

/** Every text of a ticket a seed can hide in. */
export function ticketTexts(t: SyntheticTicket): string[] {
  return [
    t.summary,
    t.description,
    t.acceptanceCriteria ?? "",
    // Field names are project setup, not data: they reach the model as they are.
    ...Object.values(t.fields),
    ...t.people.flatMap((p) => [p.displayName, p.email ?? ""]),
    ...t.labels,
    ...t.components,
    ...t.fixVersions,
    ...t.mentions,
    ...t.pages.flatMap((p) => [p.title, p.body]),
  ];
}
export type SyntheticTicket = z.infer<typeof syntheticTicketSchema>;

export const harnessCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    description: z.string().min(1),
    workflow: z.string().min(1),
    inputs: z.record(z.string(), z.unknown()),
    tickets: z
      .array(syntheticTicketSchema)
      .min(1)
      .superRefine((tickets, ctx) => {
        const keys = new Set(tickets.map((t) => t.key));
        if (keys.size !== tickets.length) ctx.addIssue({ code: "custom", message: "ticket keys must be unique" });
        tickets.forEach((t, i) => {
          if (t.parent && !keys.has(t.parent)) ctx.addIssue({ code: "custom", path: [i, "parent"], message: `${t.parent} is not a ticket of this case` });
          t.links.forEach((l, j) => {
            if (!keys.has(l.key)) ctx.addIssue({ code: "custom", path: [i, "links", j, "key"], message: `${l.key} is not a ticket of this case` });
          });
        });
      }),
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

/** Every value is fake: reserved example domains and IP range, test IBAN, card and id numbers, fictional names. */
export const DEFAULT_SEEDS: Seed[] = [
  { id: "seed-name-1", kind: "name", value: "Marguerite Quillfeather" },
  { id: "seed-name-2", kind: "name", value: "Tobias Wrenhallow" },
  { id: "seed-name-3", kind: "name", value: "Zephyrine Applewood" },
  { id: "seed-email-1", kind: "email", value: "m.quillfeather@example.com" },
  { id: "seed-email-2", kind: "email", value: "t.wrenhallow@example.org" },
  { id: "seed-phone-1", kind: "phone", value: "+33 6 39 98 12 34" }, // range reserved for fiction
  { id: "seed-iban-1", kind: "iban", value: "DE89 3704 0044 0532 0130 00" },
  { id: "seed-card-1", kind: "card", value: "4111 1111 1111 1111" },
  { id: "seed-national-id-1", kind: "national-id", value: "12345678Z" }, // Spanish DNI test number
  { id: "seed-ip-1", kind: "ip", value: "192.0.2.44" }, // TEST-NET-1
];

/**
 * The shipped cases run the real workflows. Between them they put seeds in
 * place where the Jira and Confluence connectors hand data on: summary,
 * description, @-mentions, the acceptance-criteria field, criteria inside the
 * description, a custom text field, people, labels, components, fix versions,
 * a linked Confluence page, a child issue, a linked issue and a JQL filter.
 * Addresses have no detector yet, so no seed is an address.
 */
const DEFAULT_CASE_INPUTS: HarnessCaseInput[] = [
  {
    id: "contact-case-form",
    description: "A story with a sub-task: a customer's name, email and phone in the description and criteria, an IP in a custom field, the reporter's name and email.",
    workflow: "test-cases",
    inputs: { key: "QAH-1" },
    tickets: [
      {
        key: "QAH-1",
        summary: "Create a case from a contact record",
        status: "To Do",
        priority: "High",
        description: "As an agent I open the contact Marguerite Quillfeather (m.quillfeather@example.com, +33 6 39 98 12 34) and click New Case. Ask @Tobias Wrenhallow for access.",
        mentions: ["Tobias Wrenhallow"],
        acceptanceCriteria: "- The case form opens with Marguerite Quillfeather pre-filled as the contact\n- The contact's phone +33 6 39 98 12 34 is shown on the form",
        fields: { "Customer notes": "Last login from 192.0.2.44." },
        people: [{ role: "reporter", displayName: "Tobias Wrenhallow", email: "t.wrenhallow@example.org" }],
      },
      {
        key: "QAH-2",
        type: "Sub-task",
        parent: "QAH-1",
        summary: "Email Marguerite Quillfeather when the case is created",
        description: "Acceptance criteria:\n- An email goes to m.quillfeather@example.com\n- Tobias Wrenhallow (t.wrenhallow@example.org) is copied",
        labels: ["owner-m.quillfeather@example.com"],
      },
    ],
    seeds: ["seed-name-1", "seed-email-1", "seed-phone-1", "seed-ip-1", "seed-name-2", "seed-email-2"],
  },
  {
    id: "refund-epic-jql",
    description: "A JQL filter that names a person, over an epic, a story with card and IBAN criteria, and a linked bug with a national id and no criteria.",
    workflow: "test-cases",
    inputs: { jql: 'project = QAH AND assignee = "Zephyrine Applewood"' },
    tickets: [
      { key: "QAH-3", type: "Epic", summary: "Refunds", description: "Refund rules agreed with Zephyrine Applewood." },
      {
        key: "QAH-4",
        parent: "QAH-3",
        summary: "Refund to the original payment method",
        description: "Refunds go back to how the customer paid.",
        acceptanceCriteria:
          "- Given the customer paid with card 4111 1111 1111 1111, the refund goes back to that card\n- When the card has expired, the refund goes to IBAN DE89 3704 0044 0532 0130 00",
        people: [{ role: "assignee", displayName: "Zephyrine Applewood" }],
        components: ["Billing"],
        fixVersions: ["2026.12 for Zephyrine Applewood"],
        pages: [{ title: "Refund notes from Zephyrine Applewood", body: "Agreed on the call: test with card 4111 1111 1111 1111, and IBAN DE89 3704 0044 0532 0130 00 as the fallback." }],
        links: [{ type: "Relates", key: "QAH-5" }],
      },
      { key: "QAH-5", type: "Bug", summary: "Refund failed for one customer", description: "The refund for the customer with DNI 12345678Z failed with a timeout." },
    ],
    seeds: ["seed-card-1", "seed-iban-1", "seed-name-3", "seed-national-id-1"],
  },
  {
    id: "shipping-task-requirements",
    description: "The requirements workflow alone, on a task with no criteria: a name and phone in the description.",
    workflow: "requirements",
    inputs: { key: "QAH-6" },
    tickets: [{ key: "QAH-6", type: "Task", summary: "Update the delivery contact", description: "Deliveries for this account go to Tobias Wrenhallow, phone +33 6 39 98 12 34." }],
    seeds: ["seed-name-2", "seed-phone-1"],
  },
  {
    id: "approval-request-review",
    description: "Reviews a hand-written test and page object (no browser) with two known flaws: a fixed wait the code scan reports, and a check inside the page object the model must report. The test names a seeded person; the harness never approves the proposed fix, so the files stay as they were.",
    workflow: "review",
    inputs: {},
    // review reads no Jira: the ticket only carries the seed, which the hand-written test uses.
    tickets: [{ key: "QAH-10", summary: "Review the request submission test", description: "The test opens the request of Marguerite Quillfeather." }],
    seeds: ["seed-name-1"],
  },
];

export const DEFAULT_CASES: HarnessCase[] = DEFAULT_CASE_INPUTS.map((c) => harnessCaseSchema.parse(c));

/**
 * Shipped cases that run in a browser (S2-10), on the stand-in app, whose
 * records hold the case's seeds: names in list cells, a record heading and a
 * sentence; the email and phone in list cells too; the email, phone, IBAN and
 * IP in the opened record's detail fields, outside any table.
 * They run with `agent-qa harness --browser`.
 */
export const DEFAULT_BROWSER_CASES: HarnessCase[] = [
  harnessCaseSchema.parse({
    id: "approval-request-explore",
    description: "Explores an approval request on the stand-in app: its records show the requesters' names, email, phone, IBAN and last login IP.",
    workflow: "explore",
    inputs: { key: "QAH-7" },
    tickets: [
      {
        key: "QAH-7",
        summary: "Comment on an approval request",
        description:
          "Open the request of Marguerite Quillfeather (m.quillfeather@example.com, +33 6 39 98 12 34), backed up by Tobias Wrenhallow. Payouts go to DE89 3704 0044 0532 0130 00; she last signed in from 192.0.2.44.",
        acceptanceCriteria: "- A comment saved on the request shows in a confirmation message",
      },
    ],
    seeds: ["seed-name-1", "seed-name-2", "seed-email-1", "seed-phone-1", "seed-iban-1", "seed-ip-1"],
  }),
  harnessCaseSchema.parse({
    id: "approval-request-defect",
    description: "Writes and runs a test for submitting a request on the stand-in app, which has a seeded bug: the request shows as Rejected. The run must report the defect, not change the test, and its output (an error naming the record's email and IBAN) must stay masked.",
    workflow: "scripts",
    inputs: { key: "QAH-8" },
    tickets: [
      {
        key: "QAH-8",
        summary: "Submit an approval request",
        description: "Marguerite Quillfeather (m.quillfeather@example.com) submits her request; Tobias Wrenhallow approves it. Payouts go to DE89 3704 0044 0532 0130 00.",
        acceptanceCriteria: "- A submitted request shows the status Submitted",
      },
    ],
    seeds: ["seed-name-1", "seed-name-2", "seed-email-1", "seed-iban-1"],
  }),
  harnessCaseSchema.parse({
    id: "approval-request-debug",
    description: "Debugs a hand-written test (with a page object) that opens a seeded person's request on the stand-in app and submits it; the app's seeded bug shows it as Rejected. The run must report the defect, refuse the fix that expects Rejected, leave the person's files unchanged, and keep their names, the error and the page snapshot masked.",
    workflow: "debug",
    inputs: {},
    // debug reads no Jira: the ticket only carries the seeds, which the hand-written test and the app's records use.
    tickets: [
      {
        key: "QAH-9",
        summary: "Debug the request submission test",
        description: "The test opens the request of Marguerite Quillfeather (m.quillfeather@example.com); Tobias Wrenhallow is the backup approver. Payouts go to DE89 3704 0044 0532 0130 00.",
      },
    ],
    seeds: ["seed-name-1", "seed-name-2", "seed-email-1", "seed-iban-1"],
  }),
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
    const text = c.tickets.map((t) => ticketTexts(t).join("\n")).join("\n");
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
