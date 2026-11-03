import type { ModelDriver, ModelRequest, ModelResponse } from "../llm/index.js";

/**
 * A stand-in model for the leak gate in CI (S1-14): no API key, no network,
 * the same answer every time. It answers the `analyze` and `cases` steps of
 * the requirements and test-cases workflows from the step's own context, and
 * copies that masked text into its answers, so whatever it was shown flows on
 * into later prompts the way a real model's echo would.
 *
 * It proves the pipeline masks what it sends, not that answers are any good:
 * the quality numbers come from runs with a real model.
 */
export class FixtureDriver implements ModelDriver {
  readonly name = "fixture";

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const step = (request.schemaName ?? "").replace(/_\d+$/, "");
    const context = contextOf(request);
    const answer = step === "analyze" ? analyze(context) : step === "cases" ? cases(context) : undefined;
    if (answer === undefined) throw new Error(`The fixture model can't answer step ${request.schemaName ?? "(unnamed)"}`);
    return { text: JSON.stringify(answer), model: "fixture" };
  }
}

interface ContextIssue {
  key: string;
  summary: string;
  acceptanceCriteria: string[];
}

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

/** The `{ "issues": [...] }` JSON of the step's context, from the first prompt (see `drive`). */
function contextOf(request: ModelRequest): ContextIssue[] {
  const prompt = request.messages.find((m) => m.role === "user")?.content ?? "";
  const start = prompt.indexOf("Context:\n");
  const end = prompt.indexOf("\n\nAnswer with JSON that matches this JSON Schema:");
  if (start < 0 || end < start) throw new Error("The fixture model found no context in the prompt");
  const text = prompt.slice(start, end);
  const json = text.slice(text.indexOf("{"));
  const parsed = JSON.parse(json) as { issues?: ContextIssue[] };
  return parsed.issues ?? [];
}

function analyze(issues: ContextIssue[]) {
  return {
    issues: issues.map((i) => ({
      key: i.key,
      quality: { score: i.acceptanceCriteria.length ? 75 : 40, missing: i.acceptanceCriteria.length ? [] : ["acceptance-criteria"] },
      openQuestions: [clip(`What should happen when this fails: ${i.summary}?`, 500)],
      inferredCriteria: i.acceptanceCriteria.length ? [] : [clip(`${i.summary} works as described`, 1000)],
    })),
  };
}

function cases(issues: ContextIssue[]) {
  return {
    cases: issues.flatMap((i) =>
      i.acceptanceCriteria.slice(0, 30).map((line, n) => {
        const [id, ...rest] = line.split(": ");
        const text = rest.join(": ") || line;
        return {
          id: `TC-${i.key}-${String(n + 1).padStart(3, "0")}`,
          requirement: i.key,
          title: clip(`Check: ${text}`, 200),
          type: "positive",
          priority: "P2",
          preconditions: [],
          steps: [{ action: clip(text, 2000), data: "", expected: "The result matches the criterion" }],
          covers: [id],
        };
      }),
    ),
  };
}
