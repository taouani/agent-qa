# PHASE 2: Retrieve Jira Tickets

Retrieve all Jira tickets matching the input (JQL filter, fixVersion, single ticket key, or multiple ticket keys).

## Core Responsibilities

1. **Process Input**: Convert input to JQL query if needed
2. **Retrieve Tickets**: Use Atlassian MCP server to retrieve all matching tickets
3. **Handle Pagination**: Retrieve all pages if result set is large
4. **Store Tickets**: Store retrieved tickets in memory for correlation phase

## Workflow

### Step 1: Convert Input to JQL Query

Based on input type determined in Phase 1:

- **Single Issue Key**: Convert to `key = {issue-key}` (e.g., `key = PROJ-123`)
- **Multiple Issue Keys**: Convert to `key IN ({key1}, {key2}, ...)` (e.g., `key IN (PROJ-123, PROJ-124, PROJ-125)`)
- **JQL Filter**: Use as-is
- **FixVersion**: Convert to `fixVersion = {fixVersion}` or `fixVersion IN ({v1}, {v2}, ...)` if multiple

### Step 2: Get Cloud ID

Call `mcp_Atlassian_getAccessibleAtlassianResources` to get cloud ID for Atlassian instance.

### Step 3: Retrieve Tickets

Use `mcp_Atlassian_searchJiraIssuesUsingJql` with:
- `cloudId`: From Step 2
- `jql`: From Step 1
- `maxResults`: 100 (handle pagination)
- `fields`: All required fields (summary, description, status, issuetype, assignee, reporter, created, updated, labels, components, fixVersions, custom fields, sprint, epicLink, parent, key)

### Step 4: Handle Pagination

If `nextPageToken` is present in response:
- Continue fetching pages using `nextPageToken`
- Combine all results into single list
- Track total tickets retrieved

### Step 5: Store Tickets in Memory

Store all retrieved tickets in memory for subsequent phases:
- Store ticket key for each ticket (for correlation)
- Store ticket summary, description, status, and other metadata
- Store tickets in accessible data structure (array/object)
- Track ticket count

### Step 6: Handle Empty Results

If no tickets found:
- Document as empty result (not an error)
- Continue to next phase (will result in empty commit analysis)
- Output message: "No Jira tickets found matching input. Commit analysis will be empty."

## Important Constraints

- Retrieve ALL matching tickets (no pagination limits)
- Handle empty results gracefully (not an error)
- Store tickets in accessible data structure for correlation phase
- Extract ticket keys for correlation with commits/PRs

## Error Handling

If JQL query is invalid:
```
❌ Invalid JQL query: [query]

Please verify JQL syntax and try again.
```

If MCP server error occurs:
```
❌ Failed to retrieve Jira tickets: [error message]

Please verify:
- Atlassian MCP server is configured
- Network connectivity is available
- JQL query is valid
```

