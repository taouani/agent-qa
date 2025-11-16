# PHASE 1: Find and Select Requirements Analysis

Find existing requirements analysis folders and prompt the user to select which one to use.

## Core Responsibilities

1. **Scan for Requirements Folders**: Find all folders matching pattern `agent-qa/YYYY-MM-DD-*/requirements/`
2. **List Available Options**: Present list of available requirements analyses to user
3. **Prompt User Selection**: Ask user to choose which requirements analysis to use
4. **Validate Selection**: Validate user's selection

## Workflow

### Step 1: Scan for Requirements Folders

Scan `agent-qa/` directory for folders matching pattern:
- `agent-qa/YYYY-MM-DD-*/requirements/`

For each matching folder:
- Extract date and folder name from path
- Check if `requirements-index.md` exists
- Collect folder information

### Step 2: List Available Options

Present available requirements analyses to user (same as generate-test-charter Phase 1).

### Step 3: Wait for User Selection

Wait for user to provide selection number.

### Step 4: Validate Selection

Validate selection and store selected folder path.

### Step 5: Determine Output Folder

Based on selected folder:
- Extract base folder: `agent-qa/YYYY-MM-DD-{folder-name}/`
- Create output folder: `agent-qa/YYYY-MM-DD-{folder-name}/test-strategy/`
- Ensure output folder exists

## Important Constraints

- Only list folders with valid requirements analysis
- Sort folders by date (newest first)
- Handle case where no requirements analysis found

