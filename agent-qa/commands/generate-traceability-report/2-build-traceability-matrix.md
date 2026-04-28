# Phase 2: Build Traceability Matrix

## Core Responsibilities

Read all deliverables in the selected output folder and build a cross-deliverable traceability matrix.

## Workflow

### Step 1: Extract Requirement Keys

Read all files in `requirements/`:
- Extract requirement keys from filenames and YAML front matter
- Note the requirement summary/title
- Build a master list of all requirement keys

### Step 2: Map Test Cases to Requirements

If `test-cases/` exists:
- Read each test case file
- Extract all test case IDs (`TC-{KEY}-{NNN}`)
- Map each test case to its requirement key
- Count test cases per requirement
- Note test case priorities (P1-P4)

Build: `requirement_key → [test_case_ids]`

### Step 3: Map Gherkin Scenarios to Requirements

If `gherkin/` exists:
- Read each `.feature` file
- Extract feature file name (maps to requirement key)
- Count scenarios and scenario outlines per feature
- Extract tags

Build: `requirement_key → {feature_file, scenario_count, tags}`

### Step 4: Map Playwright Specs to Requirements

If `playwright/` exists:
- Read each `.spec.ts` file
- Extract requirement key from filename
- Count test functions per spec
- List page objects referenced

Build: `requirement_key → {spec_file, test_count, page_objects}`

### Step 5: Map Other Deliverables

For each of: `test-strategy/`, `test-charter/`, `test-plan/`, `risk-register/`, `release-notes/`:
- Check if the deliverable exists
- Extract `source_requirements` from YAML front matter
- Note which requirements are covered

### Step 6: Build Coverage Matrix

Combine all mappings into a single matrix:

```
requirement_key → {
  requirement: {file, title, language},
  test_cases: {count, ids, priorities},
  gherkin: {file, scenarios, tags},
  playwright: {file, tests, page_objects},
  test_strategy: true/false,
  test_charter: true/false,
  test_plan: true/false,
  risk_register: true/false,
  release_notes: true/false
}
```

### Step 7: Identify Gaps

For each requirement:
1. **No test cases**: Requirement exists but no test cases generated
2. **No Gherkin**: Test cases exist but no `.feature` file (if `gherkin/` folder exists)
3. **No Playwright**: Test cases exist but no `.spec.ts` file (if `playwright/` folder exists)
4. **Orphaned test cases**: Test case IDs referencing requirement keys not in `requirements/`

## Data Storage

Store the complete traceability matrix and gap analysis in memory.

## Constraints

- Do NOT modify any files
- Handle missing deliverable types gracefully (only flag gaps for deliverable types that exist in the output folder)
- Parse files carefully — don't assume format, validate as you go
