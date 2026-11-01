# Phase 1: Find and Select Test Cases

## Core Responsibilities

- Find available test case folders from previous `generate-test-cases` runs
- Let the user select the folder and the specific test cases to explore
- Warn about exploration cost before starting

## Workflow Steps

### Step 1: Find Test Case Folders

1. List all directories matching `agent-qa/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*/test-cases/`
2. Sort by date, most recent first
3. Count test case markdown files in each
4. If none found, report "No test cases found. Run /generate-test-cases first." and stop

### Step 2: Present Options

Present the folders with file counts and let the user select one.

### Step 3: Load and Select Individual Test Cases

Parse the test case files as `generate-gherkin` phase 1 does, extracting for each test case: id,
summary, priority, preconditions, steps with action and expected result, test data, and the
linked requirement key.

Then present the test cases and ask which to explore. Exploration drives a real browser one step
at a time, so it is slow and requires a working environment. Default to the P1 test cases and
state that default explicitly. Never explore the whole set without being asked.

### Step 4: Confirm Prerequisites

Tell the user what is about to happen and what they must have ready:

```
Exploring {n} test cases in a live browser session.
Required: the application reachable at the configured base URL, and credentials for a manual
login if no valid auth state exists.
Proceed? (yes/no)
```

## Data Storage

- `selected_folder`: parent output folder
- `test_cases`: the confirmed subset, each with ordered steps
- `requirement_keys`, `source_language`

## Constraints

- Do NOT start a browser session in this phase
- Do NOT modify any existing file
- Never default to exploring every test case
