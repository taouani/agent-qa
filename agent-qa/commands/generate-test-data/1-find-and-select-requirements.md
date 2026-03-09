# Phase 1: Find and Select Requirements

## Core Responsibilities

Locate available requirements analysis folders and let the user select one.

## Workflow

Same pattern as other generate commands:

### Step 1: Scan for Output Folders

Search for `agent-qa/YYYY-MM-DD-*/requirements/` directories. List all matching folders sorted by date (most recent first).

### Step 2: Present Folder Options

Present available folders. If only one exists, auto-select it. If none exist, report: "No requirements analysis found. Run `analyze-requirements` first." and stop.

### Step 3: Confirm Selection

Confirm the selected folder. Also check if `test-cases/` exists in the same folder (optional but enriches data generation).

## Data Storage

Store:
- `selected_folder`: Path to selected output folder
- `has_test_cases`: Whether `test-cases/` subdirectory exists

## Constraints

- Do NOT modify any files
- Requirements analysis must exist in the selected folder
