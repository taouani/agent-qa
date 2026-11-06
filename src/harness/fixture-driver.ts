import type { ModelDriver, ModelRequest, ModelResponse } from "../llm/index.js";

/**
 * A stand-in model for the leak gate in CI (S1-14): no API key, no network,
 * the same answer every time. It answers the `analyze` and `cases` steps of
 * the requirements and test-cases workflows from the step's own context, and
 * copies that masked text into its answers, so whatever it was shown flows on
 * into later prompts the way a real model's echo would.
 *
 * For the `scripts` workflow (S2-10) it writes one spec for the stand-in
 * app's Submit for Approval, and, when that test fails on the app's seeded
 * bug, first tries to make it pass by changing what it expects (which the
 * fix checks must refuse), then reports the defect. For `debug` (S3-10) it
 * does the same on the hand-written test of the harness's own repo.
 *
 * It proves the pipeline masks what it sends, not that answers are any good:
 * the quality numbers come from runs with a real model.
 */
export class FixtureDriver implements ModelDriver {
  readonly name = "fixture";

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const step = (request.schemaName ?? "").replace(/_\d+$/, "");
    const answer =
      step === "analyze"
        ? analyze(contextOf(request))
        : step === "cases"
          ? cases(contextOf(request))
          : step === "act"
            ? act(contextText(request))
            : step === "draft"
              ? draft(contextText(request))
              : step === "fix"
                ? fix(contextText(request), request.messages.length > 2 ? (request.messages.at(-1)?.content ?? "") : undefined)
                : /^fix-\d+$/.test(step)
                  ? debugFix(contextText(request), request.messages.length > 2 ? (request.messages.at(-1)?.content ?? "") : undefined)
                  : undefined;
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

/** Where the generated spec goes, from the framework folder. */
export const FIXTURE_SPEC = "tests/approval-request.spec.ts";

/**
 * One test per case: open the first request from the list, then, in the
 * last step, submit it and check its status. No names in the code: the list
 * link is picked by its place in the table.
 */
function draft(context: string) {
  const cases = [...context.matchAll(/^### (TC-[A-Z][A-Z0-9]*-\d+-\d{3}): /gm)].map((m) => {
    const rest = context.slice(m.index! + m[0].length);
    const next = rest.search(/^### /m);
    const section = next < 0 ? rest : rest.slice(0, next);
    return { id: m[1]!, steps: [...section.matchAll(/^\| (\d+) \|/gm)].length };
  });
  if (!cases.length) throw new Error("The fixture model found no test cases in the context");
  const lines = ["import { expect, test } from '@playwright/test';", ""];
  const map: Array<{ id: string; steps: Array<{ step: number; file: string; line: number }> }> = [];
  for (const c of cases) {
    const steps: Array<{ step: number; file: string; line: number }> = [];
    lines.push(`test('${c.id} submits the request for approval', async ({ page }) => {`);
    for (let n = 1; n <= Math.max(c.steps, 1); n++) {
      steps.push({ step: n, file: FIXTURE_SPEC, line: lines.length + 1 });
      lines.push(`  await test.step('Step ${n}', async () => {`);
      if (n === 1) {
        lines.push("    await page.goto('/lightning/o/Approval_Request__c/list');");
        lines.push("    await page.getByRole('table').getByRole('link').first().click();");
        lines.push("    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();");
      }
      if (n === Math.max(c.steps, 1)) {
        lines.push("    await page.getByRole('button', { name: 'Submit for Approval' }).click();");
        lines.push("    await expect(page.getByRole('region', { name: 'Details' })).toContainText('Submitted');");
      } else if (n > 1) lines.push("    await expect(page.getByRole('region', { name: 'Details' })).toBeVisible();");
      lines.push("  });");
    }
    lines.push("});", "");
    map.push({ id: c.id, steps: steps.filter((s) => s.step <= c.steps) });
  }
  return { files: [{ path: FIXTURE_SPEC, role: "spec", content: lines.join("\n") }], cases: map, notes: [] };
}

/**
 * A fix round. First try: call every failure a selector problem and change
 * the expected status to what the app shows, as a model chasing green might;
 * the fix checks must refuse it. On the retry: report the defect, change nothing.
 */
function fix(context: string, refusal: string | undefined) {
  const failures = context.slice(context.indexOf("## Fix round"), context.indexOf("## The generated files"));
  // The case titles only: a "### " line inside an error or snapshot is not one.
  const titles = [...failures.matchAll(/^### (.*TC-[A-Z][A-Z0-9]*-\d+-\d{3}.*)$/gm)].map((m) => m[1]!);
  if (/^### Errors outside the tests/m.test(failures)) titles.push("(the run)");
  if (!titles.length) throw new Error("The fixture model found no failures in the context");
  // The retry follows the fix checks' refusal of the changed expectation, and nothing else: any other refusal fails the case.
  if (refusal !== undefined && !/changes more than locators and waits|which a check compares against/.test(refusal)) throw new Error(`The fixture model's tempting fix was refused for another reason: ${refusal.slice(0, 300)}`);
  if (refusal !== undefined) return { failures: titles.map((test) => ({ test, kind: "defect", reason: "The request shows another status than Submitted after Submit for Approval" })), files: [] };
  const at = context.indexOf(`### ${FIXTURE_SPEC} (spec)`);
  const code = /```ts\n([^]*?)\n```/.exec(context.slice(at))?.[1];
  if (at < 0 || code === undefined) throw new Error("The fixture model found no spec in the context");
  return {
    failures: titles.map((test) => ({ test, kind: "selector", reason: "The status shows another word" })),
    files: [{ path: FIXTURE_SPEC, content: `${code.replace(/toContainText\('Submitted'\)/g, "toContainText('Rejected')")}\n` }],
  };
}

/**
 * A `debug` fix round (S3-10), on the person's own test: the same tempting
 * fix first (expect what the app shows, which the checks must refuse), then
 * the defect. The failing tests are the "### title" lines followed by their
 * "file:line, failed" line.
 */
function debugFix(context: string, refusal: string | undefined) {
  const failures = context.slice(context.indexOf("## Fix round"), context.indexOf("## The test files involved"));
  const titles = [...failures.matchAll(/^### (.+)\n\S+:\d+, (?:failed|flaky)/gm)].map((m) => m[1]!);
  if (/^### Errors outside the tests/m.test(failures)) titles.push("(the run)");
  if (!titles.length) throw new Error("The fixture model found no failures in the context");
  if (refusal !== undefined && !/changes more than locators and waits/.test(refusal)) throw new Error(`The fixture model's tempting fix was refused for another reason: ${refusal.slice(0, 300)}`);
  if (refusal !== undefined) return { failures: titles.map((test) => ({ test, kind: "defect", reason: "The request shows another status than Submitted after Submit for Approval" })), files: [] };
  const spec = /^### (\S+\.spec\.ts) \(spec\)\n\n```ts\n([^]*?)\n```/m.exec(context);
  if (!spec) throw new Error("The fixture model found no spec in the context");
  return {
    failures: titles.map((test) => ({ test, kind: "selector", reason: "The status shows another word" })),
    files: [{ path: spec[1]!, content: `${spec[2]!.replace(/toContainText\('Submitted'\)/g, "toContainText('Rejected')")}\n` }],
  };
}
