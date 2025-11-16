# PHASE 7: Analyze Commits (Optional)

If `include_commits` parameter is true, analyze commits and correlate them with requirements.

## Core Responsibilities

1. **Check if Enabled**: Verify if `include_commits` parameter is true
2. **Call `analyze-commits` Command**: Execute commit analysis for the same Jira tickets
3. **Load Commit Analysis**: Load commit analysis results into memory
4. **Integrate with Requirements**: Integrate commit analysis data into requirement structures

## Workflow

### Step 1: Check if Commit Analysis is Enabled

Check the `include_commits` parameter value from Phase 1:

- If `include_commits` is `false` (default):
  - Skip this phase entirely
  - Proceed directly to Phase 8 (Generate Requirement Files)
  - Output: "ℹ️ Commit analysis disabled - skipping commit analysis phase"

- If `include_commits` is `true`:
  - Proceed with commit analysis
  - Output: "✅ Commit analysis enabled - analyzing commits for requirements"

### Step 2: Prepare Input for `analyze-commits` Command

Prepare input for the `analyze-commits` command:

1. **Extract Jira Ticket Keys**:
   - Get all Jira ticket keys from requirements analyzed in previous phases
   - If single issue: use the issue key
   - If multiple issues: use comma-separated list of keys
   - If JQL filter: use the same JQL query

2. **Get Repository Project ID**:
   - Read repository project ID from configuration or input
   - If not available, prompt user or use default from configuration

3. **Prepare Input Parameters**:
   - Jira input: Same as `analyze-requirements` input (ticket keys or JQL)
   - Repository project ID: From configuration or input
   - Date range: Optional, if provided in `analyze-requirements` input

### Step 3: Call `analyze-commits` Command

Execute the `analyze-commits` command workflow:

1. **Execute Command**:
   - Call `analyze-commits` command with prepared input
   - Use the same base folder: `agent-qa/YYYY-MM-DD-{folder-name}/`
   - Commit analysis will be stored in: `agent-qa/YYYY-MM-DD-{folder-name}/commits/`

2. **Wait for Completion**:
   - Wait for `analyze-commits` command to complete
   - Verify commit analysis files were generated

3. **Verify Output**:
   - Check if `commits/` subfolder exists
   - Check if `commits-index.md` exists
   - Verify commit analysis files were created

### Step 4: Load Commit Analysis Data

Load commit analysis results:

1. **Read Commits Index**:
   - Read `commits-index.md` from `commits/` subfolder
   - Extract list of commit analysis files

2. **Load Individual Commit Analysis Files**:
   - Read each commit analysis markdown file
   - Parse commit/PR data (correlation mapping, code changes, summaries, etc.)
   - Store commit analysis in memory

3. **Create Commit Analysis Structure**:
   ```
   {
     "commits": {
       "PROJ-123": {
         "commits": [...],
         "prs": [...],
         "code_changes": [...],
         "files_changed": [...],
         "summary": "..."
       }
     }
   }
   ```

### Step 5: Integrate Commit Analysis with Requirements

Integrate commit analysis data into requirement structures:

For each requirement:
1. **Find Matching Commit Analysis**:
   - Match requirement key with commit analysis (e.g., "PROJ-123")
   - If commit analysis found, integrate data

2. **Add Commit Information to Requirement Structure**:
   ```
   {
     key: "PROJ-123",
     summary: "...",
     // ... existing requirement fields ...
     commitAnalysis: {
       hasCommits: true,
       commits: [...],
       prs: [...],
       codeChanges: [...],
       filesChanged: [...],
       summary: "..."
     }
   }
   ```

3. **If No Commits Found**:
   ```
   {
     key: "PROJ-123",
     // ... existing requirement fields ...
     commitAnalysis: {
       hasCommits: false,
       message: "No code changes found for this requirement"
     }
   }
   ```

### Step 6: Store Integrated Data

Store requirement structures with integrated commit analysis in memory for Phase 8.

## Important Constraints

- Only execute if `include_commits` is `true`
- Use same base folder as requirements analysis
- Integrate commit analysis data into requirement structures
- Handle cases where no commits found (not an error)
- Continue to Phase 8 regardless of commit analysis results

## Error Handling

If `analyze-commits` command fails:
- Log error with context
- Continue to Phase 8 without commit analysis
- Document error in requirement files
- Output: "⚠️ Commit analysis failed - continuing without commit data"

If commit analysis files not found:
- Log warning
- Continue to Phase 8 without commit analysis
- Output: "⚠️ Commit analysis files not found - continuing without commit data"

Continue processing despite commit analysis failures.

