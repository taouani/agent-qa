# QA Conventions

Rules for QA terminology, naming, and classification used across all Agent-QA commands.

## Terminology

- Use **requirement** (not "ticket" or "issue") when referring to analyzed Jira items in deliverables
- Use **release** when referring to a JQL filter or multi-ticket analysis context
- Use **deliverable** for any generated output (test cases, strategies, charters, plans, risk registers, release notes)
- Use **test case** (not "test scenario" or "test script") for individual test items
- Use **test step** for individual actions within a test case

## Test Case ID Format

All test case IDs follow: `TC-{REQUIREMENT-KEY}-{NNN}`

- `{REQUIREMENT-KEY}` is the Jira issue key (e.g., `PROJ-123`)
- `{NNN}` is a zero-padded sequential number starting at `001`
- Example: `TC-PROJ-123-001`, `TC-PROJ-123-002`

## Priority Scheme

| Priority | Label | Classification |
|----------|-------|---------------|
| P1 | Critical | Core functionality, security, data integrity, blocking workflows |
| P2 | High | Important features, key user flows, integration points |
| P3 | Medium | Secondary features, UI/UX, edge cases with workarounds |
| P4 | Low | Cosmetic, minor improvements, rare edge cases |

## Output Folder Naming

All output folders follow: `YYYY-MM-DD-{context}/`

- `{context}` is the Jira issue key for single-ticket analysis (e.g., `PROJ-123`)
- `{context}` is `release` for JQL filter or multi-ticket analysis
- Output root: `agent-qa/YYYY-MM-DD-{context}/`

## Deliverable Subfolder Names

| Deliverable | Subfolder |
|------------|-----------|
| Requirements | `requirements/` |
| Test Cases | `test-cases/` |
| Test Strategy | `test-strategy/` |
| Test Charter | `test-charter/` |
| Test Plan | `test-plan/` |
| Risk Register | `risk-register/` |
| Release Notes | `release-notes/` |
| Commit Analysis | `commits/` |
| Gherkin Features | `gherkin/` |
| Playwright Tests | `playwright/` |

## Language Detection

- Detect the language of each requirement's content (title, description, acceptance criteria)
- Apply a 70% confidence threshold before switching output language
- Default to the detected language for all deliverables generated from that requirement
- Do NOT translate content — write deliverables in the same language as the source requirement
- When multiple requirements have mixed languages, handle each requirement in its own language
