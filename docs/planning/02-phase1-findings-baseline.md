# Agent-QA Phase 1 findings: improve-automation-agents baseline

Nov 1, 2026 · @Tarek AOUANI

This replaces the earlier master-based Phase 1. The baseline is branch `improve-automation-agents` at `32e2aa6`.

## 0. What the branch changes

The branch adds a second product on top of the first one. Agent-QA no longer only writes QA documents. It can now read, run and edit a team's real Playwright test repository.

- **Status:** open PR #3 "Improve automation agents", not merged. It has 25 commits on top of master, written between 13 Sep 22:27 and 14 Sep 10:04 (2026).
- **Size:** 60 files, +6,605 / −53 lines. Of that, 3,717 lines are a design spec and an implementation plan in `docs/superpowers/`. The commands, rules and agents themselves add about 2,500 lines.
- **Process:** the work followed a spec, then a plan, then test-first tasks ("Superpowers" style). The plan has every task add a check to `scripts/check-repo.sh` first, then add the files that make it pass.
- **Scope:** the spec calls this "Sub-project 1 of 3". Sub-project 2 is refactoring the original seven agents. Sub-project 3 is uploading generated tests and Gherkin features into Jira Xray. Neither has started on this branch.
- **Origin:** the spec says the features were ported from an untracked `Improvements/` folder. That folder was a Copilot setup built for one repository, `taf-techcare-base-automation` (Playwright and TypeScript, testing Salesforce CX and Microsoft Dynamics 365), and was made generic here.

## 1. What it does and who it is for

Agent-QA is still a prompt pack (24 commands, 11 agents, 5 rules) that an IDE assistant follows. It now covers two jobs: planning tests from Jira, and building and maintaining the Playwright suite that runs them.

**Facts**

- **Deliverables mode** (unchanged from master): `analyze-requirements` reads Jira and Confluence. The other 18 original commands write test cases, strategies, plans, risk registers, Gherkin, Playwright drafts, release notes and other documents into `agent-qa/YYYY-MM-DD-{context}/`.
- **Live automation mode** (new): six commands work on the project's Playwright repository.
  - `explore-ui` drives a real browser through `playwright-cli` and saves accessibility snapshots. It uses them to replace the `TODO` locators that `generate-playwright-tests` used to leave.
  - `generate-playwright-tests` gains a fifth phase, `5-run-and-stabilize.md`, that runs the new specs.
  - `debug-tests` sorts each failure into one of six causes. It stops when the cause is a real product defect.
  - `review-automation-code` reviews selected files. `audit-framework` scores the whole suite on eight axes. `refactor-framework` carries out the audit's plan task by task, checking each change with `tsc`, lint and a targeted test.
- **Framework profile:** knowledge about one specific repository now lives in a generated file, `agent-qa/framework-profile.md`. An engineer must review it and set `reviewed: true` before any command uses it.
- **Safety model:** editing host code needs four things. They are `automation.allow_source_edits: true`, a reviewed profile, a path under `playwright_project_root`, and approval for that run. A deny-list (`.env*`, `**/.auth/*.json`, `node_modules/`, CI config, `playwright.config.ts`) applies regardless (`rules/automation-conventions.md`, "Write Gate").

**Assumptions**

- The audience has grown from QA analysts and managers to test automation engineers who maintain a Playwright and TypeScript suite.
- The first real target is the TechCare automation repository for Salesforce and Dynamics 365. The spec's example `playwright_project_root: "apps/techcare-austria"` points to a monorepo with one app per country or market.

## 2. Architecture map

There is still no Agent-QA process at run time. The assistant follows prose and calls tools. The branch adds three things it can reach: a browser session, a profile file, and the host test repo.

&#91;embedded content: Agent-QA on improve-automation-agents · deliverables plus live automation\]

- **Unchanged:** commands, rules, framework, formats and installers work as on master. The output folder is still the only link between deliverable commands.
- **New shared step:** `commands/common/discover-framework-profile.md`. It samples up to five specs and five page objects, plus `playwright.config.ts` and `package.json`, and writes the profile with `reviewed: false`. Then it stops. Anything it cannot observe goes under `## Unverified`.
- **New rule:** `rules/automation-conventions.md` defines locator priority, allowed and forbidden fixes, failure classes, severity levels, stop conditions and the write gate.
- **Command chain:** `generate-test-cases` → `explore-ui` → approval → `generate-playwright-tests` → `debug-tests`. Separately, `review-automation-code` stands alone, and `audit-framework` → approval → `refactor-framework`.
- **Reads vs writes:** review, audit and discovery read the host repo without the gate. Only `generate-playwright-tests` (phase 4), `debug-tests`, `review-automation-code` (fix mode) and `refactor-framework` write there. `explore-ui` may write the auth-state file, at the path recorded in the profile.
- **Test harness:** `scripts/check-repo.sh` (327 lines) checks that phase references resolve, that each command has its Claude twin, and that the write gate and deny-list wording appear in each command that writes.

## 3. Current tech stack

The core is still markdown, YAML and shell. The branch adds a dependency on the host project's Node and Playwright toolchain.

| Layer | What is used | Where |
| --- | --- | --- |
| Logic | Natural-language prompts, one file per phase (24 commands) | `agent-qa/commands/` |
| Runtime | The user's IDE assistant and whatever model it runs; not pinned | user's IDE |
| Integrations | Atlassian MCP; GitLab, GitHub or Azure DevOps MCP | `rules/mcp-usage.md`, `framework/` |
| Browser automation (new) | `playwright-cli` stateful session CLI: `open`, `state-load`, `state-save`, `goto`, `snapshot`, `click` | `explore-ui`, `health-check` |
| Test execution (new) | Host repo's Playwright runner, `tsc`, lint, as recorded in the profile | `framework-profile.md` |
| Config | YAML; five new keys, backfilled into old installs by `backfill_automation_config` | `config.yml.template`, `scripts/common-functions.sh` and `.ps1` |
| State | Dated output folders, plus the durable `agent-qa/framework-profile.md` and browser auth state | user's project |
| Verification (new) | `scripts/check-repo.sh`: grep-based structural checks, run by hand | `scripts/` |
| Distribution | Bash and PowerShell installers from GitHub `master` | `scripts/` |
| CI, releases, license | None | repo root |

## 4. What I am confident about vs. unsure about

**Confident (read directly on the branch)**

- The design is careful about safety and honesty on paper. Examples: refuse on an unreviewed profile, never guess an unobservable field, stop on a real defect, ban sleeps and retry bumps, never report a spec as passing without `stability_runs`. `refactor-framework` explicitly avoids `git stash` and requires a clean tree.
- Every safety rule is prose that the model is asked to follow. No tool, permission setting or hook enforces the write gate or the deny-list. Claude Code permissions could do this, but the branch does not use them.
- `check-repo.sh` passes on the branch, but it checks that files and phrases exist (for example, that a phase "names the deny-list"). It does not check behavior, and nothing runs it automatically.
- The npm package named in the install instructions, `playwright-cli`, is marked deprecated on npm ("use @playwright/cli instead"). Its last release was in Feb 2026. The new `@playwright/cli` package installs the same `playwright-cli` binary name, so the config default still works if the newer package is installed.
- The four new agents, like the first seven, are not referenced by any command.

**Unsure (needs your input or a live run)**

- Whether the nine manual verification steps in the spec were ever run against a real app. The repo holds no record of a run, so I don't know whether `explore-ui` and `debug-tests` work end to end. The two that matter most are the no-regression gate and the "real defect is not hidden" gate.
- Whether the `snapshot`, `click <ref>` and `state-load` commands the phases describe still match the current `@playwright/cli`. They were checked against the deprecated 0.262.0.
- Whether PR #3 should be merged as is, or treated as a starting point to rework. You said this branch is the baseline, so I assume it will land in some form.
- Who uses it today. Is it you alone, one TechCare team, or several? Do they use Claude Code, Copilot or both? The original `Improvements/` work was Copilot-only.
- How well the generated deliverables and the live fixes actually turn out. There are still no recorded real outputs.

## 5. Unfinished, broken, unused or contradictory

The branch fixed documentation drift and added a structural test harness. The deeper problems on master remain. The new risk is that the prompts can now edit real code, and only prose guards that. The table is ordered by impact.

| Finding | Status | Evidence |
| --- | --- | --- |
| Safety gate and deny-list are not enforced by any tool | New | Gate defined in `rules/automation-conventions.md` "Write Gate"; no permission rules or hooks back it |
| No behavioral tests, evals or CI | Still open, partly addressed | `check-repo.sh` greps for files and phrases; nothing runs it on push; no recorded live run of the spec's 9 verification steps |
| Install instructions name a deprecated npm package | New | `INSTALLATION.md:40`, `explore-ui/2-…md:25`, `health-check/2-…md:50` say `npm install -g playwright-cli`; npm says "use @playwright/cli instead" |
| Claude Code hooks never run, and CLAUDE.md now describes them as working | Still open, now contradictory | `agent-qa/ide/claude/hooks.json` unchanged; CLAUDE.md on the branch documents PreToolUse and PostToolUse behavior |
| Agents are never used (now 11) | Still open, grew | 0 references from `commands/` to any agent, including the 4 new ones |
| Only Claude Code knows the 6 new commands | New | `ide/github/copilot-instructions.md`, `ide/cursor/rules/`, `ide/vscode/tasks.json` mention none of them, while the source work was Copilot-only |
| Large releases are loaded whole into context | Still open | `analyze-requirements/2-retrieve-jira-issues.md:46` "no pagination limits" |
| Same-day releases share one folder | Still open | `qa-conventions.md:35`: context is `release` for any JQL or multi-ticket run |
| Repo-wide audits are filed under a ticket or release folder | New, minor | `audit-framework.md:11` writes to `agent-qa/DATE-{release or issue}/reviews/` |
| GitHub support is a placeholder; MCP tool names use three styles | Still open | `framework/.../mcp-tool-mapping-github.md`; `rules/mcp-usage.md` vs phase files |
| Vague cross-references between phases | Still open | `generate-test-plan/1-…md`, `generate-risk-register/1-…md`: "Same as other commands" |
| Installer dead code and subshell counters | Still open | `project-install.sh:432` `install_workflows`; `:417` counters inside `find \| while` |
| Config template sections interleaved | Still open | `config.yml.template` lines 114–121: Playwright header with no keys, then API block |
| Design docs outweigh the feature | Housekeeping | 3,717 lines in `docs/superpowers/` vs about 2,500 lines of prompts |
| No LICENSE, no releases, installers pull `master` | Still open | README placeholder; `REPO_BRANCH="master"` in `base-install.sh` |
| **Fixed on the branch** | Fixed | Command counts and structure in CLAUDE.md corrected (24); PowerShell parity documented; config backfill for old installs in both shells; `refactor-framework` avoids the `git stash` trap |

That is the re-run of Phase 1 with this branch as the baseline. Tell me what I got wrong or missed, and I will move to Phase 2 questions.
