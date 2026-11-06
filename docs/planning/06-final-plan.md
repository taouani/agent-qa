# Agent-QA v2: final plan

Nov 1, 2026 · @Tarek AOUANI

Agent-QA v2 is a TypeScript rewrite. It ships as one open-source npm package that serves Copilot, Claude Code, Cursor and CI through one core. That core masks personal data, validates every output and gates every write. The full scope releases on Feb 28, 2027, in six slices: a harness-first foundation, then working end-to-end paths, starting with Copilot. Inputs: the [goal statement](https://claude.ai/artifact/5zsAk31ZD9cvAWqcdaLxhs), the [assessment](https://claude.ai/artifact/RauobD7pjyxXWdgudKqTwF) and the [Phase 4 decisions](https://claude.ai/artifact/PVf5QDRXF3kuqsaT6u2QXD).

## 1. Decision log

All 23 decisions were made by Tarek on 1 November 2026. The detailed options for each one are in the Phase 4 doc. The answers to the nine follow-up questions are in section 6.

| # | Decision | Choice | Reasoning |
| --- | --- | --- | --- |
| G1 | Scope and date | Full scope; release by 28 Feb 2027; hosted mode after | Estimate 450–670 h; about 620 h available after holidays |
| A1 | Shape | One core with two front doors: MCP server for IDE hosts and headless agents, pipeline runner for the CLI | Keeps "user picks the IDE"; one code path; enforcement through tool contracts |
| A2 | Masking point | Tokenize on the way in, with a local vault; restore only when writing to the customer's own systems (can be turned off) | Protects every model call and keeps realistic values |
| A3 | Artifact store | Typed JSON per run in `.agent-qa/runs/`, rendered to markdown, CSV and Confluence | Reviewable in git; validated |
| A4 | Enforcement | Policy layer in the core, plus host permission settings written by `init` | Complete in CI; best available in IDEs |
| A5 | Browser | Playwright library inside the core, not `@playwright/cli` | Masked snapshots; same version as host tests; stable releases |
| S1 | Language | TypeScript, Node.js 20+ | Test code is TS; one runtime |
| S2 | Masking engine | Field-aware masking in TS, pattern detectors, optional Presidio container | Precise on typed fields; light install |
| S3 | Libraries | MCP SDK, zod, Vercel AI SDK, Playwright, ts-morph, vitest, tsup, changesets | Mainstream and TS-first |
| S4 | License | Apache-2.0 | Patent grant |
| D1 | Code layout | One npm package with lint-enforced modules | Solo maintainer |
| D2 | Workflows | TypeScript steps; prompts in overridable template files | Testable; tunable without code |
| D3 | Data model | zod entities, `sourceHash`, run IDs `{date}-{context}-{short-id}` | No time-zone bug, no collisions |
| D4 | MCP tools | Step protocol: `workflow_start`, `workflow_next`, `workflow_submit`, plus data tools and prompts | Same steps in IDE and CLI |
| D5 | CLI and approvals | `init`, `run`, `mcp`, `doctor`, `harness`, `profile`; `agent-qa.yaml`; CI writes only through a pull or merge request | Simple setup; review is approval |
| F1 | Documents | One `document` engine for strategy, plan, charter, risk register, test data, traceability, release notes | Less code, fewer harness cases |
| F2 | Utilities | Built-in: `doctor`, validation on write, `--publish`, `--changed-only`, pipelines in config | Fewer commands |
| F3 | Additions | Xray Cloud push, Salesforce pack, masking report, cost report, harness dashboard | Goal needs the first two |
| F4 | Removals | Drop TestRail and Confluence file export; API and accessibility tests become executable | Xray is fixed; real tests |
| M1 | Migration | Big-bang: v2 replaces v1 in place | Your choice |
| M2 | PR #3 | Merge as final v1, tag `v1.0.0` | Fallback for users |
| M3 | Repo | Same repo; v1 on a `v1` branch; npm name sf-agent-qa | Keeps history |
| M4 | Build order | Harness first, then vertical slices; Copilot is the first host | Risky parts proven early |

## 2. Target architecture

One core codebase holds all the logic. Hosts and CI only choose who does the reasoning: the IDE's model through MCP, or the core's own model calls.

&#91;embedded content: Target architecture · one core, two front doors\]

**How a run flows**

1. A host or the CLI starts a workflow, for example `test-cases PROJ-123`.
2. Connectors fetch Jira, Confluence, Xray, git or Salesforce data. The masking gateway tokenizes personal data and records it in the masking report. The token vault stays on the machine.
3. Each step renders its prompt template with masked inputs and an output schema. In IDE mode, the host's model answers through `workflow_submit`. In CLI mode, the runner calls an allowed model API, or a headless Copilot CLI or Claude Code connected to the same MCP server.
4. The core validates the answer against the zod schema. Invalid answers go back with the errors.
5. Valid artifacts are written to `.agent-qa/runs/{date}-{context}-{id}/` as JSON, with markdown and CSV views.
6. Writes outside the run folder pass the policy layer: Xray push, Confluence publish, test code. In CI, test-code changes go out only as a pull or merge request.

**Boundaries:** nothing outside the core touches Atlassian, git or Salesforce directly. That is what makes masking and the write gate enforceable. Framework knowledge about the user's test repo lives in a reviewed `framework-profile`, and Salesforce knowledge lives in the Salesforce pack. Neither is spread through prompts.

## 3. Recommended tech stack

The stack is TypeScript on Node.js 20+, published as one Apache-2.0 npm package named `sf-agent-qa` (the bare name `agent-qa` is taken). Versions get pinned when the project starts.

| Layer | Choice |
| --- | --- |
| Language and runtime | TypeScript, Node.js 20+ (LTS) |
| MCP server | `@modelcontextprotocol/sdk` (stdio for IDE hosts) |
| Schemas | `zod`, exported as JSON Schema for MCP tools, artifact files and `agent-qa.yaml` |
| Model calls | Vercel AI SDK (`ai`), with Anthropic, OpenAI, Mistral, xAI, Google, OpenRouter and OpenAI-compatible (LiteLLM) providers on an allowlist |
| Headless drivers | Copilot CLI and Claude Code non-interactive mode, each pointed at Agent-QA's MCP server |
| Atlassian and Xray | Typed `fetch` clients for Jira REST v3, Confluence REST v2 and the Xray Cloud API |
| Git hosts | `@octokit/rest`, `@gitbeaker/rest`, `azure-devops-node-api` behind one adapter interface |
| Masking | Field-aware rules in TS, pattern detectors, optional Presidio container |
| Token vault | Node `crypto` AES-256-GCM, key in the OS keychain, expiry per run |
| Browser and tests | `playwright`, matched to the host repo's version; `@axe-core/playwright` for accessibility |
| Code analysis and edits | `ts-morph` |
| CLI | `commander` |
| Tests and harness | `vitest`; harness runs real pipelines on fixtures and the Salesforce sandbox |
| Build and release | `tsup`, `changesets`, GitHub Actions, npm with provenance |

## 4. Roadmap

There is one foundation, then five slices. Each slice works end to end and is measured by the harness. The plan totals about 620 hours. That is the 680 hours nominally available, less about 60 hours for the year-end holidays. My estimate for the scope is 450 to 670 hours, so the last two slices carry the risk.

&#91;embedded content: Roadmap · foundation, five slices, two gates\]

| Slice | Delivers | Effort (h) | Depends on | Exit check |
| --- | --- | --- | --- | --- |
| 0. Foundation (2–15 Nov) | Merge PR #3, tag `v1.0.0`, move v1 to the `v1` branch and point the v1 installers at it. TS skeleton, lint-enforced modules, CI, `agent-qa.yaml`, `doctor`, policy layer, vault, run store. Harness scaffold with synthetic reference tickets that contain seeded personal data | 60–70 | — | CI green; `doctor` passes on your setup; harness runs an empty pipeline |
| 1. Requirements to Xray (16 Nov–13 Dec) | Jira and Confluence clients, field-aware masking and masking report, `requirements` and `test-cases` workflows, Xray Cloud push, MCP step protocol on **Copilot** (VS Code agent mode), CLI with API driver, cost report | 140–160 | 0 | Your two users switch from v1. Harness measures the kept rate. No seeded personal data reaches a model. Alpha on npm `next` |
| 2. Playwright scripts (14 Dec–10 Jan) | Framework profile, Playwright explorer with masked accessibility snapshots, Salesforce pack, `scripts` workflow with run-and-fix, GitHub adapter for pull requests in CI | 130–150 | 1 | Harness measures the runnable rate on your sandbox org; CI opens a pull or merge request with generated specs |
| 3. Maintain automation (11–24 Jan) | `debug` (stop on real defect), `review`, `audit`, `refactor` with ts-morph and per-task checks; executable API and accessibility tests | 80–90 | 2 | Harness case: a seeded product bug is reported, never "fixed" in the test |
| 4. Breadth and hosts (25 Jan–14 Feb) | `document` engine (seven types), `gherkin`, `commits`, Confluence publish, GitLab and Azure DevOps adapters, Claude Code and Cursor setup, headless Copilot CLI and Claude Code drivers | 120–140 | 1 (documents), 2 (hosts) | Every workflow passes the harness on all three hosts and the CLI |
| 5. Hardening and release (15–28 Feb) | Harness dashboard, docs, contribution guide, security policy, packaging, `2.0.0` | 40–50 + buffer | All | Fresh install to first run in under 10 minutes; release published |

**If slices slip:** decide at the 13 December gate, using the harness numbers and the hours actually spent. Without slipping the date, these can move to 2.1: the harness dashboard, the Cursor setup, the executable API and accessibility tests, and the third git adapter.

## 5. Key risks and mitigations

The biggest risk is the schedule itself: the top of the estimate uses all the available hours. The gate on 13 December exists to catch that early.

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Scope outgrows the hours (450–670 h estimate vs about 620 h) | High | Late or partial release | Track hours per slice; decide at the 13 Dec gate; the defer list in section 4 is agreed in advance |
| Big-bang leaves users stranded; v1 installers break when `master` changes | Medium | Users lose their tool | Do slice 0 first: tag `v1.0.0`, move v1 to the `v1` branch, point v1 installers at it, then replace `master`. Users switch only after the alpha gate |
| Masking misses personal data in free text | Medium | GDPR, PIPL or CCPA breach | Field-aware rules first; names from known fields reused as a dictionary; seeded personal data in harness fixtures fails the build if it reaches a model; masking report per run; optional Presidio |
| Copilot's MCP behavior limits the step protocol | Medium | Slice 1 slips | Prove the step protocol on Copilot in week 3 with one workflow before building more; keep the CLI path as fallback |
| Salesforce UI makes generated scripts brittle | High | 90% runnable target missed | Salesforce pack in slice 2; measured on your sandbox from the first run; locator rules ranked by observed stability |
| Quality varies by model | High | 95% kept target missed | Harness picks a documented minimum model per workflow; `doctor` warns below it |
| Atlassian or Xray Cloud API limits and authentication | Medium | Slower runs, failed pushes | Rate-limit handling and retries in clients; Xray duplicate check before create; integration tests on a test project |
| Token vault leaks real values | Low | Data exposure on disk | AES-256-GCM, key in the OS keychain, expiry per run, never written into artifacts, `doctor` checks it is gitignored |
| Solo maintainer at 40 h a week for 17 weeks | Medium | Burnout or a long stall | Holidays already reduce the plan; small slices with releases; buffer in slice 5; defer list ready |
| npm name sf-agent-qa taken before the first publish | Low | Naming confusion | Publish a placeholder in slice 0; fallback @taouani/sf-agent-qa; the command stays `agent-qa` |

## 6. Resolved questions

Tarek answered all nine open questions on 1 November 2026. Nothing is left open.

| # | Question | Answer | What it changes in the plan |
| --- | --- | --- | --- |
| 1 | npm package name | `sf-agent-qa` | The name was free on npm on 1 Nov 2026. Publish a placeholder in slice 0 to reserve it; `@taouani/sf-agent-qa` is the fallback. The command stays `agent-qa`. |
| 2 | Harness reference data | Configurable | A `harness` section in `agent-qa.yaml` names the source of each case: a Jira project, a JQL filter or local fixture files, plus the seeded personal data the case expects to be masked. The package ships a synthetic default set, so the harness also runs without Jira. |
| 3 | First git platform | GitHub | Slice 2 builds the GitHub adapter. GitLab and Azure DevOps follow in slice 4. |
| 4 | Copilot surfaces | VS Code agent mode only | No JetBrains support in slice 1. Copilot CLI is used only as a headless CI driver, in slice 4. |
| 5 | Value restoration | Off by default | Teams opt in per write target in `agent-qa.yaml`. |
| 6 | Minimum models | Stated up front | Selectable models: a user can pick any of the latest 5 models from Anthropic, OpenAI, Mistral, xAI (Grok) and Google, set in agent-qa.yaml. The list is refreshed at each release. The harness does not run every workflow on every model. Mistral, xAI and Google are added to the allowlist as direct providers in slice 1 (about 2–4 h each). |
| 7 | Telemetry | None | No usage data leaves the machine. Cost and masking reports stay local. |
| 8 | Languages | The eight listed, plus Chinese | Assumption: "yes" includes Chinese. Chinese names need their own detector, because they have no spaces or capital letters. That adds about 15–25 h to slice 1. |
| 9 | Hosted mode | Self-hosted server, after 2.0 | The vault and config sit behind a storage interface from slice 0, so a server backend can plug in later. No multi-tenant service is planned. |
