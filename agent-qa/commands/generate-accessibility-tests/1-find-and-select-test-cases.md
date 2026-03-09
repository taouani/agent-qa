# PHASE 1: Find and Select Test Cases

Find existing test case output folders and prompt the user to select which one to use. Load and filter for UI-facing test cases.

## Core Responsibilities

1. **Scan for Test Case Folders**: Find all folders matching pattern `agent-qa/YYYY-MM-DD-*/test-cases/`
2. **List Available Options**: Present list of available test case outputs to user
3. **Prompt User Selection**: Ask user to choose which test case output to use
4. **Validate Selection**: Validate user's selection and confirm folder contains test case files
5. **Load Test Cases**: Load all test case markdown files from the selected folder
6. **Filter UI Test Cases**: Identify UI-facing test cases, filtering out pure backend/API tests

## Workflow

### Step 1: Scan for Test Case Folders

Search for existing test case output folders:
- Pattern: `agent-qa/YYYY-MM-DD-*/test-cases/`
- Look for folders containing `.md` files (test case markdown files)
- Sort by date (most recent first)

If no test case folders are found:
- Inform the user that no test case output exists
- Recommend running `generate-test-cases` first
- Stop the command

### Step 2: Present Options and Prompt Selection

If **one folder** exists:
- Display the folder path and ask the user to confirm

If **multiple folders** exist:
- List all available folders with their dates and context (issue key or release)
- Ask the user to select which one to use

### Step 3: Validate Selection

- Confirm the selected folder exists and contains test case markdown files
- Count the number of test case files found
- Report the count to the user

### Step 4: Load Test Case Files

Load all test case markdown files from the selected folder:
- Read each `.md` file in the `test-cases/` subfolder
- Parse YAML front matter for metadata (requirement key, priority, tags, type)
- Extract test case content (steps, expected results, UI elements referenced)

### Step 5: Filter UI-Facing Test Cases

Identify test cases that involve UI interaction:
- **Include**: Test cases with steps referencing UI elements (forms, buttons, pages, navigation, modals, dialogs, tables, images, links, menus, dropdowns)
- **Include**: Test cases with steps using UI verbs (Navigate, Click, Enter, Select, Upload, Verify display, Check visibility)
- **Exclude**: Test cases that are purely API/backend (steps only reference endpoints, database, services, queues)
- **Exclude**: Test cases tagged exclusively with `api`, `backend`, `integration-api`, `database`

Report the filtering results:
- Total test cases loaded
- UI-facing test cases identified
- Backend/API test cases excluded

### Step 6: Store Results

Store in memory:
- Selected folder path (e.g., `agent-qa/2026-03-09-PROJ-123/test-cases/`)
- Output context from folder name (issue key or `release`)
- List of UI-facing test cases with their full content and metadata
- List of excluded test cases (for reference)

## Important Constraints

- At least one test case folder must exist to proceed
- Only UI-facing test cases are relevant for accessibility testing
- If no UI-facing test cases are found after filtering, inform the user and stop
- Preserve the original test case IDs and requirement keys for traceability
