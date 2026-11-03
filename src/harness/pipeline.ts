import { randomBytes } from "node:crypto";
import { configSchema, MemoryAuditSink, RunStore, WorkflowEngine, type Config, type Step } from "../core/index.js";
import { DataAccess, type JiraCollection, type JiraInput, type JiraIssue } from "../data/index.js";
import { drive } from "../llm/index.js";
import { MemoryVaultStorage, Vault } from "../masking/index.js";
import { requirementsWorkflow, testCasesWorkflow } from "../workflows/index.js";
import type { SyntheticTicket } from "./cases.js";
import type { Pipeline } from "./runner.js";

/**
 * The masked pipeline (S1-14): each case runs the real requirements or
 * test-cases workflow, through the masked data service, with the case's
 * tickets standing in for Jira. Every generate step goes to the model through
 * the harness's recording driver; every confirm step's text, which an IDE's
 * model would see, is scanned too. Confirm steps take their unattended answer
 * (`--yes`), so nothing is pushed and the review counts as unattended.
 *
 * Runs are kept under `runsDir` for inspection, apart from the project's own
 * runs so the kept rate never counts them. They hold masked text only: the
 * token vault lives in memory and is gone when the case ends.
 */
export interface MaskedPipelineOptions {
  /** Where harness runs are kept, e.g. `.agent-qa/harness/runs`. */
  runsDir: string;
  /** The project's config: its masking and Jira field settings are used, never its connections. */
  config?: Config;
}

const AC_FIELD = { id: "customfield_10001", name: "Acceptance criteria", custom: true };
const SITE = "https://harness.invalid";

export function maskedPipeline(options: MaskedPipelineOptions): Pipeline {
  const runs = new RunStore(options.runsDir);
  const config = harnessConfig(options.config);
  return async ({ case: c, tickets, driver, observe }) => {
    const key = randomBytes(32);
    const data = new DataAccess({
      root: options.runsDir,
      store: runs,
      config,
      vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "harness (memory)", getKey: async () => key } }),
      jira: { collect: async (input: JiraInput) => collect(tickets, input) },
      confluence: { pages: async () => ({ pages: [], skipped: [] }) },
      mode: "ci",
      audit: new MemoryAuditSink(),
    });
    const engine = new WorkflowEngine({ store: runs.stateStore({ host: "cli", driver: "api" }), newRunId: runs.newRunId })
      .register(requirementsWorkflow({ data, runs }))
      .register(testCasesWorkflow({ data, runs }));

    let step: Step = await engine.start(c.workflow, c.inputs);
    for (let guard = 0; guard < 200; guard++) {
      if (step.kind === "generate") step = (await drive(engine, step, driver)).step;
      else if (step.kind === "confirm") {
        // An IDE's model is shown this text: it must be as masked as any prompt.
        observe(`${step.instructions}\n${step.context}`);
        const answer = await engine.fixedAnswer(step.runId, "unattended");
        if (answer === undefined) throw new Error(`Step ${step.stepId} has no unattended answer`);
        step = (await engine.submit(step.runId, step.stepId, answer)).next;
      } else break;
    }
    if (step.kind === "failed") throw new Error(`Run ${step.runId} failed: ${(step.errors ?? []).map((e) => `${e.path}: ${e.message}`).join("; ")}`);
    if (step.kind !== "done") throw new Error(`Run ${step.runId} didn't finish`);
    return { runId: step.runId };
  };
}

/** No real connections; masking and Jira field rules from the project when it has them. */
function harnessConfig(project: Config | undefined): Config {
  return configSchema.parse({
    version: 1,
    atlassian: {
      site: SITE,
      email: "${env:AGENT_QA_HARNESS_UNUSED}",
      token: "${env:AGENT_QA_HARNESS_UNUSED}",
      ...(project?.atlassian?.jira ? { jira: project.atlassian.jira } : {}),
    },
    ...(project?.masking ? { masking: project.masking } : {}),
  });
}

/** The case's tickets as the Jira connector would return them for `input`. */
export function collect(tickets: SyntheticTicket[], input: JiraInput): JiraCollection {
  const byKey = new Map(tickets.map((t) => [t.key, t]));
  const childrenOf = (key: string) => tickets.filter((t) => t.parent === key).map((t) => t.key);
  const out = new Map<string, JiraIssue>();
  const add = (key: string, role: JiraIssue["role"], depth: number, viaLink = false) => {
    if (out.has(key)) return;
    out.set(key, issueOf(byKey.get(key)!, tickets, role, depth, viaLink));
    for (const child of childrenOf(key)) add(child, "child", depth + 1, role === "linked" || viaLink);
  };
  if ("key" in input) {
    if (!byKey.has(input.key)) throw new Error(`Issue ${input.key} is not a ticket of this case`);
    add(input.key, "root", 0);
  } else {
    for (const t of tickets) if (!t.parent || !byKey.has(t.parent)) add(t.key, "root", 0);
  }
  // Links one level out from what was read, with their own children.
  for (const issue of [...out.values()]) for (const l of issue.links) add(l.key, "linked", 0);
  const names = [...new Set(tickets.flatMap((t) => Object.keys(t.fields)))];
  return {
    input,
    issues: [...out.values()],
    truncated: false,
    unreachable: [],
    ...(tickets.some((t) => t.acceptanceCriteria !== undefined) ? { acceptanceCriteriaField: AC_FIELD } : {}),
    extraFields: names.map((name, i) => ({ id: `customfield_${20001 + i}`, name, custom: true })),
  };
}

const adf = (text: string) => ({ text, mentions: [], links: [] });

function issueOf(t: SyntheticTicket, all: SyntheticTicket[], role: JiraIssue["role"], depth: number, viaLink: boolean): JiraIssue {
  const outward = t.links.map((l) => ({ type: l.type, direction: "outward" as const, description: "relates to", key: l.key }));
  const inward = all.flatMap((o) => o.links.filter((l) => l.key === t.key).map((l) => ({ type: l.type, direction: "inward" as const, description: "relates to", key: o.key })));
  return {
    key: t.key,
    id: t.key.replace(/\D/g, ""),
    type: t.type,
    subtask: /sub-?task/i.test(t.type),
    summary: t.summary,
    description: adf(t.description),
    ...(t.acceptanceCriteria !== undefined ? { acceptanceCriteria: adf(t.acceptanceCriteria) } : {}),
    extraFields: Object.fromEntries(Object.entries(t.fields).map(([k, v]) => [k, adf(v)])),
    labels: t.labels,
    components: t.components,
    fixVersions: [],
    ...(t.parent ? { parent: t.parent } : {}),
    children: all.filter((o) => o.parent === t.key).map((o) => o.key),
    links: [...outward, ...inward],
    remoteLinks: [],
    people: t.people.map((p) => ({ role: p.role, displayName: p.displayName, ...(p.email ? { email: p.email } : {}) })),
    updated: "2026-11-01T10:00:00.000+0000",
    role,
    depth,
    ...(viaLink ? { viaLink: true } : {}),
  };
}
