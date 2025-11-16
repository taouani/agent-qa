# PHASE 3: Process Epics and Child Stories

If epics are detected in the results, automatically process child stories recursively.

## Core Responsibilities

1. **Detect Epics**: Identify epic tickets in results
2. **Retrieve Child Stories**: Use dual detection method (Epic Link JQL and parent-child relationships)
3. **Process Recursively**: Handle multiple hierarchy levels
4. **Include in Results**: Add child stories to main results array

## Workflow

### Step 1: Detect Epic Tickets

For each issue in results:
- Check if `issueType = "Epic"`
- Track all epic tickets

### Step 2: Retrieve Child Stories for Each Epic

For each epic:
1. **Epic Link Method**: Query `"Epic Link" = {epic-key}`
2. **Parent-Child Method**: Query `parent = {epic-key}`
3. **Combine Results**: Merge both result sets, deduplicate
4. **Retrieve Full Details**: Use `mcp_Atlassian_getJiraIssue` for each child story

### Step 3: Process Recursively

For each child story:
- If it's an epic or has children, recursively process its children
- Track hierarchy depth to prevent infinite loops
- Maintain parent-child relationships in data structures

### Step 4: Add Child Stories to Results

Add all child stories to the main results array, maintaining hierarchy information.

## Important Constraints

- Use dual detection method for complete coverage
- Support multiple hierarchy levels
- Prevent infinite recursion
- Maintain hierarchy relationships

