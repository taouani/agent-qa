# Agent-QA v2: slice 0 plan and core contracts

Nov 1, 2026 · @Tarek AOUANI

## Summary

Slice 0 runs from 2 to 15 November 2026. It freezes v1 and builds the v2 skeleton: config, policy layer, token vault, run store, a minimal workflow engine and the harness scaffold. It also pulls the Copilot spike forward into week 1, because the step protocol on Copilot is the riskiest assumption in the [final plan](https://claude.ai/artifact/KhLP51UivtHtbf9LD87rrk).

The estimate is **64–76 h**, against 60–70 h in the roadmap. The difference is the spike, which moves here from slice 1, so slice 1 gets about 8 h back.

This doc also fixes the three contracts everything else depends on: the `agent-qa.yaml` config, the run and artifact files, and the MCP step protocol. Everything in them is a **proposal** until you accept it. Section 6 lists the two choices that are yours, plus the go-ahead for the v1 freeze, which can't easily be undone.

## 1. Slice 0 task list

Week 1 (2–8 Nov) builds the minimum needed for the spike. Week 2 (9–15 Nov) builds the safety parts: config, policy, vault, run store and harness.

| # | Task | Week | Hours | Depends on | Exit check |
| --- | --- | --- | --- | --- | --- |
| T1 | **Freeze v1.** Merge PR #3, tag `v1.0.0`, create the `v1` branch, point `base-install.sh`, `base-install.ps1` and the project installers at `v1`, add a notice to the README | 1 | 3–4 | Your go | A fresh v1 install with the documented `curl` and `irm` commands still works |
| T2 | **Repo skeleton** on `master`: TypeScript strict, tsup, vitest, ESLint with module boundary rules, folder layout below | 1 | 5–6 | T1 | `npm run build` and `npm test` pass; a forbidden import fails lint |
| T3 | **CI** on GitHub Actions: lint, type check, test, build on Node 20 and 22, Ubuntu and Windows | 1 | 3–4 | T2 | Green on a pull request |
| T9 | **Minimal workflow engine**: step state machine, persisted step state, validation loop with retries | 1 | 7–8 | T2 | Unit tests cover start, submit, invalid output, retry limit and resume |
| T10 | **Copilot spike**: MCP server over stdio with the step tools, one toy workflow on fixture tickets, run in VS Code agent mode | 1 | 8–10 | T9 | Pass criteria in section 5 |
| T12 | **Reserve the npm name**: changesets set up, `sf-agent-qa@0.0.0` placeholder published | 1 | 1 | T2 | The package is visible on npm |
| T4 | **Config**: zod schema for `agent-qa.yaml`, loader, `${env:}` and `${keychain:}` secret references, exported JSON Schema for editor completion | 2 | 7–8 | T2 | Valid and invalid sample configs give the expected results and messages |
| T6 | **Policy layer**: write targets, allow, ask and deny rules, CI rule that test code goes out only as a pull request, audit log | 2 | 6–7 | T4 | Every write path in the code goes through one function, checked by a lint rule |
| T7 | **Token vault**: AES-256-GCM, key in the OS keychain (`@napi-rs/keyring`), key from an environment variable in CI, expiry per run, storage interface for the later self-hosted server | 2 | 7–8 | T4 | Round-trip tests; no plaintext on disk; the vault folder is gitignored |
| T8 | **Run store**: run folder, `run.json`, artifact writes that validate and compute `sourceHash`, markdown rendering hook | 2 | 6–7 | T4, T9 | An invalid artifact can't be written; reruns with the same inputs give the same `sourceHash` |
| T5 | **doctor**: checks Node, config, secrets, keychain, gitignore, model access and Atlassian/Xray/git reachability | 2 | 4–5 | T4, T7 | Passes on your setup; each failure prints a fix |
| T11 | **Harness scaffold**: case format, synthetic tickets with seeded personal data, runner, a recording model driver that fails the run if a seeded value reaches a model, JSON report | 2 | 7–8 | T8, T9 | Harness runs an empty pipeline and catches a deliberately leaked value |

**Folder layout (proposal).** Lint rules enforce the arrows: front doors import only the core, and nothing except `data/` imports a connector.

```
src/
  cli/          front door: commander commands
  mcp/          front door: MCP server, tools, prompts
  core/         config, policy, runs, workflow engine
  data/         masked data service: the only caller of connectors
  masking/      detectors, field rules, gateway, vault
  connectors/   jira, confluence, xray, git/github, git/gitlab, git/azure-devops, salesforce
  llm/          model catalog, API driver, headless drivers
  workflows/    one folder per workflow: steps, templates, schemas
  harness/      cases, runner, report
```

## 2. Contract 1: `agent-qa.yaml`

One file at the project root, versioned with the code. `init` writes it, and `doctor` validates it. Its zod schema is exported as JSON Schema so VS Code completes and checks it. Rules:

- **No secrets in the file.** Secrets are references: `${env:NAME}` or `${keychain:NAME}`. `doctor` fails on anything that looks like a literal token.
- **Every section is optional except `version`.** A workflow checks only the sections it needs, so a team without Confluence never configures it.
- **Models are written as `provider:model`.** The package ships a catalog of the selectable models: the latest 5 from Anthropic, OpenAI, Mistral, xAI and Google, refreshed at each release. `models.allowed` can narrow that list for a team.
- **Policy defaults are safe.** Every write target defaults to `ask`, and the Jira write target defaults to `deny`. In CI, `ask` means "open a pull request".

```yaml
version: 1

project:
  name: techcare-sf

atlassian:                       # Jira and Confluence Cloud
  site: https://acme.atlassian.net
  email: ${env:ATLASSIAN_EMAIL}
  token: ${env:ATLASSIAN_API_TOKEN}
  confluence:
    spaceKey: QA
    parentPageId: "123456"

xray:                            # Xray Cloud
  clientId: ${env:XRAY_CLIENT_ID}
  clientSecret: ${env:XRAY_CLIENT_SECRET}
  projectKey: PROJ

git:
  platform: github               # github | gitlab | azure-devops
  repo: acme/sf-tests
  token: ${env:GITHUB_TOKEN}

salesforce:
  baseUrl: https://acme--qa.sandbox.my.salesforce.com
  auth: storage-state            # login once, reuse the saved session

models:
  default: anthropic:<model-id>
  allowed: [anthropic:*, openai:*, mistral:*, xai:*, google:*]
  workflows:                     # optional per-workflow override
    scripts: openai:<model-id>
  keys:
    anthropic: ${env:ANTHROPIC_API_KEY}

masking:
  restoreOnWrite: false          # off by default (plan, question 5)
  detectors: [email, phone, iban, card, national-id, name]
  fields:                        # fields always treated as personal data
    jira: [reporter, assignee, customfield_10042]
  presidio:
    url: null                    # optional container

policy:
  writes:
    xray: ask                    # allow | ask | deny
    confluence: ask
    testCode: ask                # CI: always through a pull request
    jira: deny

harness:                         # plan, question 2
  sources:
    - fixtures: ./harness/fixtures   # default synthetic set ships with the package
    - jira:
        jql: "project = QAH AND labels = agent-qa-harness"
  seededPersonalData: ./harness/seeds.yaml

playwright:
  baseUrl: http://localhost:3000
  testDir: tests
  profile: .agent-qa/framework-profile.json
```

*Assumption:* `<model-id>` stays a placeholder here. The real IDs come from the catalog at build time, so this doc doesn't go stale.

## 3. Contract 2: runs and artifacts

Each run gets its own folder. JSON is the source of truth. Markdown and CSV are views rendered from it and are never read back.

```
.agent-qa/
  runs/
    2026-11-20-PROJ-123-k3f9/        {UTC date}-{context}-{4-char id}
      run.json                       manifest
      requirements.json   requirements.md
      test-cases.json     test-cases.md   test-cases.xray.csv
      masking-report.json
      cost-report.json
      steps/                         step state, so a run can resume
      log.jsonl
  vault/                             gitignored, encrypted
  framework-profile.json
```

The context is the Jira key, or `release` for a JQL filter or several tickets, as in v1. The date is in UTC, which fixes the v1 time-zone bug, and the short ID stops two runs on the same day from colliding.

**`run.json`** records: `id`, `workflow`, `context`, `status` (running, needs-input, done, failed, cancelled), start and end times, `host` (copilot, claude-code, cursor, cli), `driver` (host-model, api, headless), `model`, the package and schema versions, `inputs` (each source with its hash), `artifacts`, and `parentRuns`, meaning earlier runs whose output this run reused.

**Every artifact has the same envelope:**

```ts
type Artifact<T> = {
  schema: "test-cases@1";        // name@major version
  runId: string;
  createdAt: string;             // ISO 8601, UTC
  sourceHash: string;            // sha256, see below
  inputs: { kind: "jira-issue" | "confluence-page" | "artifact" | "git-diff"; ref: string; hash: string }[];
  masked: true;                  // artifacts only ever hold tokens, never real values
  data: T;
};
```

`sourceHash` is the hash of the masked inputs, the prompt template version and the schema version. If it hasn't changed, the output is up to date, which is how `--changed-only` and reuse of earlier runs work.

**Entities for slice 1.** Other entities are defined in the slice that needs them.

| Entity | Key fields |
| --- | --- |
| `Requirement` | `key`, `title`, `language`, `type` (story, bug, epic…), `acceptanceCriteria[]`, `businessRules[]`, `ambiguities[]`, `risks[]`, `sources[]` |
| `TestCase` | `id` (`TC-{KEY}-{NNN}`, as in v1), `requirementKey`, `title`, `objective`, `kind` (positive, negative, edge), `priority` (P1–P4, as in v1), `preconditions[]`, `steps[]` of `{ action, data, expected }`, `tags[]`, `language`, `automationCandidate`, `xrayKey` once pushed |
| `MaskingReport` | Counts per detector and field, token IDs only, no values, and `seededLeaks` in harness runs |
| `CostReport` | Per step: model, input and output tokens, estimated cost, duration |

**Versioning.** A breaking change to a schema bumps its major version, for example `test-cases@2`, and ships with a migration. Old runs stay readable.

## 4. Contract 3: MCP step protocol

The core owns the workflow, and the host's model only answers steps. The model never decides what to fetch, never sees a real personal value, and can't write anywhere except through a step the core offers. The CLI runner drives the same engine with an API or headless model, so IDE and CI runs follow the same steps.

**Workflow tools**

| Tool | Input | Returns |
| --- | --- | --- |
| `workflow_list` | none | The workflows, each with its input schema and a short description |
| `workflow_start` | `workflow`, `inputs` (for example `{ "issue": "PROJ-123" }`), `options` | `runId` and the first step |
| `workflow_next` | `runId` | The current step again, which lets a host resume after a restart |
| `workflow_submit` | `runId`, `stepId`, `output` | Either `accepted` with the next step, or `rejected` with errors by JSON path and the attempt count |
| `workflow_status` | `runId` | Run status, finished steps and artifact paths |
| `workflow_cancel` | `runId` | Status `cancelled` |

**A step** is `{ stepId, kind, instructions, context, outputSchema, attempt, maxAttempts }`:

- `kind: generate`: the model produces JSON that must match `outputSchema`. `instructions` is the rendered prompt template, and `context` is masked text only.
- `kind: confirm`: the model shows the user a summary of a write, such as "Push 14 test cases to Xray", and submits the user's answer. The policy layer checks the write again when it runs.
- `kind: done` or `kind: failed`: the run is over, with artifact paths or the reason.

**Rules**

1. One open step per run. Submitting the same `stepId` twice returns the first result.
2. An invalid output comes back with its errors. After `maxAttempts` (3 by default), the step fails, and the run stops with the errors kept in `steps/`.
3. Step state is written to disk after every transition, so a run survives an editor restart.
4. Large outputs can be split. A step may ask for one item at a time, such as a test case per submit, when its schema says so. The spike tests whether that's needed.

**Data tools** are read-only and go through the masking gateway: `jira_get_issue`, `jira_search`, `confluence_get_page`, `xray_get_tests`, `git_get_diff` and `runs_read`. Workflows use them internally. They're also exposed so a user can ask the host questions about masked data.

**Prompts.** Each workflow is also an MCP prompt, such as `test-cases`, that tells the host model to run the start, submit and next loop. *Assumption to verify in the spike:* VS Code shows MCP prompts as slash commands in Copilot agent mode.

**An example run**

```
user    /test-cases PROJ-123
model   workflow_start(test-cases, {issue: PROJ-123})
core    fetches and masks PROJ-123 → step 1 generate: requirement analysis
model   workflow_submit(step 1, {...})        → rejected: steps[2].expected missing
model   workflow_submit(step 1, {...})        → accepted, step 2 generate: test cases
model   workflow_submit(step 2, {...})        → accepted, step 3 confirm: push 14 cases to Xray?
user    yes
model   workflow_submit(step 3, {approve: true}) → policy allows, push, step 4 done
```

## 5. Copilot spike (week 1)

**Question:** will Copilot in VS Code agent mode reliably follow a core-driven step loop?

**Setup:** a toy `summarize-and-cases` workflow with three steps: analyze, generate 10–30 test cases, confirm a fake write. It runs on three synthetic tickets, one with seeded personal data. It's tried with two models picked in Copilot, one from Anthropic and one from OpenAI. The spike code is throwaway, except the engine (T9).

**Pass criteria.** The spike passes if four of these five hold for both models:

| # | Check | Pass when |
| --- | --- | --- |
| 1 | Loop following | All three steps finish without the user nudging the model, in at least 5 of 6 runs |
| 2 | Validation retries | After a rejected output, the model fixes it and resubmits within 3 attempts |
| 3 | Large outputs | A 30-case submit of about 15k tokens goes through in one call, or the split-output mode works |
| 4 | Slash command | The workflow starts from an MCP prompt, or from one short instruction if prompts aren't shown |
| 5 | Approval friction | No more than one tool-approval click per run after "always allow" is set for the server |

**If it fails**, there are three fallbacks, in order:

1. Smaller steps: one item per submit, and shorter instructions.
2. *Hybrid*: Copilot is the front end, but the core answers `generate` steps with its own API model. That keeps masking and validation, but users need an API key even in the IDE.
3. Move the first host to Claude Code and bring Copilot in during slice 4. That changes your decision M4, so it would be your call.

The result is written up in the run folder and in this doc by 8 November, with the transcripts.

## 6. Decisions needed from you

The questions are in order of importance. The first one blocks T1.

1. **Go-ahead for the v1 freeze (T1).** This merges PR #3 into `master`, tags `v1.0.0`, creates the `v1` branch and changes the installer URLs. It's hard to undo once users install from the new URLs. Answer yes, or name a date.
2. **Models outside the catalog.** Can a team add a model that isn't in the shipped list?
   - **A. Catalog only.** Simplest, and every allowed model is one we tested at release.
   - **B. Catalog plus custom.** A team can add any `provider:model` from the five providers, and `doctor` shows a warning.
   - I recommend **B**. New models come out between releases, and a warning keeps the choice with the team.
3. **Accept the three contracts as written?** You can answer yes, or comment on any line in sections 2 to 4. I'll treat silence as a no until you say yes, because T4, T8 and T9 build directly on them.

The rest of this doc is technical detail that I'll settle inside the slice and record in this doc: npm rather than pnpm, `@napi-rs/keyring` for the keychain, and ESLint boundary rules. Tell me if you'd rather decide any of those yourself.
