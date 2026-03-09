# Output Standards

Rules for all deliverable output formatting, structure, and file conventions.

## Output Directory Structure

All deliverables are written to: `agent-qa/YYYY-MM-DD-{context}/`

```
agent-qa/YYYY-MM-DD-{context}/
├── requirements/
├── test-cases/
├── test-strategy/
├── test-charter/
├── test-plan/
├── risk-register/
├── release-notes/
├── commits/
├── gherkin/
├── playwright/
├── test-data/
├── api-tests/
└── accessibility-tests/
```

Only create subdirectories for deliverables that are being generated.

## YAML Front Matter

All markdown deliverable files MUST include YAML front matter:

```yaml
---
type: {deliverable-type}
generated: YYYY-MM-DD HH:MM
source_requirements:
  - {REQUIREMENT-KEY-1}
  - {REQUIREMENT-KEY-2}
language: {detected-language-code}
version: "1.0"
---
```

Valid `type` values: `requirement`, `test-cases`, `test-strategy`, `test-charter`, `test-plan`, `risk-register`, `release-notes`, `commit-analysis`, `gherkin-feature`, `playwright-spec`, `test-data`, `traceability-report`, `api-test-spec`, `accessibility-test`, `change-log`

## Markdown Formatting

- Use ATX-style headings (`#`, `##`, `###`)
- Use tables for structured data (test steps, risk matrices, traceability)
- Use code blocks with language identifiers for code snippets
- Use `> [!NOTE]`, `> [!WARNING]`, `> [!IMPORTANT]` for callouts
- Separate sections with a single blank line
- Do not exceed 120 characters per line in prose paragraphs

## CSV Format (Xray Export)

Test case CSV files follow Jira Xray import format:

### Required Columns

| Column | Description |
|--------|-------------|
| `Test ID` | Test case ID (e.g., `TC-PROJ-123-001`) |
| `Test Summary` | One-line test case summary |
| `Test Priority` | `Critical`, `High`, `Medium`, `Low` |
| `Test Type` | `Manual` |
| `Precondition` | Prerequisites text |
| `Action` | Test steps (pipe-separated: `Step 1 \| Step 2 \| Step 3`) |
| `Data` | Test data (pipe-separated, matching steps) |
| `Expected Result` | Expected results (pipe-separated, matching steps) |
| `Folder` | Xray folder path (e.g., `/PROJ-123`) |
| `Labels` | Comma-separated labels |

### Pipe Separation

- Steps within a single test case are separated by ` \| ` (space-pipe-space)
- Each step's Action, Data, and Expected Result must align by position
- Empty data fields use `-` as placeholder

## File Naming Conventions

| Deliverable | File Name Pattern |
|------------|-------------------|
| Requirement | `{REQUIREMENT-KEY}.md` |
| Test Cases (MD) | `{REQUIREMENT-KEY}-test-cases.md` |
| Test Cases (CSV) | `{REQUIREMENT-KEY}-test-cases.csv` |
| Traceability Matrix | `traceability-matrix.md` |
| Test Strategy | `test-strategy.md` |
| Test Charter | `test-charter.md` |
| Test Plan | `test-plan.md` |
| Risk Register | `risk-register.md` |
| Release Notes | `release-notes.md` |
| Commit Analysis | `commit-analysis.md` |
| Gherkin Feature | `{REQUIREMENT-KEY}.feature` |
| Playwright Page Object | `{page-name}.page.ts` |
| Playwright Spec | `{REQUIREMENT-KEY}.spec.ts` |
| Confluence Export | `{original-name}.confluence.html` |
| Test Data | `{entity-name}-data.md` |
| Traceability Report | `traceability-report.md` |
| API Test Spec | `{endpoint-group}-api-tests.md` |
| Accessibility Test | `{page-name}-accessibility-tests.md` |
| WCAG Compliance Matrix | `wcag-compliance-matrix.md` |
| Xray JSON Export | `xray-import.json` |
| TestRail CSV Export | `testrail-import.csv` |
| Change Log | `change-log.md` |
| Index/Summary | `README.md` |
