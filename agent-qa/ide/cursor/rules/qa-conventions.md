# QA Conventions for Cursor

## Project Context

Agent-QA is an AI-powered QA automation agent. It analyzes Jira tickets, Confluence pages, and git repository changes to generate test deliverables. The project is entirely markdown and YAML.

## Terminology

- Use **requirement** (not "ticket" or "issue") for analyzed Jira items
- Use **release** for JQL filter or multi-ticket analysis
- Use **deliverable** for generated outputs

## Test Case IDs

Format: `TC-{REQUIREMENT-KEY}-{NNN}` (e.g., `TC-PROJ-123-001`)

## Priority Scheme

- P1 Critical: Core functionality, security, data integrity
- P2 High: Important features, key user flows
- P3 Medium: Secondary features, UI/UX, edge cases
- P4 Low: Cosmetic, minor improvements

## Output Structure

All outputs go to `agent-qa/YYYY-MM-DD-{context}/` where context is the Jira key or `release`.

Subfolders: `requirements/`, `test-cases/`, `test-strategy/`, `test-charter/`, `test-plan/`, `risk-register/`, `release-notes/`, `commits/`, `gherkin/`, `playwright/`

## Language Detection

- Detect requirement language with 70% confidence threshold
- Write deliverables in the source requirement's language
- Never translate content between languages
