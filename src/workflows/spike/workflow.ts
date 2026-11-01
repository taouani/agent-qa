import { z } from "zod";
import type { WorkflowDefinition } from "../../core/index.js";
import { SPIKE_TICKETS, type SpikeTicketKey } from "./fixtures.js";

const keys = Object.keys(SPIKE_TICKETS) as [SpikeTicketKey, ...SpikeTicketKey[]];

const analysis = z.object({
  summary: z.string().min(10).describe("One or two sentences on what the ticket asks for"),
  acceptanceCriteria: z.array(z.string().min(1)).min(1).describe("Each acceptance criterion, restated precisely"),
  ambiguities: z.array(z.string()).describe("Open questions a tester would ask; empty if none"),
});

const testCase = z.object({
  id: z.string().regex(/^TC-SPIKE-\d+-\d{3}$/).describe("TC-{TICKET-KEY}-{NNN}, e.g. TC-SPIKE-1-001"),
  title: z.string().min(5),
  kind: z.enum(["positive", "negative", "edge"]),
  priority: z.enum(["P1", "P2", "P3", "P4"]),
  preconditions: z.array(z.string()),
  steps: z
    .array(z.object({ action: z.string().min(1), data: z.string(), expected: z.string().min(1) }))
    .min(1),
});

const cases = z.object({ cases: z.array(testCase).min(10).max(30) });

export type SpikeInputs = { ticket: SpikeTicketKey };

/** Toy workflow for the Copilot spike: analyze, write 10–30 cases, confirm a fake push. */
export const spikeWorkflow: WorkflowDefinition<SpikeInputs> = {
  id: "spike-test-cases",
  description: "Spike only: analyze a synthetic ticket, write 10-30 test cases, then confirm a (fake) Xray push.",
  inputSchema: z.object({ ticket: z.enum(keys) }),
  steps: [
    {
      id: "analyze",
      kind: "generate",
      outputSchema: analysis,
      instructions: ({ inputs }) =>
        `Analyze ticket ${inputs.ticket} for testing. Restate every acceptance criterion and list ambiguities. ` +
        "Tokens like <PERSON_1> are masked personal data: keep them exactly as they are and never guess real values.",
      context: ({ inputs }) => {
        const t = SPIKE_TICKETS[inputs.ticket];
        return `${inputs.ticket}: ${t.title}\n\n${t.body}`;
      },
    },
    {
      id: "cases",
      kind: "generate",
      outputSchema: cases,
      instructions: ({ inputs }) =>
        `Write 10 to 30 test cases for ${inputs.ticket} covering positive, negative and edge cases for every acceptance criterion. ` +
        `Number IDs TC-${inputs.ticket}-001, TC-${inputs.ticket}-002, and so on. Keep masked tokens as they are.`,
      context: ({ outputs }) => JSON.stringify(outputs.analyze, null, 2),
    },
    {
      id: "push",
      kind: "confirm",
      outputSchema: z.object({ approve: z.boolean().describe("true only if the user said yes") }),
      instructions: ({ outputs }) => {
        const n = (outputs.cases as z.infer<typeof cases>).cases.length;
        return `Ask the user: "Push ${n} test cases to Xray?" (spike: nothing is pushed). Submit their answer.`;
      },
    },
  ],
};
