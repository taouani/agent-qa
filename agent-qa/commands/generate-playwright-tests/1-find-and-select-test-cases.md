# Phase 1: Find and Select Test Cases

## Core Responsibilities

- Find available test case folders
- Optionally check for Gherkin `.feature` files as supplementary input
- Filter and prioritize candidates
- Load and parse test case files

## Workflow Steps

### Step 1: Find Test Case Folders

Search for existing test case output folders:

1. List all directories matching `agent-qa/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*/test-cases/`
2. Sort by date (most recent first)
3. For each folder, count the number of test case markdown files
4. Also check for `gherkin/` subdirectory in the same parent folder (optional input)
5. If no test case folders found, inform the user: "No test cases found. Run /generate-test-cases first."

### Step 2: Present Options

Present the available test case folders:

```
Available test case folders:
  1. agent-qa/2025-01-16-PROJ-123/test-cases/ (3 files)
     └── Gherkin: gherkin/ (3 .feature files available)
  2. agent-qa/2025-01-15-release/test-cases/ (12 files)
     └── Gherkin: not available
```

### Step 3: Load Test Case Files

For each test case markdown file in the selected folder:

1. Read the file content
2. Parse YAML front matter
3. Parse the markdown body to extract individual test cases:
   - Test case ID
   - Summary
   - Priority (P1-P4)
   - Prerequisites
   - Test steps (action + expected result)
   - Test data
   - Tags/labels
   - Linked requirement key

### Step 4: Prioritize Candidates

Present test cases sorted by automation priority:

1. **High priority for automation**: P1 Critical and P2 High, `regressionSuite: true`
2. **Medium priority**: P3 Medium with clear UI steps
3. **Lower priority**: P4 Low, exploratory-style test cases

```
Loaded X test cases. Automation priority:
  High:   TC-PROJ-123-001 (P1), TC-PROJ-123-002 (P1), TC-PROJ-123-003 (P2)
  Medium: TC-PROJ-123-004 (P3), TC-PROJ-123-005 (P3)
  Lower:  TC-PROJ-123-006 (P4)

Generate Playwright specs for all? Or select specific test cases?
```

### Step 5: Read Configuration

Read `agent-qa/config.yml` for Playwright settings:

```yaml
playwright_base_url: "http://localhost:3000"
```

Store the `playwright_base_url` for use in Page Object `goto()` methods.

## Data Storage

Store for subsequent phases:
- `selected_folder`: Path to the parent output folder
- `test_cases`: Parsed list of selected test cases
- `requirement_keys`: Unique requirement keys
- `gherkin_available`: Whether `.feature` files exist for reference
- `playwright_base_url`: From config

## Constraints

- Do NOT modify any existing files
- Do NOT create output files in this phase
