# Agent-QA Phase 4: proposals and decisions

Nov 1, 2026 · @Tarek AOUANI

We work through one area at a time. Each decision is recorded in the log at the end before we move on.

## Order

Each area depends on the one before it, so we go in this order.

1. **Architecture.** Where the model, the data, masking and enforcement sit. Every later choice depends on this shape.
2. **Technical stack.** TypeScript or Python, and the libraries. This depends on what the architecture needs, such as an MCP server, Playwright, masking and model providers.
3. **Design.** Code layout, artifact data model, MCP tool and CLI design. These depend on the language.
4. **Features.** What to keep, add, merge or drop among the 24 commands, now that we know what's cheap and what's expensive.
5. **Migration approach.** How to get from the branch to the rewrite and release. This depends on all of the above.

## 1. Architecture

I recommend one core codebase with two front doors. An MCP server serves the IDE hosts and headless agents, and a pipeline runner serves the CLI. Both run the same workflow steps, through the same masking, validation and write gate.

&#91;embedded content: Recommended architecture · one core, two front doors\]

### A1. Overall shape. Three viable options; I recommend A

|  | A. One core, two front doors (diagram) | B. Agent-QA is the agent | C. Prompt pack plus a masking MCP server |
| --- | --- | --- | --- |
| How it works | IDE hosts call Agent-QA's MCP tools; the host's model does the reasoning. The CLI runs the same steps with its own model calls or a headless agent | Agent-QA always calls the model itself. IDEs just start a run ("generate test cases for PROJ-123") | Keep markdown commands; add an MCP server only for masked Jira and Confluence reads |
| Pros | Users keep their IDE and subscription. One code path for CI. Tool contracts enforce schemas, masking and the gate | Most consistent quality; one place to tune prompts; easiest to measure | Least work; reuses the branch |
| Cons | Quality still varies with the host's model in IDE mode; two runtimes to test | Every user needs an API key, even in the IDE; it ignores "user picks the IDE"; Copilot users pay twice | Fixes masking only. No enforcement, harness or real CI. Keeps pains 1 to 3 |
| Effort | Medium-high (fits the 375–560 h estimate) | Medium | Low |
| Risk | Medium: host differences in MCP support | Medium: adoption | High: does not meet the goal |
| Fit with goal | Full | Partial (breaks the host choice) | Poor |

### A2. Where masking happens. Two options; I recommend A

- **A. Mask on the way in, with a local token vault (recommended).** Every connector, including Salesforce page snapshots, passes data through the gateway. Names, emails and similar values become tokens such as `<PERSON_3>`. The vault mapping tokens to real values stays on the machine. It is used only when writing back to the customer's own systems (Xray, test code), and that step can be switched off. Pro: generated tests can still use realistic values where needed. Con: the vault is sensitive data at rest and must be protected and expire.
- **B. Mask permanently, no vault.** Simpler and safer: nothing can be re-identified. Con: generated tests and Xray cases contain placeholders that someone must fill in, which works against the 95% "kept without edit" target.

### A3. What the artifact store is. Two options; I recommend A

- **A. Typed JSON files in the repo, with rendered views (recommended).** Each run writes `.agent-qa/runs/{run-id}/` with validated JSON as the source of truth, plus generated markdown, CSV and Confluence files for people. It is easy to review in git, easy to diff, and needs no server.
- **B. Local SQLite database.** Better for traceability queries and history, but hard to read in a pull request. It also needs migrations, and it is awkward in CI caches.

### A4. How rules are enforced. One clear answer

All writes to files, Xray, Jira and git go through Agent-QA's policy layer, which applies the write gate, deny-list, allowed paths and approvals. In CI with the pipeline runner, enforcement is complete.

In IDE mode, there is an honest limit: the host agent still has its own file tools. So `agent-qa init` also writes each host's own permission settings, such as Claude Code permission rules and the Copilot and Cursor equivalents, to deny the same paths. I recommend this. Do you agree?

### A5. How browser work runs. One clear answer

Agent-QA drives the browser with the Playwright library from inside its automation engine, instead of shelling out to `playwright-cli`. Accessibility snapshots come from Playwright's own `ariaSnapshot()`. This removes the deprecated dependency, and every snapshot passes through masking. I recommend this. Do you agree?

**What the current `@playwright/cli` is (checked on npm, 1 Nov 2026).** It is version 0.1.x. It ships only a command-line binary plus agent "skills", with no programmatic API. It depends on an alpha build of Playwright (`1.65.0-alpha-2026-10-30`). Its README pitches it to coding agents: it writes page snapshots to files instead of putting them straight into the model's context, and the agent reads them when it needs to.

|  | A. Playwright library inside Agent-QA (recommended) | B. Agent-QA runs `@playwright/cli` as a subprocess | C. The host agent runs `@playwright/cli` itself (as on the branch) |
| --- | --- | --- | --- |
| Masking | Guaranteed: snapshots pass through the gateway before any model sees them | Possible: Agent-QA reads the snapshot files and returns masked versions | Broken: the agent reads raw Salesforce pages, which may contain personal data |
| Works in CI runner | Yes, same code | Yes, through text output parsing | Only with a headless agent; the pipeline runner can't use it |
| Stability | Stable Playwright releases, same version as the host test repo, so locators behave the same in exploration and in tests | Pre-1.0 CLI on alpha Playwright; output format can change; may differ from the host repo's version | Same as B |
| What you build | Session handling, snapshot-to-locator mapping, snapshot diffing (about 10–20 extra hours, my estimate) | A wrapper and an output parser | Nearly nothing |
| Enforcement | Agent-QA decides every navigation and click | Agent-QA decides every command | The agent can do anything the CLI allows |
| Fit with goal | Full | Acceptable fallback | Fails the masking constraint |

The deciding factor is masking. Whoever drives the browser sees the page. With A or B, that is Agent-QA's code. With C, it is the model. Between A and B, A avoids depending on a pre-1.0 tool built on alpha Playwright, and it keeps exploration on the same Playwright version as the tests it produces. B is a reasonable fallback if session handling turns out costly.

## 2. Technical stack

I recommend TypeScript on Node.js for the whole core. The deciding fact is that two of the six capabilities edit TypeScript test code. Reviewing, refactoring and checking that code needs the TypeScript compiler, ESLint and Playwright's Node runtime, so a Python core would still need Node next to it.

### S1. Language. Two options; I recommend TypeScript

|  | TypeScript on Node.js 20+ | Python 3.12+ |
| --- | --- | --- |
| Editing generated Playwright TS | Native: `ts-morph` and the TypeScript compiler API for review and refactor; runs `tsc` and ESLint in-process | Needs a Node toolchain beside it, so two runtimes to install |
| Playwright | Same library and version as the host test repo | Python Playwright exists, but generated code is TS, so the two can drift |
| MCP server | Official TypeScript SDK, the reference implementation | Official Python SDK, also mature |
| Personal-data detection | Weaker: no mature equivalent of Presidio (see S2) | Strong: Microsoft Presidio with spaCy NER in many languages |
| Model providers | Vercel AI SDK: Anthropic, OpenAI, OpenRouter, and any OpenAI-compatible endpoint such as a LiteLLM proxy | LiteLLM natively; Pydantic for structured output |
| Install for users | `npx agent-qa init`; Playwright users already have Node | `pipx install` plus Node anyway |
| Your preference | Yes | Acceptable |

Python is better only at personal-data detection, and S2 offers a way around that. Everything else favors TypeScript or is a tie.

### S2. Masking engine. Three options; I recommend C

- **A. Presidio as a Python sidecar.** Best detection of names and addresses in free text, in many languages. But it brings back a second runtime and a heavier install, which is your pain 1.
- **B. All in TypeScript: patterns plus a local NER model** (for example an ONNX model through `transformers.js`). One runtime. Free-text name detection is weaker, and the model download is large. I have not tested its quality, so this is an assumption to verify.
- **C. Field-aware masking in TypeScript, plus optional Presidio (recommended).** Most personal data in Jira and Salesforce sits in typed fields: assignee, reporter, Contact name, Email and Phone fields. Agent-QA masks those by field type, which is exact. Free text gets pattern detectors (emails, phones, IBANs, national IDs) and a configurable list of names taken from those same fields. Teams that need stronger free-text NER can enable a Presidio container. This gives a light default install and a path to stricter compliance.

### S3. Libraries. One recommended set; tell me if any is a problem

| Concern | Recommendation |
| --- | --- |
| MCP server | `@modelcontextprotocol/sdk` |
| Schemas and structured output | `zod`, exported to JSON Schema for MCP tools and for the artifact files |
| Model calls (pipeline runner) | Vercel AI SDK (`ai`) with Anthropic, OpenAI, OpenRouter and OpenAI-compatible (LiteLLM) providers |
| Headless agents in CI | Spawn Claude Code (`claude -p`) or Copilot CLI with an MCP config that points at Agent-QA's server |
| Jira, Confluence, Xray Cloud | Thin typed clients on `fetch` for Jira REST v3, Confluence v2 and the Xray Cloud API. Small surface, easy to mask at one point |
| Git hosts | `@octokit/rest`, `@gitbeaker/rest`, `azure-devops-node-api` behind one adapter interface |
| Browser and tests | `playwright`, matched to the host repo's version |
| TS code analysis and edits | `ts-morph` |
| Token vault | Node `crypto` (AES-256-GCM), with the key in the OS keychain; expiry per run |
| CLI | `commander` |
| Tests and harness | `vitest` for unit tests; the harness runs real pipelines against fixtures and your sandbox org |
| Build and release | `tsup`, `changesets`, GitHub Actions; published to npm |
| License | Apache-2.0 (patent grant, common for developer tools) or MIT. Your choice; I lean Apache-2.0 |

## 3. Design

The design turns each old command into a typed workflow. A workflow is a series of steps that fetch masked data, ask a model for output matching a schema, validate it, and write it through the policy layer. The same steps run whether an IDE host or the pipeline runner drives them.

### D1. Code organization. Two options; I recommend A

- **A. One npm package, `agent-qa`, with enforced internal modules (recommended).** Modules: `core` (config, runs, policy, vault), `connectors` (atlassian, xray, git, salesforce), `masking`, `workflows`, `automation`, `mcp`, `cli`, `harness`. Import rules are checked by lint, so it can be split later. One version and one release, which suits a solo maintainer.
- **B. A monorepo of packages** (`@agent-qa/core`, `@agent-qa/connector-gitlab`, and so on). Better for outside contributors and plugins. But there are more releases to manage, and it is premature before anyone else contributes.

### D2. How a workflow is defined. Three options; I recommend B

- **A. Declarative YAML workflows plus prompt files.** Easy to read, but logic leaks into YAML, and it is hard to test or type.
- **B. Workflows in TypeScript, prompts in separate template files (recommended).** Each step is a typed function: fetch, mask, render prompt, call or hand off to the model, validate with zod, persist. Prompts live as versioned `.md` templates next to the step, so prompt tuning needs no code change. Users override a prompt by placing a file with the same name in `.agent-qa/prompts/`, which replaces today's `custom-templates/`.
- **C. Autonomous agent with tools and a goal.** Flexible, but it brings back the model-dependent quality you want to escape, and it is hard to measure.

### D3. Artifact data model. One recommended design

All artifacts are zod schemas, saved as JSON in `.agent-qa/runs/{run-id}/` and rendered to markdown, CSV and Confluence. Each artifact stores a `sourceHash` of its inputs. Regeneration compares hashes instead of timestamps, which removes the time-zone problem. Run IDs are `{date}-{context}-{short-id}`, which ends the same-day collision.

| Entity | Key fields |
| --- | --- |
| Run | id, workflow, inputs, model or host, started and finished, status, artifact list |
| Requirement | key, summary, description and acceptance criteria (masked), language, links, epic, sourceHash |
| TestCase | id `TC-{KEY}-{NNN}`, title, priority P1–P4, type, preconditions, steps (action, data, expected), requirement key, labels, Xray key once pushed |
| Document | type (strategy, plan, charter, risk register, release notes, and others), sections, source requirements, language |
| Exploration | test case id, steps walked, snapshots (masked), ranked locators with provenance, waits observed, unverifiable steps |
| TestScript | spec path, page objects, locators used and their source, last run result, stability count |
| Finding | source (debug, review or audit), file and line, severity, failure class, proposed fix, applied or not |
| FrameworkProfile | project root, commands, layout, naming, fixture import, locator ranking, auth path, reviewed flag |

### D4. MCP tool design. Two options; I recommend A

- **A. Step protocol (recommended).** The server exposes a small set of tools: `workflow_start`, `workflow_next` and `workflow_submit`, plus read-only data tools such as `get_requirement` and `get_snapshot`. `workflow_next` returns the step's instructions, its masked inputs and its output schema. `workflow_submit` validates the host model's answer and rejects it with errors if it does not match. The host loops until the workflow ends. Each workflow is also exposed as an MCP prompt, so hosts that support it show it as a slash command. This gives the IDE path the same steps as the CLI path, which is the point of A1.
- **B. Free toolbox.** Data and write tools, plus one guidance prompt per workflow; the host model decides the order. Less code, but each host behaves differently, so the harness results do not transfer between hosts.

### D5. CLI, config and approvals. One recommended design

- **Commands:** `agent-qa init` (config, host MCP setup, host permission rules), `agent-qa run <workflow> <input>`, `agent-qa mcp` (serve), `agent-qa doctor` (connectivity and prerequisites), `agent-qa harness` (run the evals), `agent-qa profile` (discover or refresh the framework profile).
- **Driver flag:** `--driver api|claude|copilot` with `--model`. Allowed providers and models come from an allowlist in config.
- **Config:** one `agent-qa.yaml`, validated by zod, with a published JSON Schema for editor autocompletion. Secrets come only from environment variables or the OS keychain, never from the file.
- **Approvals:** in the IDE, the host asks you in chat at each gate. In CI, Agent-QA never writes to the test repo directly. It pushes a branch and opens a pull or merge request through the git adapter. Reviewing that request is the approval.
- **Exit codes and reports:** non-zero on failure, plus a JSON report and a markdown summary for CI artifacts.

## 4. Features

You want every capability, so this area is not about dropping features. It is about turning 24 commands into fewer, sturdier workflows, and adding what the goal needs but nobody has built yet.

### Current commands in the new design

| Today (24 commands) | New design |
| --- | --- |
| `analyze-requirements` | Workflow `requirements` |
| `generate-test-cases` | Workflow `test-cases`, with Xray push (F3) |
| `generate-test-strategy`, `-test-plan`, `-test-charter`, `-risk-register`, `-test-data`, `-traceability-report` | One workflow `document --type …`, one schema and prompt per type (F1) |
| `generate-gherkin` | Workflow `gherkin` |
| `generate-api-tests`, `generate-accessibility-tests` | Workflows `api-tests` and `a11y-tests` (see F4 on executable output) |
| `explore-ui`, `generate-playwright-tests`, `debug-tests` | Workflows `explore`, `scripts`, `debug` |
| `review-automation-code`, `audit-framework`, `refactor-framework` | Workflows `review`, `audit`, `refactor` |
| `analyze-commits`, `generate-release-notes` | Workflows `commits` and `document --type release-notes` |
| `publish-to-confluence` | A `--publish confluence` option on any document (F2) |
| `health-check` | `agent-qa doctor` (F2) |
| `validate-outputs` | Automatic: every artifact is validated by schema on write (F2) |
| `run-pipeline` | `agent-qa run pipeline <name>`, with pipelines defined in config (F2) |
| `regenerate` | `--changed-only` on any workflow, using `sourceHash` (F2) |

### F1. Merge the six document generators into one engine. I recommend yes

The strategy, plan, charter, risk register, test data and traceability generators all do the same thing: load requirements and test cases, fill sections, and render. One engine, with a schema and prompt per document type, cuts the code and the harness cases by about five-sixths. It also lets users add their own document type through config.

### F2. Turn utility commands into built-in behavior. I recommend yes

The changes are the ones in the table above: health check becomes `doctor`, validation happens automatically on every write, publishing becomes an option, regeneration becomes a flag, and pipelines become config. The output index and post-generation hooks also become automatic. This removes six commands without losing any capability.

### F3. New capabilities the goal needs. Tell me which to include

| Feature | Why | Effort (my estimate) |
| --- | --- | --- |
| Xray Cloud push: create and update tests, link to requirements, find duplicates first | Requested scope; avoids CSV imports | 15–25 h |
| Salesforce pack: Lightning locator rules, shadow DOM, spinner and toast waits, Visualforce iframes, sandbox login helper | The biggest lever for the 90% runnable target | 25–40 h |
| Masking report per run: what was masked, by which rule | Evidence for GDPR, PIPL and CCPA audits | 5–8 h |
| Cost and token report per run | Users choose their own models; they need to see the cost | 4–6 h |
| Harness dashboard: kept rate and runnable rate over time | Shows progress toward 95% and 90% | 8–12 h |

I recommend all five. The first two are required by the goal, and the other three are cheap.

### F4. Remove or reshape. Three proposals

- **Drop TestRail export.** TestRail is not in your fixed integrations, and Xray is. This saves the code and the harness cases. I recommend dropping it.
- **Drop Confluence file export and keep only direct publishing.** The `.confluence.html` files exist only because publishing used to go through the model. Agent-QA now publishes through its own connector. I recommend dropping the export.
- **Make API and accessibility tests executable.** Today they are markdown specifications. They could generate Playwright API tests and `@axe-core/playwright` checks that run in the same suite. This adds about 15–20 hours, but it turns two document types into working tests. Your choice; I lean yes.

## 5. Migration approach

With the features settled, the scope is now about 450 to 670 hours against 680 available. So the migration plan must protect two things. Your two users keep working throughout, and the riskiest parts are proven early enough to change course.

### M1. Overall approach. Three options; I recommend A

- **A. Clean rewrite beside a frozen v1 (recommended).** v1, the prompt pack, is tagged and kept installable. v2 is built from scratch in TypeScript. Users switch per workflow once v2 matches v1 for it, starting with requirements and test cases, the two they use. This gives a clean architecture, a working fallback, and no need to keep old and new in sync.
- **B. Strangler.** Build the core and MCP server first, then rewrite v1's phase files one by one to call the new tools until nothing is left. Users get masking early. But it keeps the prompt pack alive for months, and you would maintain two worlds in one tree.
- **C. Big-bang replacement.** Delete v1 and build v2 in place. It is simplest, but users have nothing working until v2 is ready.

### M2. What to do with PR #3. Two options; I recommend A

- **A. Merge it as the final v1 and tag `v1.0.0` (recommended).** It is your documented baseline. Its automation prompts give your users something to try while v2 is built. Its design spec is the reference for v2's automation workflows. Merging changes `master`, so this is your call.
- **B. Close it and keep the branch as reference only.** v1 stays as master is today, without the automation commands.

### M3. Where v2 lives. Two options; I recommend A

- **A. Same repository (recommended).** Keep `taouani/agent-qa`, its name and its history. Move v1 to a `v1` branch with the tag. The default branch becomes the TypeScript project. The npm name `agent-qa` is already taken by an unrelated project (version 0.2.5, checked 1 Nov 2026). So the package needs a scope, such as `@taouani/agent-qa`, or a new name. Either way, the command can still be `agent-qa`.
- **B. New repository.** A clean start, but you lose the history and the existing links in the install scripts.

### M4. Build order. Two options; I recommend A

- **A. Harness first, then vertical slices (recommended).** First the skeleton, CI and harness. Then one complete path end to end: requirements, test cases, Xray, with masking, on the CLI and Claude Code. Then each next slice adds one capability across all layers. The riskiest parts get proven early: masking, Salesforce exploration, and the step protocol on each host. And the harness measures every slice from the start.
- **B. Layer by layer.** All connectors first, then masking, then all workflows, then all hosts. Each layer is finished cleanly, but nothing works end to end until late, so problems show up when there is little time left.

The week-by-week roadmap for M4 goes in the Phase 5 plan.

## Decision log

| # | Decision | Choice | Reasoning | Date |
| --- | --- | --- | --- | --- |
| G1 | Release scope and date | Full scope, first release by 28 February 2027 | Phase 3 estimate is 375–560 hours. At 40 hours a week, 28 February covers the high end plus about 3 weeks of buffer | 1 Nov 2026 |
| A1 | Overall shape | A. One core, two front doors (MCP server and pipeline runner) | Keeps "user picks the IDE", gives CI one code path, and enforces schemas, masking and the gate through tool contracts | 1 Nov 2026 |
| A2 | Where masking happens | A. Tokenize on the way in, with a local vault; restore real values only when writing to the customer's own systems (can be turned off) | Protects every model call and keeps realistic values for the 95% target | 1 Nov 2026 |
| A3 | Artifact store | A. Typed JSON per run in `.agent-qa/runs/`, plus rendered markdown, CSV and Confluence files | Reviewable in git, no server, validated by schema | 1 Nov 2026 |
| A4 | Rule enforcement | Policy layer in Agent-QA, plus host permission settings written by `agent-qa init` | Complete in CI; best available in IDE mode, where hosts keep their own file tools | 1 Nov 2026 |
| A5 | Browser engine | A. Playwright library inside Agent-QA | Guarantees masking of page snapshots, works in the CI runner, and uses the host repo's stable Playwright version instead of a pre-1.0 CLI on an alpha build |  |

| # | Decision | Choice | Reasoning | Date |
| --- | --- | --- | --- | --- |
| S1 | Language | TypeScript on Node.js 20+ | Review and refactor edit TS test code, so a Node runtime is needed anyway; one runtime; your preference | 1 Nov 2026 |
| S2 | Masking engine | C. Field-aware masking in TS, plus pattern detectors; Presidio container optional | Most personal data sits in typed Jira and Salesforce fields; keeps a light install with a path to stricter detection | 1 Nov 2026 |
| S3 | Libraries | Proposed set accepted (MCP SDK, zod, Vercel AI SDK, Playwright, ts-morph, vitest, tsup, changesets) | Mainstream, maintained, TypeScript-first | 1 Nov 2026 |
| S4 | License | Apache-2.0 | Includes a patent grant; common for developer tools | 1 Nov 2026 |

| # | Decision | Choice | Reasoning | Date |
| --- | --- | --- | --- | --- |
| D1 | Code layout | A. One npm package `agent-qa` with lint-enforced modules | One version and release for a solo maintainer; can split later | 1 Nov 2026 |
| D2 | Workflow definition | B. TypeScript steps; prompts in versioned template files, overridable from `.agent-qa/prompts/` | Typed and testable; prompts tunable without code | 1 Nov 2026 |
| D3 | Data model | zod entities in JSON, `sourceHash` for regeneration, run IDs `{date}-{context}-{short-id}` | Validation, no time-zone bug, no same-day collisions | 1 Nov 2026 |
| D4 | MCP tools | A. Step protocol (`workflow_start`, `workflow_next`, `workflow_submit`) plus read-only data tools and MCP prompts | IDE hosts run the same steps as the CLI, so harness results apply to both | 1 Nov 2026 |
| D5 | CLI, config, approvals | `init`, `run`, `mcp`, `doctor`, `harness`, `profile`; `agent-qa.yaml`; secrets from env or keychain; CI writes only through a pull or merge request | Simple setup, no secrets in files, review is the approval in CI | 1 Nov 2026 |

| # | Decision | Choice | Reasoning | Date |
| --- | --- | --- | --- | --- |
| F1 | Document generators | Merge six into one `document` engine with a schema and prompt per type | Less code and fewer harness cases; users can add types | 1 Nov 2026 |
| F2 | Utility commands | Become built-in behavior: `doctor`, validation on write, `--publish`, `--changed-only`, pipelines in config | Six fewer commands, no lost capability | 1 Nov 2026 |
| F3 | New capabilities | All five: Xray Cloud push, Salesforce pack, masking report, cost report, harness dashboard | Two are required by the goal; three are cheap | 1 Nov 2026 |
| F4 | Remove or reshape | Drop TestRail export; drop Confluence file export (keep publishing); make API and accessibility tests executable | Xray is the fixed tool; publishing is direct; executable tests add real value | 1 Nov 2026 |

| # | Decision | Choice | Reasoning | Date |
| --- | --- | --- | --- | --- |
| M1 | Migration approach | C. Big-bang: v2 replaces v1 in place | Your choice. It avoids running two systems; v1 stays installable from its tag (M2) | 1 Nov 2026 |
| M2 | PR #3 | A. Merge as the final v1 and tag `v1.0.0` | Preserves the documented baseline and gives users a fallback | 1 Nov 2026 |
| M3 | Where v2 lives | A. Same repo; v1 on a `v1` branch; npm package under a scope (name `agent-qa` is taken) | Keeps name, history and links | 1 Nov 2026 |
| M4 | Build order | A. Harness first, then vertical slices; first IDE host is **Copilot** (VS Code agent mode), not Claude Code | Proves risky parts early; Copilot first per your preference | 1 Nov 2026 |
