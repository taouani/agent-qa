# Phase 1: Find and Select Output Folder

## Core Responsibilities

Locate available Agent-QA output folders and let the user select one to validate.

## Workflow

### Step 1: Scan for Output Folders

Search for output folders matching the pattern `agent-qa/YYYY-MM-DD-*/`:

1. List all directories under `agent-qa/` matching the date-context pattern
2. For each folder, list which deliverable subdirectories exist (requirements, test-cases, etc.)
3. Sort by date (most recent first)

### Step 2: Present Folder Options

If multiple output folders exist, present them to the user:

```
Available output folders:
  [1] agent-qa/2025-01-16-PROJ-123/ (requirements, test-cases, test-strategy)
  [2] agent-qa/2025-01-15-release/ (requirements, test-cases, gherkin, playwright)
  [3] agent-qa/2025-01-14-PROJ-456/ (requirements)
```

If only one folder exists, auto-select it.

If no folders exist, report: "No output folders found. Run `analyze-requirements` first." and stop.

### Step 3: Confirm Selection

Confirm the selected folder with the user and list the deliverables found:

```
Selected: agent-qa/2025-01-16-PROJ-123/
Deliverables found:
  - requirements/ (3 files)
  - test-cases/ (4 files)
  - test-strategy/ (1 file)
```

## Data Storage

Store in memory:
- `selected_folder`: Path to selected output folder
- `deliverable_dirs`: List of deliverable subdirectories found
- `file_inventory`: Map of subdirectory → list of files

## Constraints

- Do NOT modify any files
- Only scan `agent-qa/` directories matching the `YYYY-MM-DD-*` pattern
