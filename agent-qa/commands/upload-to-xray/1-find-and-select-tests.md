# Phase 1: Find and Select Tests

## Core Responsibilities

- Find available output folders from previous `generate-test-cases` runs
- Present options to the user and let them select
- Run the Xray preflight and stop the command if it reports anything other than `configured`

## Workflow Steps

### Step 1: Find Output Folders

Search for existing output folders that contain test cases:

1. List all directories matching `agent-qa/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*/test-cases/`
2. Sort by date (most recent first)
3. For each folder, count the number of test case markdown files, and note whether a sibling
   `gherkin/` subfolder also exists
4. If no folders found, inform the user: "No test cases found. Run /generate-test-cases first."
   and stop — there is nothing for this command to upload.

### Step 2: Present Options

Present the available folders to the user:

```
Available test case folders:
  1. agent-qa/2025-01-16-PROJ-123/ (test-cases: 3 files, gherkin: 2 files)
  2. agent-qa/2025-01-15-release/ (test-cases: 12 files, no gherkin)
```

- If only one folder exists, confirm it with the user
- Let the user select which folder to use

### Step 3: Confirm Selection

Confirm the selected folder and its contents with the user:

```
Selected: agent-qa/2025-01-16-PROJ-123/
  - test-cases/ (3 files)
  - gherkin/ (2 files)
```

### Step 4: Run the Xray Preflight

Follow the instructions in `@agent-qa/framework/xray/config/validate-xray.md` in full.

- If it reports **SKIP** (Xray not configured), show the user its SKIP message verbatim and stop
  this command here. This is not an error — Xray upload is simply unused for this project.
- If it reports **STOP** (misconfigured, credentials missing, or the credentials file is tracked
  by git), show the user its STOP message verbatim and stop this command here. Do not attempt any
  workaround and do not proceed to Phase 2.
- Only when it reports `configured` does this command continue to Phase 2.

### Step 5: Refuse Credentials Offered in Chat

If at any point in this phase (or any later phase) the user pastes or types an Xray or Jira
credential — an API token, a client secret, a password, a personal access token — refuse to use
it. State plainly that Agent-QA never types, accepts, or stores Xray/Jira credentials, and point
the user at `agent-qa/.xray-credentials` as the only place credentials belong. Do not echo the
value back, and do not write it anywhere.

## Data Storage

Store the following for subsequent phases:
- `selected_folder`: Path to the selected output folder (e.g., `agent-qa/2025-01-16-PROJ-123/`)
- `xray_platform`: `cloud` or `server`, from the preflight
- `xray_project_key`: from the preflight
- `has_gherkin`: whether the selected folder has a `gherkin/` subfolder

## Constraints

- Do NOT modify any existing files
- Do NOT create output files in this phase
- Do NOT read `agent-qa/.xray-credentials` directly — the preflight only checks that it exists
  and is not tracked by git; `scripts/xray/upload.py` is the only reader of its contents
- Do NOT accept, store, or repeat any credential value the user offers in chat
