# Phase 1: Find and Select Test Cases

## Core Responsibilities

- Find available test case folders from previous `generate-test-cases` runs
- Present options to the user and let them select
- Load and parse test case files
- Filter for test cases that reference API interactions

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

### Step 4: Filter for API-Relevant Test Cases

Scan all loaded test cases for API interaction keywords in their summary, steps, preconditions, and test data:

**API keywords to match** (case-insensitive):
- HTTP methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`
- Protocol terms: `API`, `REST`, `GraphQL`, `HTTP`, `HTTPS`
- Request/response terms: `endpoint`, `request`, `response`, `payload`, `JSON`, `XML`
- Status codes: `status code`, `200`, `201`, `400`, `401`, `403`, `404`, `500`
- API concepts: `query`, `mutation`, `header`, `authorization`, `bearer`, `token`, `rate limit`

For each test case, mark it as API-relevant if it matches one or more keywords.

If no API-relevant test cases are found:
- Inform the user: "No API-relevant test cases found in the selected folder. Ensure test cases reference API endpoints, HTTP methods, or request/response patterns."
- Stop the command

### Step 5: User Confirms Selection

Present a summary of filtered test cases:

```
Loaded X test cases from Y files.
Filtered Z API-relevant test cases:
  - PROJ-123: 4 API test cases (2 REST, 2 GraphQL)
  - PROJ-124: 2 API test cases (2 REST)

Proceed with API test generation? (yes/no)
```

## Data Storage

Store the following for subsequent phases:
- `selected_folder`: Path to the parent output folder (e.g., `agent-qa/2025-01-16-PROJ-123/`)
- `all_test_cases`: Full parsed list of all test cases
- `api_test_cases`: Filtered list of API-relevant test cases only
- `requirement_keys`: Unique set of requirement keys from the API test cases
- `source_language`: Detected language from the test case files

## Constraints

- Do NOT modify any existing files
- Do NOT create output files in this phase
- Only read and present information
