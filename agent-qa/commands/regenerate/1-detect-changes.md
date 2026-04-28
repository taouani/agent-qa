# PHASE 1: Detect Requirement Changes

Detect what has changed in source requirements since deliverables were last generated.

## Core Responsibilities

1. **Scan Output Folders**: Find existing output folders and present for user selection
2. **Read Generation Metadata**: Extract source requirements and generation timestamps from deliverable YAML front matter
3. **Fetch Current Requirement State**: Retrieve current Jira issue state for each source requirement
4. **Compare Timestamps**: Identify requirements updated after deliverable generation
5. **Classify Changes**: Categorize what changed in each modified requirement

## Workflow

### Step 1: Scan for Existing Output Folders

Scan `agent-qa/` for directories matching the pattern `YYYY-MM-DD-*/`:

1. List all matching folders with their contents summary (subfolder count, file count)
2. Present the list to the user for selection
3. If no output folders found, inform the user and stop

### Step 2: Read Generation Metadata

From the selected output folder:

1. Read `README.md` to understand what was generated and from which requirements
2. Scan all deliverable files across all subfolders
3. For each deliverable file, read YAML front matter to extract:
   - `source_requirements` list
   - `generated` timestamp
   - `type` deliverable type
   - `language` code
   - `version` number
4. Build a consolidated list of all unique source requirement keys with their earliest `generated` timestamp

### Step 3: Fetch Current Requirement State

For each source requirement key:

1. Use `mcp_Atlassian_jira_get_issue` to fetch the current state of the Jira issue
2. Extract the issue's `updated` timestamp from the response
3. Compare the issue's `updated` timestamp against the deliverable's `generated` timestamp
4. If the issue was updated AFTER the deliverable was generated, flag it as **changed**
5. If the issue was NOT updated after generation, flag it as **unchanged**

### Step 4: Identify What Changed

For each changed requirement, compare current state against the original requirement file (`requirements/{KEY}.md`) if it exists:

1. **Summary/title changes**: Compare current summary with stored summary
2. **Description changes**: Compare current description with stored description
3. **Acceptance criteria changes**: Compare current acceptance criteria with stored criteria
4. **Priority changes**: Compare current priority with stored priority
5. **Status changes**: Compare current status with stored status
6. **Link changes**: Identify new linked issues or removed links

### Step 5: Store Phase Results

Store in memory for subsequent phases:

- Selected output folder path
- Changed requirements list with detailed change descriptions
- Unchanged requirements list
- Original generation timestamps per deliverable
- Current requirement content for changed requirements

## Constraints

- Do NOT modify any files in this phase
- If Atlassian MCP is unavailable, ask the user to manually specify which requirements changed
- If no requirements changed, inform the user that all deliverables are up to date and stop
- Handle MCP errors gracefully: retry once, then log and continue
- Respect the MCP fallback strategy defined in `@.claude/rules/mcp-usage.md`
