# Phase 1: Select Deliverables

## Core Responsibilities

- Find available Agent-QA output folders
- Present deliverable options to the user
- Read Confluence configuration from `agent-qa/config.yml`

## Workflow Steps

### Step 1: Find Output Folders

Search for existing `agent-qa/YYYY-MM-DD-*/` directories in the project:

1. List all directories matching the pattern `agent-qa/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*/`
2. Sort by date (most recent first)
3. If no folders found, inform the user and stop: "No Agent-QA output folders found. Run /analyze-requirements first."

### Step 2: User Selects Output Folder

Present the list of available output folders to the user:
- Show folder name, date, and context (issue key or "release")
- Let the user select which folder to use
- If only one folder exists, confirm it with the user

### Step 3: List Available Deliverables

Within the selected folder, check for these subdirectories:

| Subfolder | Deliverable Type |
|-----------|-----------------|
| `requirements/` | Requirements Analysis |
| `test-cases/` | Test Cases |
| `test-strategy/` | Test Strategy |
| `test-charter/` | Test Charter |
| `test-plan/` | Test Plan |
| `risk-register/` | Risk Register |
| `release-notes/` | Release Notes |

For each subdirectory that exists, list the markdown files within it.

### Step 4: User Selects Deliverables

Present the available deliverables to the user:
- Allow the user to select one or more deliverables to convert
- Option to select "all" deliverables
- Show file names and types

### Step 5: Read Configuration

Read `agent-qa/config.yml` for Confluence settings:

```yaml
confluence_space_key: ""
confluence_parent_page_id: ""
```

- Store `confluence_space_key` and `confluence_parent_page_id` for Phase 3
- If both are empty, inform the user that files will be generated but not published
- If only one is set, warn that both are required for publishing

## Data Storage

Store the following for subsequent phases:
- `selected_folder`: Path to the selected output folder
- `selected_deliverables`: List of deliverable files to convert (full paths)
- `confluence_space_key`: From config (may be empty)
- `confluence_parent_page_id`: From config (may be empty)
- `publishing_enabled`: Boolean indicating if both Confluence settings are configured

## Constraints

- Do NOT modify any existing files in this phase
- Do NOT create any output files in this phase
- Only read and present information to the user
