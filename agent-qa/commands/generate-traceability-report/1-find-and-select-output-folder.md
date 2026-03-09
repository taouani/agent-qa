# Phase 1: Find and Select Output Folder

## Core Responsibilities

Locate available Agent-QA output folders and let the user select one for traceability analysis.

## Workflow

### Step 1: Scan for Output Folders

Search for output folders matching `agent-qa/YYYY-MM-DD-*/`:

1. List all matching directories
2. For each folder, list which deliverable subdirectories exist
3. Sort by date (most recent first)

### Step 2: Present Folder Options

Present folders to user with their deliverable inventory. Highlight folders that have multiple deliverable types (more useful for traceability).

If no folders exist, report: "No output folders found. Run `analyze-requirements` first." and stop.

### Step 3: Confirm Selection

Confirm the selected folder and report which deliverable types are available for traceability mapping.

## Data Storage

Store:
- `selected_folder`: Path to selected output folder
- `available_deliverables`: List of deliverable types found (requirements, test-cases, gherkin, playwright, etc.)

## Constraints

- Do NOT modify any files
- At minimum, `requirements/` must exist to generate a traceability report
