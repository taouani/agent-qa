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
    const answer = step === "analyze" ? analyze(contextOf(request)) : step === "cases" ? cases(contextOf(request)) : step === "act" ? act(contextText(request)) : undefined;
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

/** The step's context, from the first prompt (see `drive`). */
function contextText(request: ModelRequest): string {
  const prompt = request.messages.find((m) => m.role === "user")?.content ?? "";
  const start = prompt.indexOf("Context:\n");
  const end = prompt.indexOf("\n\nAnswer with JSON that matches this JSON Schema:");
  if (start < 0 || end < start) throw new Error("The fixture model found no context in the prompt");
  return prompt.slice(start + "Context:\n".length, end);
}

/** The `{ "issues": [...] }` JSON of the step's context. */
function contextOf(request: ModelRequest): ContextIssue[] {
  const text = contextText(request);
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

/**
 * The explorer's tour of the stand-in app, one action per call: open the
 * first record from the list by its (masked) name, check its heading, type a
 * comment that names it, save, check the toast, finish. Names come from the
 * page as the model sees it, so tokens flow back to the browser and the
 * echoed value back to the model, as with a real model.
 */
function act(context: string) {
  const done = Number(/## Done so far \((\d+) of \d+ actions\)/.exec(context)?.[1] ?? "0");
  const page = context.slice(context.indexOf("## The page now"));
  const link = /- link "(<[A-Z_]+_\d+>)"/.exec(page)?.[1];
  const heading = /- heading "(<[A-Z_]+_\d+>)" \[level=1\]/.exec(page)?.[1];
  // A step whose element isn't on the page stops the tour loudly: a gate that saw less must not pass.
  const need = (name: string | undefined, what: string) => {
    if (name === undefined) throw new Error(`The fixture explorer found no ${what} on the page (action ${done + 1})`);
    return name;
  };
  const tour = [
    () => ({ type: "click", target: { role: "link", name: need(link, "record link") } }),
    () => ({ type: "verify", target: { role: "heading", name: need(heading, "record heading") } }),
    () => ({ type: "fill", target: { label: "Comments" }, value: `Checked with ${need(heading, "record heading")}` }),
    () => ({ type: "click", target: { role: "button", name: "Save" } }),
    () => ({ type: "verify", target: { role: "status" }, text: `Checked with ${need(heading, "record heading")}` }),
  ];
  return { step: 1, action: done < tour.length ? tour[done]!() : { type: "finish", summary: "Toured the stand-in app" } };
}
