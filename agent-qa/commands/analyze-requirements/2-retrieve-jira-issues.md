# PHASE 2: Retrieve Jira Issues

Retrieve all Jira issues matching the input (single issue key, multiple issue keys, or JQL filter).

## Core Responsibilities

1. **Process Input**: Convert input to JQL query if needed
2. **Retrieve Issues**: Use MCP server to retrieve all matching issues
3. **Handle Pagination**: Retrieve all pages if result set is large
4. **Store Issues**: Store retrieved issues in memory for subsequent phases

## Workflow

### Step 1: Convert Input to JQL Query

Based on input type determined in Phase 1:

- **Single Issue Key**: Convert to `key = {issue-key}`
- **Multiple Issue Keys**: Convert to `key IN ({key1}, {key2}, ...)`
- **JQL Filter**: Use as-is

### Step 2: Get Cloud ID

Call `mcp_Atlassian_getAccessibleAtlassianResources` to get cloud ID.

### Step 3: Retrieve Issues

Use `mcp_Atlassian_searchJiraIssuesUsingJql` with:
- `cloudId`: From Step 2
- `jql`: From Step 1
- `maxResults`: 100 (handle pagination)
- `fields`: All required fields (summary, description, status, issuetype, assignee, reporter, created, updated, labels, components, fixVersions, custom fields, sprint, epicLink, parent)

### Step 4: Handle Pagination

If `nextPageToken` is present:
- Continue fetching pages until all issues retrieved
- Combine all results into single list

### Step 5: Store Issues in Memory

Store all retrieved issues in memory for subsequent phases.

## Important Constraints

- Retrieve ALL matching issues (no pagination limits)
- Handle empty results gracefully (not an error)
- Store issues in accessible data structure

