# Agent-QA — Live Automation Capabilities

**Date:** 2026-09-13
**Status:** Approved design, ready for implementation planning
**Scope:** Sub-project 1 of 3

---

## Context

Agent-QA generates QA deliverables (requirements analysis, test cases, strategies, Gherkin,
Playwright specs) from Jira and Confluence. It is pure markdown and YAML: commands are
multi-phase prompt instructions, and every output is written into a dated folder under
`agent-qa/YYYY-MM-DD-{context}/`.

It has never read or executed real test code. `generate-playwright-tests` writes specs and Page
Objects blind — it infers locators from test-case prose and emits `TODO` comments where it
cannot know the real DOM. The generated suite is a starting point, not a runnable one.

A separate, untracked body of work exists in `Improvements/`: a GitHub Copilot artifact set
(5 agents, 10 skills, 3 prompts, ~5,400 lines) built for one specific repository —
`taf-techcare-base-automation`, Playwright + TypeScript, targeting Salesforce CX and
Microsoft Dynamics 365. It contains capabilities Agent-QA lacks entirely: live UI exploration
that harvests real locators, failure classification and stabilization, automation code review,
and framework-level architecture audit with guarded refactor execution.

That work is not portable as-is. It is Copilot-format (`*.agent.md`, `SKILL.md`, `*.prompt.md`)
with Copilot tool IDs (`ado/wit_get_work_item`, `execute/runInTerminal`), and its knowledge is
bound to one framework's directory layout, fixture API, and application archetypes.

**Intended outcome:** Agent-QA absorbs those capabilities as generic, framework-agnostic
commands. The framework-specific knowledge moves out of the prompts and into a generated,
human-reviewed profile of whatever repository Agent-QA is installed into. The TODO-locator
problem is solved for teams that opt in, and nothing changes for teams that do not.

### Decisions taken during design

| Decision | Choice |
|---|---|
| Genericity | Genericize; framework specifics live in config + a generated profile |
| Capability scope | All four: UI exploration, debug/stabilize, code review, architecture audit + refactor |
| Target code | The host project's real Playwright repository |
| Browser mechanism | `playwright-cli` only; no Playwright MCP dependency |
| Command shape | Six separate commands with approval gates between them |
| Convention learning | Discover once, cache as a reviewable profile |

### Out of scope for this sub-project

Deferred from `Improvements/`, to be reconsidered after implementation: Azure DevOps **test
work item** retrieval (Agent-QA's ADO support is git-only today), the test-input normalizer
(overlaps `analyze-requirements`), the git-commit skill, and AI-artifact self-sync.

Sub-projects 2 and 3, each getting its own design cycle:

2. Refactor and improve the seven existing agents in `agent-qa/agents/`.
3. Automated upload of generated test cases and Gherkin features into Jira Xray.

---

## Architecture

Agent-QA gains one new durable artifact and one new operating mode.

### The framework profile

`agent-qa/framework-profile.md` — generated on first use, edited and approved by an engineer,
then read by all six commands. It records:

- `playwright_project_root`, plus run, debug, and report commands
- Page Object directory, class naming convention, fixture import shape
- Observed locator priority, ranked as the repository actually uses them
- Auth-state path and TTL, base URLs per environment
- Application archetype notes — the spinner, overlay, and dialog waits the repo already handles

It lives at the repository root beside `config.yml`, not inside a dated output folder, because
it is durable state across runs. `scripts/project-update.sh` must never overwrite it, the same
treatment `agent-qa/custom-templates/` already receives.

Discovery runs through a new shared phase snippet,
`agent-qa/commands/common/discover-framework-profile.md`, sitting beside the existing
`generate-output-index.md` and `execute-post-hooks.md`. Every new command's first phase reads
the profile if present; otherwise it runs discovery, writes the profile, and stops for review.
Agent-QA never proceeds on unreviewed inference.

### New rule

`agent-qa/rules/automation-conventions.md` — generic and framework-free, extracted from the
`Improvements/` skills: the locator priority ladder, allowed fixes versus never-apply fixes,
severity levels, flakiness patterns, and stop conditions.

### New agents

Added to `agent-qa/agents/`, matching the shape of the existing seven: `ui-explorer.md`,
`playwright-debugger.md`, `automation-reviewer.md`, `framework-architect.md`.

### Two write zones

| Zone | Path | Writers | Gate |
|---|---|---|---|
| Deliverables | `agent-qa/YYYY-MM-DD-{context}/`, with new subfolders `ui-snapshots/`, `reviews/`, `debug/` | all commands | none |
| Host source | `playwright_project_root` from the profile | `generate-playwright-tests`, `debug-tests`, `review-automation-code` (fix mode), `refactor-framework` | explicit per-run approval, never automatic |

Reports stay in Agent-QA's dated-folder convention. What `Improvements/` writes to
`automation-assets/reviews/architecture/review_DDMMYYYY.md` becomes
`agent-qa/YYYY-MM-DD-{context}/reviews/architecture-review.md`, so `qa-conventions.md` stays
coherent and `generate-output-index.md` keeps working unchanged.

---

## Commands

Six commands, following the existing multi-phase pattern. Each needs its twin entry point in
`agent-qa/ide/claude/commands/agent-qa/`.

### 1. `explore-ui` — new, 5 phases

The missing link that solves the TODO-locator problem.

```
1-find-and-select-test-cases.md         selection pattern reused from generate-gherkin phase 1
2-resolve-profile-and-session.md        profile + auth state: exists and age <= TTL -> state-load;
                                        otherwise open --headed, pause for manual login, state-save
3-walk-and-snapshot.md                  per step: goto/click -> snapshot --filename=...yml
                                        identical-snapshot check -> three-tier recovery
4-extract-locators-and-observations.md  parse accessibility YAML into ranked locators, required
                                        waits, exact labels, validation and confirmation messages
5-write-exploration-report.md           -> ui-snapshots/{TC-ID}/*.yml + ui-snapshots/exploration.md
                                        GATE: engineer approves before any scripting
```

### 2. `generate-playwright-tests` — existing command, 4 phases upgraded to 5

- Phase 2 consumes `ui-snapshots/exploration.md` when present and produces real locators. When
  absent, behaviour is unchanged from today, so no existing user regresses.
- Phases 3 and 4 read the profile for Page Object directory, class naming, and fixture import,
  so output matches the host repository instead of a generic template.
- New `5-run-and-stabilize.md`: execute via the profile's run command, hand failures to the
  debug classifier, apply stop conditions.

### 3. `debug-tests` — new, 5 phases

```
1-select-failing-tests.md   last HTML/JSON report, an explicit spec path, or a tag
2-reproduce.md              re-run with retries disabled, single worker, untruncated output
3-classify-failure.md       real defect | selector | synchronization | data | environment | flake
                            a real defect stops the command; fixing the test is forbidden
4-apply-allowed-fixes.md    GATE per fix. Allowed: locator swap sourced from snapshots,
                            web-first assertions, proper wait conditions, fixture reuse.
                            Forbidden: hard sleeps, retry-count bumps, skip or soft-assert masking
5-verify-and-report.md      re-run to the configured stability count -> debug/report.md
```

### 4. `review-automation-code` — new, 4 phases, file-scoped

```
1-select-files.md                     git diff against base branch, explicit paths, or glob
2-classify-and-load-conventions.md    spec | page object | fixture | service | util, + profile + rules
3-review.md                           checklist per file type, severity-tagged findings
4-report-and-optional-fix.md          -> reviews/code-review.md, GATE, then apply
```

### 5. `audit-framework` — new, 4 phases, repository-scoped

Explicitly distinct from `review-automation-code`. That command reviews selected files; this one
assesses the framework as a whole.

```
1-scope-and-inventory.md    map layers, counts, entry points
2-analyze.md                eight axes: architecture, design patterns, duplication, locator
                            strategy, synchronization, test data, naming, scalability
3-score-and-prioritize.md   impact against risk
4-write-audit-report.md     -> reviews/architecture-review.md
                            GATE: engineer reads before any planning
```

### 6. `refactor-framework` — new, 4 phases

```
1-load-audit-and-plan.md      latest architecture-review.md -> dependency-aware phased plan
                              -> reviews/refactor-plan.md   GATE
2-select-phase-and-tasks.md   numbered task list; engineer chooses which tasks run
3-execute-with-validation.md  per task: edit -> tsc + lint + targeted test.
                              The first validation failure stops the phase. Never skip,
                              never continue past an error
4-report-and-commit.md        change report; optional commit per phase via hooks.post_generate
```

### Dependency chain

```
generate-test-cases
  └── explore-ui (5) ──GATE──> generate-playwright-tests (5, upgraded)
                                      └── debug-tests (5)

independent, operate on the host repository:
  review-automation-code (4)
  audit-framework (4) ──GATE──> refactor-framework (4)
```

`explore-ui` is optional. Skipping it leaves `generate-playwright-tests` behaving exactly as it
does today.

---

## Configuration

Only what discovery cannot infer is added to `agent-qa/config.yml.template`:

```yaml
playwright_project_root: ""              # "apps/techcare-austria" or "."
browser_cli_command: "playwright-cli"    # prerequisite, probed by health-check
automation:
  allow_source_edits: false              # master switch for the host-source write zone
  auth_state_ttl_minutes: 60
  stability_runs: 3                      # re-runs required before a fix is called stable
```

`playwright_base_url` already exists and is reused.

### Prerequisite

`playwright-cli` is a public npm package (verified at version 0.262.0). It is a stateful session
CLI — `open`, `state-load`, `state-save`, `goto`, `snapshot --filename=*.yml`, `click <ref>`,
`evaluate` — that keeps one browser alive across invocations and emits accessibility-tree YAML.
It is not `npx playwright`. Both are needed: the session CLI for exploration, the standard
Playwright runner for suite execution.

---

## Safety

### Host-source write zone

- `allow_source_edits: false` is the default. All six commands run report-only until it is
  deliberately enabled.
- Every write outside `agent-qa/` must satisfy all three conditions: the profile is resolved,
  the path resolves under `playwright_project_root`, and per-run approval was given. If any one
  is missing, the command refuses. It does not degrade silently.
- Deny-list enforced regardless of the switch: `.env*`, `**/.auth/*.json`, `node_modules/`, CI
  configuration, and `playwright.config.ts` — changes to the Playwright config are reported,
  never applied automatically.
- Auth-state files: existence and modification time only. Contents are never read into context
  and never copied into deliverables. `health-check` warns when `.auth/` is not gitignored.
- `refactor-framework` takes a `git stash` checkpoint before each task. The first validation
  failure stops the phase and offers a revert.

### Failure modes

| Condition | Behaviour |
|---|---|
| `playwright-cli` not on PATH | `health-check` fails with the install command; `explore-ui` refuses; `generate-playwright-tests` falls back to today's TODO-locator mode |
| `framework-profile.md` missing | discovery runs, writes the profile, stops for review |
| Profile stale against the repository | warn and offer `--refresh`, accepted as an argument by any of the six commands and handled by the shared discovery snippet; never overwrite engineer edits automatically |
| Auth state missing or expired | open a headed browser, print the manual-login instruction, wait. Credentials are never guessed or stored by Agent-QA |
| Application unreachable, or a step unverifiable | mark the step `unverifiable` in the exploration report; never invent a locator |
| Snapshot identical after an action | three-tier recovery: alternative key, JS-forced click, then ask the engineer. Record the method that worked as a warning note |
| Failure classified as a real defect | `debug-tests` stops and reports the defect |
| No audit report present | `refactor-framework` refuses and points at `audit-framework` |

---

## Existing files to change

Beyond the new command, rule, agent, and snippet files:

- `agent-qa/rules/qa-conventions.md` — add the `ui-snapshots/`, `reviews/`, and `debug/` subfolders
- `agent-qa/rules/output-standards.md` — file names for `exploration.md`, `architecture-review.md`,
  `refactor-plan.md`, `code-review.md`, `debug/report.md`
- `agent-qa/commands/health-check/1-validate-configuration.md` and `2-test-mcp-connectivity.md` —
  probe `playwright-cli`, `playwright_project_root`, profile freshness, and `.auth/` gitignore status
- `agent-qa/commands/validate-outputs/2-validate-deliverables.md` — recognise the new deliverable types
- `agent-qa/config.yml.template`, `scripts/project-install.sh`, `scripts/project-install.ps1` —
  bash and PowerShell parity is required
- `scripts/project-update.sh` — add `framework-profile.md` to the never-overwrite list
- `CLAUDE.md` — 19 commands becomes 24, plus the new chain, rule, agents, and second write zone
- `README.md`, `USER_GUIDE.md`, `INSTALLATION.md` — document the `playwright-cli` prerequisite

---

## Implementation sequencing

The work is one design but not one commit. Build in this order, so each stage is independently
verifiable and the risky parts land last:

1. **Foundation** — `discover-framework-profile.md`, `automation-conventions.md`, the config keys,
   and the `health-check` probes. Nothing edits host source yet.
2. **Read-only capabilities** — `review-automation-code` and `audit-framework`. Both only read the
   host repository and write reports, so they exercise the profile with no write risk.
3. **Exploration** — `explore-ui` and the `generate-playwright-tests` upgrade. The regression gate
   in step 5 of Verification applies here.
4. **Write capabilities** — `debug-tests`, then `refactor-framework`. These carry the guarded
   source edits and land only once the foundation is proven.
5. **Documentation and installer parity** — `CLAUDE.md`, `README.md`, `USER_GUIDE.md`,
   `INSTALLATION.md`, and the PowerShell script mirror.

## Verification

The repository has no build, no linter, and no test runner. This sequence is the test plan.

1. `bash -n` every modified shell script; diff the PowerShell scripts for parity.
2. `./scripts/install-from-local.sh` into a scratch project containing a real Playwright repository.
3. `/agent-qa:health-check` — expect explicit pass or fail on `playwright-cli`, project root,
   profile, and gitignore status.
4. Trigger discovery, then read `framework-profile.md` and confirm it describes the real repository.
5. **Regression gate.** Run `/agent-qa:generate-playwright-tests` with no snapshots present and
   `allow_source_edits: false`. The generated file set, directory layout, and `TODO` locator
   comments must match what the command produces today. Capture a baseline before any change.
6. Run `/agent-qa:explore-ui` on one test case against the live application, then regenerate.
   Real locators must replace the TODO comments.
7. Break a selector deliberately. `/agent-qa:debug-tests` must classify it as a selector failure,
   fix it from the snapshot, and pass the configured stability runs.
8. **Safety gate.** Introduce a real application bug. `debug-tests` must classify it as a real
   defect and refuse to modify the test.
9. Run `/agent-qa:review-automation-code` against a git diff. Then `/agent-qa:audit-framework`
   followed by `/agent-qa:refactor-framework`: execute one phase, force a `tsc` failure, and
   confirm the phase stops and offers a revert.

Steps 5 and 8 are the two that matter most. Step 5 proves nothing regressed for existing users.
Step 8 proves the agent will not hide a product bug by editing the test that caught it.
