# Agent-QA — GitHub Copilot Instructions

## What is Agent-QA?

Agent-QA is an AI-powered QA automation agent that analyzes Jira tickets, Confluence pages, and git repository changes to generate test deliverables. The project is entirely markdown and YAML — no application runtime.

## Available Commands

Commands are markdown files in `agent-qa/commands/`. To use a command, reference its entry point file and follow the instructions.

| Command | Entry Point | Description |
|---------|------------|-------------|
| Analyze Requirements | `agent-qa/commands/analyze-requirements/analyze-requirements.md` | Analyze Jira issues, generate requirement docs |
| Generate Test Cases | `agent-qa/commands/generate-test-cases/generate-test-cases.md` | Generate test cases from requirements |
| Generate Test Strategy | `agent-qa/commands/generate-test-strategy/generate-test-strategy.md` | Generate test strategy document |
| Generate Test Charter | `agent-qa/commands/generate-test-charter/generate-test-charter.md` | Generate exploratory test charter |
| Generate Test Plan | `agent-qa/commands/generate-test-plan/generate-test-plan.md` | Generate comprehensive test plan |
| Generate Risk Register | `agent-qa/commands/generate-risk-register/generate-risk-register.md` | Generate risk register with scoring |
| Analyze Commits | `agent-qa/commands/analyze-commits/analyze-commits.md` | Analyze git commits, correlate with tickets |
| Generate Release Notes | `agent-qa/commands/generate-release-notes/generate-release-notes.md` | Generate technical release notes |
| Generate Gherkin | `agent-qa/commands/generate-gherkin/generate-gherkin.md` | Generate BDD .feature files from test cases |
| Generate Playwright Tests | `agent-qa/commands/generate-playwright-tests/generate-playwright-tests.md` | Generate Playwright .spec.ts files |
| Publish to Confluence | `agent-qa/commands/publish-to-confluence/publish-to-confluence.md` | Convert and publish to Confluence |

## How to Use

1. Reference the command file: `@agent-qa/commands/analyze-requirements/analyze-requirements.md`
2. Ask the AI to follow the instructions in the file
3. Provide the required input (e.g., Jira issue key)

Example:
```
@agent-qa/commands/analyze-requirements/analyze-requirements.md
Please analyze requirements for Jira ticket PROJ-123 following the instructions in this file.
```

## MCP Tool Requirements

Commands require MCP servers configured in your IDE:
- **Atlassian MCP** — for Jira issue search and Confluence page reading (`mcp_Atlassian_*` tools)
- **Repository MCP** — one of GitLab, GitHub, or Azure DevOps (configured in `agent-qa/config.yml`)

## Output Conventions

- All outputs go to `agent-qa/YYYY-MM-DD-{context}/`
- Test case IDs follow: `TC-{REQUIREMENT-KEY}-{NNN}`
- CSV exports target Jira Xray import format
- Deliverables include YAML front matter with metadata

## Configuration

Project-level config: `agent-qa/config.yml`

For detailed usage, see `agent-qa/commands/HOW_TO_USE.md`.
