# Phase 1: Find and Select Test Cases

## Core Responsibilities

- Find available test case folders from previous `generate-test-cases` runs
- Present options to the user and let them select
- Load and parse test case files

## Workflow Steps

### Step 1: Find Test Case Folders

Search for existing test case output folders:

1. List all directories matching `agent-qa/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*/test-cases/`
2. Sort by date (most recent first)
3. For each folder, count the number of test case markdown files
4. If no folders found, inform the user: "No test cases found. Run /generate-test-cases first."

### Step 2: Present Options

Present the available test case folders to the user:

```
Available test case folders:
  1. agent-qa/2025-01-16-PROJ-123/test-cases/ (3 files)
  2. agent-qa/2025-01-15-release/test-cases/ (12 files)
```

- If only one folder exists, confirm it with the user
- Let the user select which folder to use

### Step 3: Load Test Case Files

For each test case markdown file in the selected folder:

1. Read the file content
2. Parse YAML front matter to extract:
   - `type`: should be `test-cases`
   - `source_requirements`: list of requirement keys
   - `language`: detected language
3. Parse the markdown body to identify individual test cases
4. For each test case, extract:
   - Test case ID (e.g., `TC-PROJ-123-001`)
   - Summary
   - Priority (P1-P4)
   - Prerequisites/preconditions
   - Test steps (action + expected result)
   - Test data
   - Tags/labels
   - Linked requirement key

### Step 4: User Confirms Selection

Present a summary of loaded test cases:

```
Loaded X test cases from Y files:
  - PROJ-123: 5 test cases (3 P1, 2 P2)
  - PROJ-124: 3 test cases (1 P1, 1 P2, 1 P3)

Proceed with Gherkin generation? (yes/no)
```

## Data Storage

Store the following for subsequent phases:
- `selected_folder`: Path to the parent output folder (e.g., `agent-qa/2025-01-16-PROJ-123/`)
- `test_cases`: Parsed list of all test cases with their properties
- `requirement_keys`: Unique set of requirement keys from the test cases
- `source_language`: Detected language from the test case files

## Constraints

- Do NOT modify any existing files
- Do NOT create output files in this phase
- Only read and present information
