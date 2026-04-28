# Phase 2: Validate Deliverables

## Core Responsibilities

Run validation rules against all deliverable files in the selected output folder.

## Workflow

### Step 1: Load Validation Rules

Read validation rules from:
- `agent-qa/rules/output-standards.md` — YAML front matter, file naming, markdown formatting, CSV format
- `agent-qa/rules/qa-conventions.md` — Test case ID format, priority scheme, deliverable subfolder names

### Step 2: Validate YAML Front Matter

For each `.md` file in every deliverable subdirectory:

1. **Presence check**: File starts with `---` and contains closing `---`
2. **Required fields**: `type`, `generated`, `source_requirements`, `language`, `version`
3. **Type value**: Must be one of the valid types: `requirement`, `test-cases`, `test-strategy`, `test-charter`, `test-plan`, `risk-register`, `release-notes`, `commit-analysis`, `gherkin-feature`, `playwright-spec`
4. **Generated format**: Must match `YYYY-MM-DD HH:MM`
5. **Language code**: Must be a valid ISO 639-1 code (e.g., `en`, `fr`, `ar`, `es`)

Record for each file: PASS or FAIL with specific issue.

### Step 3: Validate File Naming

Check each file against the naming conventions:

| Subfolder | Expected Pattern |
|-----------|-----------------|
| `requirements/` | `{REQUIREMENT-KEY}.md` or `requirements-index.md` |
| `test-cases/` | `{REQUIREMENT-KEY}-test-cases.md`, `{REQUIREMENT-KEY}-test-cases.csv`, `traceability-matrix.md` |
| `test-strategy/` | `test-strategy.md` |
| `test-charter/` | `test-charter.md` |
| `test-plan/` | `test-plan.md` |
| `risk-register/` | `risk-register.md` |
| `release-notes/` | `release-notes.md` |
| `commits/` | `commit-analysis.md` |
| `gherkin/` | `{REQUIREMENT-KEY}.feature`, `README.md` |
| `playwright/` | `{REQUIREMENT-KEY}.spec.ts`, `{page-name}.page.ts`, `README.md` |

Record: PASS, FAIL (wrong name), or WARN (unexpected file).

### Step 4: Validate Test Case IDs

For files in `test-cases/`:

1. Extract all test case IDs (pattern: `TC-{KEY}-{NNN}`)
2. Validate format: `TC-` prefix, valid Jira key, zero-padded 3-digit number
3. Check for duplicate IDs across files
4. Check sequential numbering (no gaps)

Record: PASS or FAIL with specific issues.

### Step 5: Validate CSV Format (if test-cases CSV exists)

For each `.csv` file in `test-cases/`:

1. **Header row**: Must contain all required columns: `Test ID`, `Test Summary`, `Test Priority`, `Test Type`, `Precondition`, `Action`, `Data`, `Expected Result`, `Folder`, `Labels`
2. **Column count**: Each row must have the same number of columns as the header
3. **Priority values**: Must be one of: `Critical`, `High`, `Medium`, `Low`
4. **Test Type**: Must be `Manual`
5. **Pipe separation**: `Action`, `Data`, `Expected Result` must have matching pipe counts

Record: PASS or FAIL with row numbers and specific issues.

### Step 6: Validate Subfolder Names

Check that all subdirectories in the output folder match the expected deliverable subfolder names defined in `qa-conventions.md`. Flag any unknown subdirectories.

### Step 7: Cross-Deliverable Consistency

If multiple deliverable types exist:

1. **Requirement keys match**: Test case files should reference requirements that exist in `requirements/`
2. **Gherkin covers test cases**: If both `gherkin/` and `test-cases/` exist, check that each requirement with test cases has a corresponding `.feature` file
3. **Playwright covers test cases**: If both `playwright/` and `test-cases/` exist, check that each requirement with test cases has a corresponding `.spec.ts` file

Record: PASS, FAIL, or WARN (missing coverage).

## Data Storage

Store all validation results in memory as a structured report:

```
validation_results:
  - file: "requirements/PROJ-123.md"
    checks:
      - rule: "yaml_front_matter"
        status: "PASS"
      - rule: "file_naming"
        status: "PASS"
  - file: "test-cases/PROJ-123-test-cases.csv"
    checks:
      - rule: "csv_headers"
        status: "FAIL"
        details: "Missing column: Labels"
```

## Constraints

- Do NOT modify any files — this is a read-only validation
- Validate ALL files, don't stop at first error
- Be specific about what failed and where (file path, line number if applicable)
