# Agent-QA re-architecture: Phase 1 findings

Nov 1, 2026 · @Tarek AOUANI

## 1. What it does and who it is for

Agent-QA is a library of prompts, not a program. It is about 200 markdown and YAML files that tell an AI coding assistant (Claude Code, Cursor, Copilot) how to read Jira, Confluence and a git host through MCP servers, and then write QA documents into the user's project.

**Facts**

- 19 commands live in `agent-qa/commands/`, each split into 2 to 8 numbered phase files (about 25,600 lines in the repo overall).
- The root command is `analyze-requirements`. It turns a Jira key, a list of keys or a JQL query into structured requirement files. Every other `generate-*` command reads those files from disk.
- Outputs are markdown with YAML front matter, plus Xray CSV, Gherkin `.feature`, Playwright `.spec.ts`, Confluence XHTML and TestRail CSV. They land in `agent-qa/YYYY-MM-DD-{context}/` inside the user's project.
- `README.md` and `Agent-QA-Presentation.pptx` name the audience as QA analysts, QA managers and release managers. The pain points listed are slow test design, hours spent reading Jira and Confluence, documentation drift and last-minute release notes.
- Distribution is two shell or PowerShell installers. One copies the repo to `~/agent-qa`, the other copies selected parts into each project and IDE folder.

**Assumptions**

- It is used by one QA team, or a few, in an enterprise Atlassian shop. Built-in French and Arabic detection (`rules/language-handling.md`) suggests a francophone or MENA context.
- It grew out of the Agent OS prompt framework. Commit `6af0ea8` deleted `agent-os/` commands and agents that used the same phase-file pattern.
- GitLab was the first platform. It has the most specific tool mappings, while GitHub's are placeholders.

## 2. Architecture map

There is no Agent-QA process at run time. The user's IDE assistant loads a command file, follows its phases in order, calls MCP tools, and writes files. The output folder on disk is the only contract between commands.

&#91;embedded content: Agent-QA architecture · sources, MCP, assistant, prompt library, outputs\]

- **Commands** (`agent-qa/commands/*/`): an entry file lists `{{PHASE N: @path}}` markers. Each phase is prose: responsibilities, steps, MCP calls, "data storage" (what to keep in the model's working memory) and constraints.
- **Rules** (`agent-qa/rules/`): naming, IDs (`TC-{KEY}-{NNN}`), front matter, Xray CSV columns, language policy, MCP fallback. Copied to `.claude/rules/` for Claude Code.
- **Framework** (`agent-qa/framework/git-repository/`): about 25 docs describing a "unified" git interface over GitLab, GitHub and Azure DevOps, plus Jira-to-commit correlation by branch name, message and PR title.
- **Formats** (`agent-qa/formats/`): templates for Confluence XHTML, Gherkin, Playwright page objects and specs, Xray JSON, TestRail, API and WCAG specs.
- **Shared steps** (`agent-qa/commands/common/`): output index README and post-generation shell hooks, referenced from 14 and 12 phase files.
- **Orchestration** (`run-pipeline`, `regenerate`): more prompts that tell the model to run other commands in order, or to diff Jira `updated` timestamps against front matter and redo affected outputs.
- **IDE adapters** (`agent-qa/ide/`): Claude slash-command copies of each entry file, a Cursor usage rule, VS Code tasks that only `echo` a hint, and a Copilot instructions file.
- **Installers** (`scripts/`): `base-install` downloads the GitHub tarball to `~/agent-qa`; `project-install` copies commands, rules, framework, formats and the chosen IDE files into the project and writes `agent-qa/config.yml`.

## 3. Current tech stack

The stack is markdown, YAML and shell. No code runs except the installers and optional user hooks.

| Layer | What is used | Where |
| --- | --- | --- |
| Logic | Natural-language prompts in markdown, one file per phase | `agent-qa/commands/` |
| Runtime | Whatever LLM the user's IDE assistant runs; model is not pinned (`model: inherit` in agents) | user's IDE |
| Integrations | Atlassian MCP; GitLab, GitHub or Azure DevOps MCP; tool names hard-coded in prose | `rules/mcp-usage.md`, `framework/` |
| Config | One YAML file, parsed by a hand-written `get_yaml_value` in bash | `config.yml.template`, `scripts/common-functions.sh` |
| State and storage | Files in `agent-qa/YYYY-MM-DD-{context}/` with YAML front matter | user's project |
| Output formats | Markdown, Xray CSV and JSON, TestRail CSV, Gherkin, Playwright TypeScript, Confluence XHTML | `formats/` |
| Distribution | Bash (4 scripts, \~2,700 lines) and PowerShell (3 scripts, \~1,640 lines), GitHub `master` tarball | `scripts/` |
| Tests, CI, releases | None. No `.github/workflows`, no test or eval files, no tags, no LICENSE | repo root |

There are no dependency manifests or versions to report. `config.yml.template` carries `version: 1.0.0` and a placeholder `last_installed: 2025-01-01`.

## 4. What I am confident about vs. unsure about

**Confident (read directly in the repo)**

- The product is a prompt pack with installers. All behavior depends on the host LLM following prose, so quality and consistency vary by model and IDE.
- The dependency chain is file-based: generate commands scan `agent-qa/YYYY-MM-DD-*/requirements/` and ask the user to pick a folder.
- None of the 7 subagents in `agent-qa/agents/` is referenced by any command. They only run if a user calls them by hand.
- There is no automated check of anything: no tests, no evals, no golden outputs, no CI.
- The repo has one contributor and 21 commits in four bursts (Nov 2025, Mar 2026, Jul 2026, Sep 2026). The March rework (PR #1) touched 288 files and removed about 22,000 lines.

**Unsure (needs your input or a live run)**

- Whether anyone uses it today, how often, and with which IDE and which MCP servers. Nothing in the repo records usage.
- Whether the MCP tool names in the prompts match the servers you actually run. The repo uses three naming styles (see section 5). Models often map names loosely, so it may work anyway.
- Whether Claude Code expands the `{{PHASE N: @path}}` markers itself, or the model reads each file on its own. I have not tested this.
- Whether Cursor picks up the `.md` files written to `.cursor/rules/` (Cursor documents `.mdc` with front matter), and whether it reads `.claude/commands/`.
- How good the generated deliverables are. The `examples/` folder holds hand-made samples, not recorded outputs, so I cannot judge real output quality.
- Whether Xray, TestRail and Confluence imports were ever done end to end with these formats.

## 5. Unfinished, broken, unused or contradictory

The biggest problem is structural: nothing verifies that any command produces correct output, and the installers are now bigger than any functional part. The table lists concrete findings, most serious first.

| Finding | Kind | Evidence |
| --- | --- | --- |
| No tests, evals or CI for prompts or installers | Missing | No `.github/workflows`, no fixtures; `validate-outputs` is itself an LLM prompt |
| Large releases are loaded whole into the model's context | Risk | `analyze-requirements/2-retrieve-jira-issues.md:46` says "Retrieve ALL matching issues (no pagination limits)"; phases then add epics, children and Confluence pages |
| Claude Code hooks never run | Broken | `.claude/hooks.json` uses `"matcher": "PreToolUse"`. Claude Code reads hooks from `settings.json` with event names as keys, so this file is ignored |
| GitHub support is a placeholder | Unfinished | `framework/git-repository/operations/mcp-tool-mapping-github.md`: "exact name depends on MCP server"; no concrete tool names |
| MCP tool names use three styles | Contradictory | `mcp_Atlassian_jira_search` in `rules/mcp-usage.md` vs `mcp_Atlassian_searchJiraIssuesUsingJql` in phase files; `mcp_Azure_DevOps_*` vs `mcp_azure-devops_*`. Claude Code names tools `mcp__server__tool` |
| Subagents are never used | Unused | 0 references to any of the 7 agents from `commands/` |
| Phase files point at other commands vaguely | Fragile | `generate-test-plan/1-…md` and `generate-risk-register/1-…md` are 4 lines: "Same as other commands" |
| Same-day releases collide | Broken by design | Any multi-ticket or JQL run writes to `YYYY-MM-DD-release/`, so two releases analysed the same day share a folder |
| `regenerate` compares timestamps without timezone | Risk | Front matter `generated: YYYY-MM-DD HH:MM` vs Jira `updated` (UTC with offset) |
| Outputs live inside the tool's install folder | Design smell | Deliverables in `agent-qa/2026-…/` next to `agent-qa/commands/`; update and uninstall scripts must work around them |
| Installer dead code and a counter bug | Unused, minor bug | `install_workflows` and `install_standards` copy folders that no longer exist; counters increment inside `find \| while` subshells, so "Installed N files" never prints |
| No PowerShell update or uninstall | Unfinished | Only `project-update.sh` and `project-uninstall.sh` exist |
| `config.yml.template` sections are interleaved | Broken formatting | The API test block sits inside the Playwright header (lines \~114–123) |
| Command counts disagree | Contradictory | 19 command folders; CLAUDE.md and the deck say 18; README table lists 16 |
| VS Code integration is cosmetic | Thin | Every task in `ide/vscode/tasks.json` only `echo`s a hint to open Copilot |
| No LICENSE, no releases | Unfinished | README says "\[Add your license information here\]"; installers pull `master` directly |
| Binary deck in repo root | Housekeeping | `Agent-QA-Presentation.pptx` (60 KB) |

That is Phase 1. Tell me what I got wrong or missed, and I will move to Phase 2 questions.
