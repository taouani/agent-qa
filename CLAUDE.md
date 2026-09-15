# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent-QA is an AI-powered QA automation agent. It analyzes Jira tickets, Confluence pages, and git repository changes to generate test deliverables (test cases, strategies, charters, plans, risk registers, release notes, Gherkin features, Playwright specs). The project is entirely markdown and YAML — no application runtime, no package manager, no compiled code. "Source code" here means prompt instructions: editing a phase file changes agent behavior.

## Working In This Repo

There is no build, no test runner, and no linter. Verification is manual:

```bash
bash -n scripts/project-install.sh          # syntax-check any modified shell script
./scripts/install-from-local.sh             # install this working copy into a test project
grep -rn "{{PHASE" agent-qa/commands/       # verify phase markers resolve to real files
bash scripts/check-repo.sh            # structural integrity: phase refs, command twins, rules
```

After changing commands or phases, exercise them from an installed project via the slash commands
`/agent-qa:health-check` (validates config + MCP connectivity) and `/agent-qa:validate-outputs`
(validates generated deliverables). Those are the closest thing to a test suite.

## Architecture

### Centralized Structure

Everything lives under **`agent-qa/`** — commands, rules, roles, framework, formats, and IDE integration templates:

```
agent-qa/
├── commands/              # Multi-phase command definitions (25 commands + common/)
├── rules/                 # QA conventions, output standards, MCP usage, language handling
├── roles/                 # 15 IDE-neutral craft definitions (test case design, playwright authoring, ...)
├── framework/             # Git platform abstractions (GitLab, GitHub, Azure DevOps)
├── formats/               # Output format templates (Confluence, Gherkin, Playwright, Xray, TestRail, ...)
├── custom-templates/      # Per-project overrides of formats/ (checked first, survives updates)
├── examples/              # Reference outputs for every deliverable type
├── ide/                   # IDE-specific integration templates
│   ├── claude/            # Claude Code (slash commands, hooks)
│   ├── cursor/            # Cursor IDE (rules)
│   ├── vscode/            # VS Code (settings, tasks, extensions)
│   └── github/            # GitHub Copilot (instructions)
└── config.yml.template    # Project configuration template
```

### Command Pattern

Every command follows the **multi-phase pattern**:
```
agent-qa/commands/{command-name}/
├── {command-name}.md          # Entry point (references phases)
├── 1-{phase-name}.md          # Phase 1
├── 2-{phase-name}.md          # Phase 2
└── ...N-{phase-name}.md       # Phase N
```

Phases are referenced via `{{PHASE X: @path/file.md}}` markers. Each phase file contains: core responsibilities, workflow steps, MCP server calls, data storage instructions, and constraints.

Every command has a **duplicate entry point** in `agent-qa/ide/claude/commands/agent-qa/{command-name}.md` (the slash-command wrapper, installed to `.claude/commands/agent-qa/`). The two files are near-identical — **when adding or renaming a command or phase, update both**, or the slash command will point at missing phase files.

### Shared Phase Snippets

`agent-qa/commands/common/` holds instructions referenced from other commands' final phases:
- **`generate-output-index.md`** — Builds/updates the `README.md` index inside the output folder. Referenced at the END of every generating command's last phase.
- **`execute-post-hooks.md`** — Runs `hooks.post_generate` shell commands from `config.yml`, expanding `{output_folder}`, `{command_name}`, `{context}`.
- **`discover-framework-profile.md`** — Resolves or generates `agent-qa/framework-profile.md`, the
  record of how the host repository writes Playwright tests. Referenced from phase 1 of every
  command that reads or modifies real test code. Stops for engineer review when the profile is new
  or unreviewed.

### Command Dependency Chain

`analyze-requirements` is the root command — all other generate commands depend on its output:
```
analyze-requirements (8 phases)
  ├── generate-test-cases (4 phases)
  │     ├── generate-gherkin (4 phases)
  │     ├── generate-playwright-tests (4 phases)
  │     ├── generate-api-tests (4 phases)
  │     ├── generate-accessibility-tests (4 phases)
  │     └── upload-to-xray (4 phases)
  ├── generate-test-charter (4 phases)
  ├── generate-test-strategy (4 phases)
  ├── generate-test-plan (4 phases)
  ├── generate-risk-register (4 phases)
  ├── generate-test-data (4 phases)
  └── publish-to-confluence (3 phases)   (any deliverable)

analyze-commits (6 phases)
  └── generate-release-notes (5 phases)
        └── publish-to-confluence (3 phases)

utility commands (independent):
  ├── health-check (2 phases)
  ├── validate-outputs (3 phases)
  ├── generate-traceability-report (3 phases)
  ├── run-pipeline (3 phases)
  └── regenerate (4 phases)

live automation (operate on the host project's Playwright repo):
  generate-test-cases
    └── explore-ui (5) ──gate──> generate-playwright-tests (5) ──> debug-tests (5)
  review-automation-code (4)
  audit-framework (4) ──gate──> refactor-framework (4)
```

Downstream commands do not take a ticket key — their phase 1 is always "find and select" an existing output folder, and they load sibling deliverables from it as extra context.

### Rules

`agent-qa/rules/` contains behavior rules (copied to `.claude/rules/` during installation):
- **`qa-conventions.md`** — Terminology, test case ID format, P1–P4 priority scheme, output folder naming, deliverable subfolder names, language detection
- **`mcp-usage.md`** — Atlassian and Repository MCP tool patterns, error handling, fallback strategies
- **`output-standards.md`** — Output directory structure, YAML front matter, markdown formatting, CSV/Xray format, file naming
- **`language-handling.md`** — Language detection rules, per-requirement handling, no-translation policy
- **`automation-conventions.md`** — Locator priority, allowed vs never-apply fixes, failure
  classification, severity levels, stop conditions. Generic; host-repository specifics live in
  `agent-qa/framework-profile.md`

### Roles

`agent-qa/roles/` holds 15 roles — IDE-neutral craft definitions (test case design, requirements
analysis, playwright authoring, risk analysis, and so on). A role is where the specialist judgement
for one kind of work lives: how to derive a positive test case, how to score a risk, how to shape a
Page Object. Command phase files reference a role by plain path
(`@agent-qa/roles/test-case-design.md`) and supply it with inputs; the role owns the craft, the
phase owns what is supplied and what happens to the result. Because a role is nothing more than a
markdown file at a fixed repository path, the craft is portable: any tool that can read a file by
path — Claude Code, Cursor, GitHub Copilot, Codex, or a human — reads the exact same instructions,
with no IDE-specific wrapper in between.

### The Four-Way Boundary

| Layer | Holds | Consumed by |
|-------|-------|-------------|
| `rules/` | Conventions everything obeys — terminology, ID formats, output standards, MCP usage | Every command, phase, and role |
| `roles/` | Craft a specialist applies — how to design, analyze, or author one kind of deliverable | Command phases, via `@agent-qa/roles/*.md`; any tool reading by path |
| `formats/` | Output templates — the shape of a Confluence page, a Gherkin feature, an Xray JSON payload | Command phases producing that output type |
| `commands/` | Orchestration — phase sequencing, what to load, where to write, when to gate or stop | The IDE's command runner (slash command or direct file reference) |

### Subagents

`agent-qa/ide/claude/agents/` holds eleven thin Claude Code wrapper files (copied to
`.claude/agents/agent-qa/` during installation). Each wrapper is a short trigger definition that
defers to a role or rule file for its actual instructions — the wrappers are not definitions in
their own right, and `agent-qa/agents/` (the old location for full agent definitions) no longer
exists:
- **`requirements-analyst.md`** — defers to `agent-qa/roles/requirements-analysis.md`
- **`test-case-generator.md`** — defers to `agent-qa/roles/test-case-design.md`
- **`gherkin-writer.md`** — defers to `agent-qa/roles/gherkin-authoring.md`
- **`playwright-generator.md`** — defers to `agent-qa/roles/playwright-authoring.md`
- **`confluence-publisher.md`** — defers to `agent-qa/formats/confluence/`
- **`api-test-generator.md`** — defers to `agent-qa/roles/api-test-design.md`
- **`accessibility-tester.md`** — defers to `agent-qa/roles/accessibility-mapping.md` and `agent-qa/roles/accessibility-test-design.md`
- **`ui-explorer.md`** — defers to `agent-qa/rules/automation-conventions.md`
- **`playwright-debugger.md`** — defers to `agent-qa/rules/automation-conventions.md`
- **`automation-reviewer.md`** — defers to `agent-qa/rules/automation-conventions.md`
- **`framework-architect.md`** — defers to `agent-qa/rules/automation-conventions.md`

### Hooks

`agent-qa/ide/claude/hooks.json` configures (copied to `.claude/hooks.json` during installation):
- **PreToolUse**: Validates `agent-qa/config.yml` exists
- **PostToolUse**: Logs output folder count and latest output folder

Not to be confused with `hooks.post_generate` in `config.yml`, which is executed by the agent itself via `commands/common/execute-post-hooks.md`.

### Git Repository Framework

`agent-qa/framework/git-repository/` provides platform-agnostic abstractions across GitLab, GitHub, and Azure DevOps. Commands call the platform-neutral file, which dispatches by `repository_platform` from `config.yml`:
- **`config/`** — Platform detection, MCP validation, project ID management, Azure cloud ID
- **`operations/`** — Commit search, PR/MR retrieval, branch listing, diff extraction. `commit-search.md` and `platform-abstraction.md` are the neutral entry points; `*-gitlab.md` / `*-github.md` / `*-azure-devops.md` hold the per-platform MCP tool mappings
- **`correlation/`** — Jira-to-commit matching via branch names, commit messages, PR/MR metadata (`unified-correlation.md` combines them)
- **`formats/`** — Output format specifications for commits, PRs, code changes
- **`errors/`** — Shared error handling for MCP/platform failures
- **`framework-index.md`** — Entry map for the framework

### Format Templates

`agent-qa/formats/` contains conversion templates for additional output formats:
- **`confluence/`** — Markdown-to-Confluence storage format (XHTML) mapping rules per deliverable type
- **`gherkin/`** — Test case-to-Gherkin feature file mapping rules, step definition guide
- **`playwright/`** — Spec file, Page Object, auth fixture, API mock, visual regression templates
- **`xray/`** — Xray JSON import format templates
- **`testrail/`** — TestRail CSV template and field mapping
- **`api-tests/`** — API test specification templates
- **`accessibility/`** — WCAG 2.1 AA mapping templates

`agent-qa/custom-templates/` mirrors this structure. Commands check it **first** and fall back to `formats/`; it is not overwritten by `project-update.sh`. Keep the original filename when overriding.

### IDE Integration

IDE-specific templates live in `agent-qa/ide/` and are copied to project root during installation:

| IDE | Integration Method | Source Templates | Installed To |
|-----|-------------------|-----------------|--------------|
| Claude Code | Slash commands + rules + agents + hooks | `agent-qa/ide/claude/` | `.claude/` |
| Cursor | Rules + Claude slash commands | `agent-qa/ide/cursor/` | `.cursor/`, `.claude/commands/` |
| VS Code | Settings + tasks + extensions + Copilot | `agent-qa/ide/vscode/` | `.vscode/`, `.github/` |
| GitHub Copilot | File references via `@agent-qa/commands/...` | `agent-qa/ide/github/` | `.github/` |
| Other IDEs | Direct file reference | — | [USER_GUIDE.md](USER_GUIDE.md) |

### MCP Server Dependencies

- **Atlassian MCP** — Jira issue search, Confluence page reading (tools: `mcp_Atlassian_*`)
- **Repository MCP** — One of GitLab, GitHub, or Azure DevOps (configured in `agent-qa/config.yml`)

### Output Structure

All generated deliverables go to:
```
agent-qa/YYYY-MM-DD-{context}/
├── README.md         # Auto-generated index (see commands/common/generate-output-index.md)
├── requirements/     test-cases/            test-strategy/
├── test-charter/     test-plan/             risk-register/
├── release-notes/    commits/               gherkin/
├── playwright/       test-data/             api-tests/
└── accessibility-tests/
```
Context is the Jira issue key (single ticket) or `release` (JQL filter / multiple tickets). Subfolder names are fixed by `rules/qa-conventions.md` — do not invent new ones.

### Two Write Zones

Most commands only write deliverables into `agent-qa/YYYY-MM-DD-{context}/`. The live automation
commands can also modify the host project's Playwright source, but only when all of these hold:
`automation.allow_source_edits: true`, `agent-qa/framework-profile.md` has `reviewed: true`, the
target path is under `playwright_project_root`, and the engineer approved that run. `.env*`,
`**/.auth/*.json`, `node_modules/`, CI configuration, and `playwright.config.ts` are never written,
regardless of the switch.

`agent-qa/framework-profile.md` lives at the repository root, like `config.yml`. It is generated,
engineer-edited, and never shipped or overwritten by the install and update scripts.

## Installation Scripts

Located in `scripts/`:

| Script | Platform | Purpose |
|--------|----------|---------|
| `base-install.sh` | Bash | Downloads Agent-QA to `~/agent-qa` (archive-based, fast) |
| `base-install.ps1` | PowerShell | Windows-native base install to `%USERPROFILE%\agent-qa` |
| `project-install.sh` | Bash | Per-project setup with `--ide` flag (default: all IDEs) |
| `project-install.ps1` | PowerShell | Per-project setup with `-Ide` flag (default: all IDEs) |
| `install-from-local.sh` | Bash | Alternative to base-install using local repository |
| `project-update.sh` | Bash | Updates existing project installation |
| `project-uninstall.sh` | Bash | Removes Agent-QA from a project |
| `common-functions.sh` | Bash | Shared bash utilities |
| `common-functions.ps1` | PowerShell | Shared PowerShell utilities |

Bash and PowerShell scripts are parallel implementations — a behavior change in `project-install.sh` must be mirrored in `project-install.ps1` (same for `base-install` and `common-functions`).

### IDE Selection (project-install.sh)

```bash
# Install all IDEs (default)
./scripts/project-install.sh

# Install specific IDEs
./scripts/project-install.sh --ide claude
./scripts/project-install.sh --ide claude,cursor
./scripts/project-install.sh --ide vscode
```

### Windows Quick Install

```powershell
# Base install (one-time)
irm https://raw.githubusercontent.com/taouani/agent-qa/master/scripts/base-install.ps1 | iex

# Project install (from your project directory)
& "$env:USERPROFILE\agent-qa\scripts\project-install.ps1"
```

## Configuration

Project-level config in `agent-qa/config.yml` (generated from `config.yml.template`). Phases read it directly — when adding a config key, add it to the template **and** to the phase that consumes it.

```yaml
installed_ides: ""             # Managed by project-install.sh — do not hand-edit
repository_platform: gitlab    # gitlab | github | azure-devops
repository_project_id: ""      # Platform-specific project identifier
azure_devops_cloud_id: ""      # Only for Azure DevOps

default_language: ""           # Empty = auto-detect (recommended)
test_types: [functional, security, performance, accessibility]
custom_labels: []              # Appended to labels in CSV/Xray exports

output_formats:                # All false by default
  confluence: false            # .confluence.html storage format
  gherkin: false               # .feature files
  playwright: false            # .spec.ts + .page.ts
  xray_json: false             # Xray JSON alongside CSV
  api_tests: false
  accessibility_tests: false
  testrail: false              # TestRail CSV

confluence_space_key: ""       # For Confluence publishing
confluence_parent_page_id: ""  # Parent page for published deliverables

api_test_base_url: ""
playwright_base_url: "http://localhost:3000"
playwright_browser: "chromium" # chromium | firefox | webkit
playwright_viewport: "1280x720"

playwright_project_root: ""    # Path to the Playwright project; "." if it IS the project root
browser_cli_command: "playwright-cli"  # Stateful session CLI for UI exploration (not npx playwright)

automation:
  allow_source_edits: false    # Master switch. While false, all commands are report-only
  auth_state_ttl_minutes: 60   # Reuse a saved browser auth state younger than this
  stability_runs: 3            # Consecutive passing runs required before a fix is stable

hooks:
  post_generate: []            # Shell commands; vars: {output_folder} {command_name} {context}
```

## Development Conventions

- All commands and documentation are pure markdown files
- Phase files use 1-based numbering: `1-init.md`, `2-retrieve.md`, etc.
- Test case IDs follow: `TC-{REQUIREMENT-KEY}-{NNN}` (zero-padded from `001`)
- Priorities are P1–P4, defined in `rules/qa-conventions.md`
- CSV exports target Jira Xray import format
- Commands auto-detect and reuse previous outputs as context
- Deliverables are written in the source requirement's language — never translate
- `agent-qa/examples/` holds a reference output per deliverable type; match their shape when changing generation phases
