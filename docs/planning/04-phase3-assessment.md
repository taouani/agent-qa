# Agent-QA Phase 3: assessment

Nov 1, 2026 · @Tarek AOUANI

This assesses branch `improve-automation-agents` against the confirmed goal: an open-source tool for Jira, Xray and Salesforce Playwright work, running in three IDE hosts and in CI, masking personal data, with full scope by 31 December 2026. The verdict: the QA knowledge and the automation design are worth keeping. The prompt-only architecture cannot meet the goal's masking, harness, CI and quality requirements.

## 1. Strengths worth keeping

The value to carry forward is the QA knowledge and the safety design, not the files. These become specifications, prompt templates and schemas in the rewrite.

| Strength | Where it lives today | How it carries into the rewrite |
| --- | --- | --- |
| A clear pipeline: requirements, then test cases, then scripts | Command chain in `CLAUDE.md`; dated output folder as the contract | Becomes a typed artifact graph: each step reads and writes validated data, not loose markdown |
| QA conventions that users rely on | `rules/qa-conventions.md`, `rules/output-standards.md`: `TC-{KEY}-{NNN}` IDs, P1–P4, Xray CSV columns, front matter | Becomes schemas and fixed renderers. Code applies them, so the model no longer has to remember them |
| The two commands people actually use | `analyze-requirements` (8 phases), `generate-test-cases` (4 phases) | Their phase logic is the spec for the first prompts to harden and measure |
| Locators from a real browser instead of guesses | `explore-ui`: accessibility snapshot, then ranked locators with provenance | The biggest lever for the 90% runnable target. Keep the approach and reimplement it on the Playwright library |
| Framework profile, discovered once and reviewed by a person | `commands/common/discover-framework-profile.md` | Keep the idea. Store it as a typed config file the code validates |
| A strict debugging policy | `rules/automation-conventions.md`: six failure classes, allowed vs never-apply fixes, stop on a real defect, `stability_runs` | Becomes enforced rules in code, plus harness cases that prove a real defect is never hidden |
| Safe defaults and a write gate | `allow_source_edits: false`, deny-list, per-run approval | Keep. Enforce it in the file-writing layer instead of in prose |
| Language policy (never translate) | `rules/language-handling.md` | A differentiator for international teams. Keep it as a pipeline setting with tests |
| Jira-to-git correlation rules | `framework/git-repository/correlation/` | The spec for the git adapters' matching logic |
| Reference outputs | `agent-qa/examples/` (14 files) | Seed fixtures for the harness's expected outputs |

## 2. Weaknesses, debt and risks, ranked by impact

The top four block the goal outright. Each one comes from the same root cause: there is no code of Agent-QA's own between the model and the data or files.

| # | Weakness | Impact on the goal | Evidence |
| --- | --- | --- | --- |
| 1 | Behavior is prose only; nothing is enforced | Critical. Masking, the write gate, ID formats and Xray columns all depend on the model obeying. This is why quality varies by model (your pain 3) | Every rule lives in `rules/*.md` and phase files; no executable layer |
| 2 | Data reaches the model through third-party MCP servers | Critical. Masking cannot be guaranteed, which breaks the GDPR, PIPL and CCPA constraint | `rules/mcp-usage.md`: the IDE calls Atlassian and git MCP directly |
| 3 | No harness: no evals, no fixtures, no CI | Critical. The 95% and 90% targets cannot be measured, and regressions go unseen (your pain 2) | `check-repo.sh` greps wording only; no recorded runs |
| 4 | No way to run outside an IDE | Critical for CI. There is no CLI, no model adapter, and no headless mode | Commands are only reachable as slash commands or `@file` references |
| 5 | Installation copies files into each project | High. This is your pain 1. It is about 4,300 lines of Bash and PowerShell, pulls `master`, and must keep two shells in step | `scripts/` |
| 6 | Each IDE gets its own copies, and they drift | High. The goal needs three hosts at parity, but Copilot and Cursor already lack the 6 automation commands | `ide/claude/commands/` duplicates; `ide/github/`, `ide/cursor/` stale |
| 7 | Steps pass untyped markdown to each other | High. Chaining is fragile, outputs can't be validated, and `regenerate` relies on timestamps with no time zone | Output folder plus YAML front matter is the only contract |
| 8 | Whole releases are loaded into the model's context | Medium-high. Large JQL runs will truncate or degrade quality and cost more | `analyze-requirements/2-retrieve-jira-issues.md:46` |
| 9 | Generic Playwright guidance with no Salesforce knowledge | Medium-high. Salesforce Lightning's shadow DOM, generated IDs, spinners and Visualforce iframes are the main reasons generated scripts fail | Profile "archetype notes" only; no Salesforce pack |
| 10 | Git support is uneven | Medium. All three platforms are now fixed scope. GitHub is a placeholder and tool names conflict | `framework/.../mcp-tool-mapping-github.md` |
| 11 | Xray is file export only | Medium. There is no push to Xray Cloud and no read-back of existing tests | `formats/xray/`, CSV in `generate-test-cases` |
| 12 | Depends on the deprecated `playwright-cli` package | Medium. Command syntax may already differ from `@playwright/cli` | npm metadata |
| 13 | Not ready to publish as open source | Medium effort, but it blocks the release. There is no LICENSE, no releases, no contribution guide and no security policy | README placeholder |
| 14 | Same-day release folders collide | Low-medium. Two runs on the same day can overwrite each other | `qa-conventions.md:35` |
| 15 | Unused agents, broken hooks, documentation drift | Low. The rewrite removes them | Phase 1 findings |

**Biggest risk outside the code:** you are the only developer. A one-person open-source project lives or dies by its tests, its release automation and its scope discipline. Today it has none of the three.

## 3. Gaps between today and the goal

Of the 13 goal requirements, 6 have no implementation today. Most of the rest exist only as prompts. Gap size is my rough judgment of new work, not an estimate in hours.

| Goal requirement | Today | Gap |
| --- | --- | --- |
| Mask personal data before any model call | Nothing | Large: needs Agent-QA's own data access plus a detector (names, emails, phones, addresses, IDs in Jira, Confluence and Salesforce data) |
| Own Jira, Confluence, Xray and git access | Borrowed MCP servers | Large: a client for each API, plus an MCP server so IDE hosts use Agent-QA's masked tools |
| Standalone CLI in CI | Nothing | Large: CLI, config loading, exit codes, report files |
| Model access in CI (headless Claude Code or Copilot CLI; Anthropic, OpenAI, OpenRouter, LiteLLM keys) | Nothing | Large: a provider layer with an allowlist, plus a headless-agent runner |
| Harness measuring the 95% and 90% targets on your sandbox org | Nothing | Large: reference tickets, expected outputs, review scoring, Playwright runs in CI |
| Ready to publish as open source | No license or releases | Small, but required for the release |
| Claude Code, Copilot and Cursor at parity | Claude complete, the others partial | Medium. If all three use one Agent-QA MCP server, most of the gap disappears |
| GitLab, GitHub and Azure DevOps | GitLab mapped, Azure DevOps partial, GitHub placeholder | Medium |
| Push test cases to Xray Cloud | CSV and JSON files only | Medium: Xray Cloud API, authentication, existing-test lookup |
| Playwright scripts that run on Salesforce | Live exploration designed, not proven | Medium-large: the Salesforce knowledge pack and the run-and-fix loop must actually work |
| Debug, review, audit and refactor | Prompts on the branch, never run live | Medium: port the rules to code-backed steps, verify against your org |
| Setup in one command | Two shell installers per OS | Medium: one package install (for example `npx` or `pipx`) plus `init` |
| Model-independent quality | Fully model-dependent | Large and partly unfixable. Code can enforce structure, but content quality still needs the harness to pick a minimum model |

## 4. Schedule check

My rough estimate for the full scope is 375 to 560 hours. You have about 340 hours before 31 December. These figures are assumptions: one experienced developer, heavy use of AI coding help, and no surprises from the Atlassian or Salesforce APIs.

| Workstream | Estimate (hours) |
| --- | --- |
| Core: project skeleton, config, artifact schemas, pipeline runner | 30–40 |
| Jira, Confluence and Xray Cloud clients | 30–40 |
| Personal-data masking, with tests | 30–50 |
| GitLab, GitHub and Azure DevOps adapters | 30–45 |
| Model providers, headless agent runner, CLI | 30–45 |
| MCP server and Claude Code, Copilot, Cursor setup | 25–40 |
| Document generators (about 18 commands, as schemas and prompts) | 60–90 |
| Live automation and the Salesforce pack (explore, generate, run-and-fix, debug, review, audit, refactor) | 80–120 |
| Harness, reference data, CI | 40–60 |
| Packaging, docs, open-source release | 20–30 |
| **Total** | **375–560** |

AI help will speed up the writing. It won't speed up live Salesforce verification, API edge cases or harness calibration as much, and those are the riskiest parts. My honest read is that the full scope by 31 December is unlikely unless some items get thinner versions. That is a Phase 4 decision, and yours: what ships first, and what can be thinner in the first release.

That's Phase 3. Tell me what you disagree with or think is missing. Then I'll propose the Phase 4 order.
