# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent-QA is an AI-powered QA automation agent. It analyzes Jira tickets, Confluence pages, and git repository changes to generate test deliverables (test cases, strategies, charters, plans, risk registers, release notes, Gherkin features, Playwright specs). The project is entirely markdown and YAML — no application runtime, no package manager, no compiled code.

## Architecture

### Two-Layer Structure

- **`agent-qa/`** — QA-specific commands, framework utilities, format templates, and configuration. This is where most development happens.

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

### Command Dependency Chain

`analyze-requirements` is the root command — all other generate commands depend on its output:
```
analyze-requirements (8 phases)
  ├── generate-test-cases (4 phases)
  │     ├── generate-gherkin (4 phases)
  │     └── generate-playwright-tests (4 phases)
  ├── generate-test-charter (4 phases)
  ├── generate-test-strategy (4 phases)
  ├── generate-test-plan (4 phases)
  ├── generate-risk-register (4 phases)
  └── publish-to-confluence (3 phases)   (any deliverable)

analyze-commits (6 phases)
  └── generate-release-notes (5 phases)
        └── publish-to-confluence (3 phases)
```

### Rules

`.claude/rules/` contains behavior rules loaded automatically by Claude Code:
- **`qa-conventions.md`** — Terminology, test case ID format, priority scheme, output folder naming, language detection
- **`mcp-usage.md`** — Atlassian and Repository MCP tool patterns, error handling, fallback strategies
- **`output-standards.md`** — Output directory structure, YAML front matter, markdown formatting, CSV/Xray format, file naming
- **`language-handling.md`** — Language detection rules, per-requirement handling, no-translation policy

### Subagents

`.claude/agents/agent-qa/` provides specialized agents:
- **`requirements-analyst.md`** — Jira/Confluence analysis, language detection
- **`test-case-generator.md`** — Test case design (positive/negative/edge), Xray CSV
- **`gherkin-writer.md`** — Map test cases to Given/When/Then .feature files
- **`playwright-generator.md`** — Generate Playwright .spec.ts from test cases
- **`confluence-publisher.md`** — Convert to Confluence format, publish via MCP

### Hooks

`.claude/hooks.json` configures:
- **Pre-command**: Validates `agent-qa/config.yml` exists
- **Post-command**: Logs run metadata and output summary

### Git Repository Framework

`agent-qa/framework/git-repository/` provides platform-agnostic abstractions across GitLab, GitHub, and Azure DevOps:
- **`config/`** — Platform detection, MCP validation, project ID management
- **`operations/`** — Commit search, PR/MR retrieval, branch listing, diff extraction (platform-specific implementations)
- **`correlation/`** — Jira-to-commit matching via branch names, commit messages, PR/MR metadata
- **`formats/`** — Output format specifications for commits, PRs, code changes

### Format Templates

`agent-qa/formats/` contains conversion templates for additional output formats:
- **`confluence/`** — Markdown-to-Confluence storage format (XHTML) mapping rules per deliverable type
- **`gherkin/`** — Test case-to-Gherkin feature file mapping rules
- **`playwright/`** — Test case-to-Playwright spec and Page Object mapping rules

### IDE Integration

Agent-QA supports multiple IDEs:

| IDE | Integration Method | Config Location |
|-----|-------------------|----------------|
| Claude Code | Slash commands via `.claude/commands/agent-qa/` | `.claude/rules/`, `.claude/agents/`, `.claude/hooks.json` |
| Cursor | Slash commands via `.claude/commands/agent-qa/` | `.cursor/rules/` |
| GitHub Copilot | File references via `@agent-qa/commands/...` | `.github/copilot-instructions.md` |
| Other IDEs | Direct file reference | `agent-qa/commands/HOW_TO_USE.md` |

### MCP Server Dependencies

- **Atlassian MCP** — Jira issue search, Confluence page reading (tools: `mcp_Atlassian_*`)
- **Repository MCP** — One of GitLab, GitHub, or Azure DevOps (configured in `agent-qa/config.yml`)

### Output Structure

All generated deliverables go to:
```
agent-qa/YYYY-MM-DD-{context}/
├── requirements/    test-cases/    test-strategy/
├── test-charter/    test-plan/     risk-register/
├── release-notes/   commits/       gherkin/
└── playwright/
```
Context is the Jira issue key (single ticket) or `release` (JQL filter / multiple tickets).

## Installation Scripts

Located in `scripts/`:
- `base-install.sh` — Downloads Agent-QA to `~/agent-qa` (one-time per machine)
- `project-install.sh` — Per-project setup: creates `.claude/commands/agent-qa/`, `.claude/rules/`, `.claude/agents/agent-qa/`, `.cursor/rules/`, `.github/copilot-instructions.md`, generates `agent-qa/config.yml`
- `install-from-local.sh` — Alternative to base-install using local repository
- `project-update.sh` — Updates existing project configuration
- `common-functions.sh` — Shared bash utilities (color output, validation, config management)

## Configuration

Project-level config in `agent-qa/config.yml` (generated from `config.yml.template`):
```yaml
repository_platform: gitlab    # gitlab | github | azure-devops
repository_project_id: ""      # Platform-specific project identifier
azure_devops_cloud_id: ""      # Only for Azure DevOps

output_formats:
  confluence: false             # Generate Confluence format files
  gherkin: false                # Generate Gherkin .feature files

confluence_space_key: ""        # For Confluence publishing
confluence_parent_page_id: ""   # Parent page for published deliverables

playwright_base_url: "http://localhost:3000"  # Base URL for Playwright tests
```

## Development Conventions

- All commands and documentation are pure markdown files
- Phase files use 1-based numbering: `1-init.md`, `2-retrieve.md`, etc.
- Test case IDs follow: `TC-{REQUIREMENT-KEY}-{NNN}`
- CSV exports target Jira Xray import format
- Commands auto-detect and reuse previous outputs as context
