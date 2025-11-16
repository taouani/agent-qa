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
- Check if `requirements-index.md` exists (indicates valid requirements analysis)
- Collect folder information

### Step 2: List Available Options

Present available requirements analyses to user:

```
Found [N] requirements analysis folder(s):

1. 2025-01-15-PROJ-123 (Single issue: PROJ-123)
2. 2025-01-15-release (Release/Filter analysis)
3. 2025-01-14-PROJ-456 (Single issue: PROJ-456)
...

Please select which requirements analysis to use (enter number 1-[N]):
```

### Step 3: Wait for User Selection

Wait for user to provide selection number.

### Step 4: Validate Selection

- Validate selection is within range
- Verify selected folder exists and contains requirements
- Store selected folder path for subsequent phases

### Step 5: Determine Output Folder

Based on selected folder:
- Extract base folder: `agent-qa/YYYY-MM-DD-{folder-name}/`
- Create output folder: `agent-qa/YYYY-MM-DD-{folder-name}/test-charter/`
- Ensure output folder exists

## Important Constraints

- Only list folders with valid requirements analysis (requirements-index.md exists)
- Sort folders by date (newest first)
- Handle case where no requirements analysis found
- Create output folder structure

## Error Handling

If no requirements analysis found:
```
❌ No requirements analysis found in agent-qa/

Please run analyze-requirements command first.
```

If invalid selection:
```
❌ Invalid selection. Please choose a number between 1 and [N].
```

