# PHASE 1: Initialize MCP Connection and Create Context Folder

The FIRST STEP is to initialize and validate the Atlassian MCP server connection, and create the appropriate context folder based on input type.

## Core Responsibilities

1. **Determine Input Type**: Identify if input is a single Jira issue ID/key or a Jira filter
2. **Create Context Folder**: Create `agent-qa/requirement/` for single tickets or `agent-qa/release/` for filters
3. **Validate MCP Server Availability**: Check if Atlassian MCP server tools are accessible
4. **Test Connection**: Verify MCP server connection works
5. **Document Available Tools**: Identify and document available Atlassian MCP server tools

## Workflow

### Step 1: Determine Input Type and Create Context Folder

Before proceeding, determine the input type:

- **Single Jira Issue ID/Key**: If user provides a single ticket identifier (e.g., "PROJ-123" or numeric ID)
  - Create folder: `agent-qa/requirement/`
  - Use terminology: "requirement" throughout
- **Jira Filter**: If user provides a filter ID or JQL query
  - Create folder: `agent-qa/release/`
  - Use terminology: "release" throughout

Create the appropriate folder structure:
- Create the folder if it doesn't exist
- Clear any existing content if folder already exists (or handle as needed)
- Document which folder was created for reference in subsequent phases

### Step 2: Check MCP Server Tool Availability

Verify that Atlassian MCP server tools are available in the environment:

- Check for `mcp_Atlassian_getJiraIssue` tool availability
- Check for `mcp_Atlassian_searchJiraIssuesUsingJql` tool availability
- Check for `mcp_Atlassian_getAccessibleAtlassianResources` tool availability
- Verify MCP server is properly configured (handled by IDE/Cursor)

### Step 3: Test MCP Server Connection

Test the connection by attempting to access Atlassian resources:

1. Call `mcp_Atlassian_getAccessibleAtlassianResources` to verify connection
2. If successful, proceed to next phase
3. If failed, provide clear error message about MCP server unavailability

### Step 4: Document Available Tools

Document the available Atlassian MCP server tools and their purposes:

- **getJiraIssue**: Retrieve individual Jira ticket by issue key or ID
- **searchJiraIssuesUsingJql**: Search Jira issues using JQL queries
- **getAccessibleAtlassianResources**: Get cloud ID and accessible resources
- **getConfluencePage**: Retrieve Confluence pages (for future use)
- Other available tools as needed

### Step 5: Output Confirmation

If connection is successful, output:

```
✅ Context folder created: agent-qa/[requirement|release]/
✅ Atlassian MCP server connection validated
✅ Available tools identified and ready for use

Ready for [requirement|release] processing operations.
```

Note: Replace `[requirement|release]` with the actual folder name created based on input type.

If connection fails, output:

```
❌ Atlassian MCP server unavailable

Please verify:
- MCP server is configured in IDE/Cursor
- Network connectivity is available
- Atlassian credentials are properly set up
```

## Important Constraints

- MCP server authentication is handled by IDE/Cursor - no custom auth needed
- Connection validation should be non-blocking - provide clear error messages
- Document available tools for reference in subsequent phases

