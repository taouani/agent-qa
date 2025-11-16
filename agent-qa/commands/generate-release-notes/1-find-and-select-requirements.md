# PHASE 1: Find and Select Requirements Analysis

Find existing requirements analysis folders and prompt the user to select which one to use, or automatically call `analyze-requirements` if none found.

## Core Responsibilities

1. **Scan for Requirements Folders**: Find all folders matching pattern `agent-qa/YYYY-MM-DD-*/requirements/`
2. **List Available Options**: Present list of available requirements analyses to user
3. **Prompt User Selection**: Ask user to choose which requirements analysis to use
4. **Handle No Requirements**: Automatically call `analyze-requirements` if no requirements found
5. **Validate Selection**: Validate user's selection

## Workflow

### Step 1: Scan for Requirements Folders

Scan `agent-qa/` directory for folders matching pattern:
- `agent-qa/YYYY-MM-DD-*/requirements/`

For each matching folder:
- Extract date and folder name from path
- Check if `requirements-index.md` exists (indicates valid requirements analysis)
- Collect folder information

### Step 2: Handle No Requirements Found

If no requirements analysis folders found:

1. **Output Message**:
   ```
   ⚠️ No requirements analysis found in agent-qa/
   
   Automatically calling analyze-requirements command...
   ```

2. **Call `analyze-requirements` Command**:
   - Prompt user for input (Jira issue key, multiple keys, or JQL filter)
   - Execute `analyze-requirements` command workflow **with `include_commits=true`**
   - This ensures commit analysis is performed during requirements analysis
   - Wait for completion
   - Use the newly created requirements analysis folder

3. **Continue with Selected Folder**:
   - Use the folder created by `analyze-requirements`
   - Proceed to Step 5

### Step 3: List Available Options

If requirements analysis folders found, present available options to user:

```
Found [N] requirements analysis folder(s):

1. 2025-01-15-PROJ-123 (Single issue: PROJ-123)
2. 2025-01-15-release (Release/Filter analysis)
3. 2025-01-14-PROJ-456 (Single issue: PROJ-456)
...

Please select which requirements analysis to use for release notes (enter number 1-[N]):
```

### Step 4: Wait for User Selection

Wait for user to provide selection number.

### Step 5: Validate Selection

- Validate selection is within range
- Verify selected folder exists and contains requirements
- Store selected folder path for subsequent phases

### Step 6: Determine Output Folder

Based on selected folder:
- Extract base folder: `agent-qa/YYYY-MM-DD-{folder-name}/`
- Create output folder: `agent-qa/YYYY-MM-DD-{folder-name}/release-notes/`
- Ensure output folder exists

## Important Constraints

- Only list folders with valid requirements analysis (requirements-index.md exists)
- Sort folders by date (newest first)
- Handle case where no requirements analysis found (automatic `analyze-requirements` call)
- Create output folder structure

## Error Handling

If invalid selection:
```
❌ Invalid selection. Please choose a number between 1 and [N].
```

If `analyze-requirements` call fails:
```
❌ Failed to analyze requirements: [error message]

Please run analyze-requirements command manually and try again.
```

