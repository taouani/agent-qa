# Validate MCP Server

Validate that the repository MCP server is available and configured.

## Purpose

This instruction file provides a standardized way to validate MCP server availability based on the configured platform. Commands should use this framework file to ensure MCP servers are accessible before attempting operations.

## Core Responsibilities

1. **Get Platform Configuration**: Retrieve platform value from previous step
2. **Check Platform-Specific Tools**: Verify platform-specific MCP tools are available
3. **Validate MCP Server**: Ensure MCP server is properly connected
4. **Handle Errors**: Provide clear error messages for unavailable MCP servers

## Workflow

### Step 1: Get Platform Configuration

Retrieve the platform value from memory (set by `read-platform-config.md`):

- Platform should be one of: `github`, `gitlab`, `azure-devops`
- If platform not set, return error and request platform configuration

### Step 2: Check Platform-Specific MCP Tools

Based on the platform, check for available MCP server tools:

#### GitLab Platform

Check for GitLab MCP server tools:

1. **Check Core Tools**:
   - `mcp_gitlab_search_commits` - Must be available
   - `mcp_gitlab_get_merge_request` - Must be available
   - `mcp_gitlab_get_branch_diffs` - Must be available
   - `mcp_gitlab_get_merge_request_diffs` - Must be available
   - `mcp_gitlab_list_branches_by_repo` - Must be available
   - `mcp_gitlab_list_pull_requests_by_repo_or_project` - Must be available

2. **Verify Availability**:
   - Check if tools are accessible (not necessarily call them)
   - If any core tool is missing, proceed to error handling

#### GitHub Platform

Check for GitHub MCP server tools:

1. **Check Core Tools**:
   - GitHub commit search tools - Must be available
   - GitHub PR retrieval tools - Must be available
   - GitHub diff extraction tools - Must be available
   - GitHub branch listing tools - Must be available

2. **Verify Availability**:
   - Check if tools are accessible
   - If any core tool is missing, proceed to error handling
   - Note: Exact tool names depend on GitHub MCP server implementation

#### Azure DevOps Platform

Check for Azure DevOps MCP server tools:

1. **Check Core Tools**:
   - `mcp_Azure_DevOps_repo_search_commits` - Must be available
   - `mcp_Azure_DevOps_repo_get_pull_request_by_id` - Must be available
   - `mcp_Azure_DevOps_repo_get_branch_diffs` - Must be available

2. **Verify Availability**:
   - Check if tools are accessible
   - If any core tool is missing, proceed to error handling

### Step 3: Validate MCP Server Connection

Perform a lightweight validation to ensure MCP server is properly connected:

1. **Test Connection** (optional):
   - For GitLab: Can attempt a simple tool call to verify connection
   - For GitHub: Can attempt a simple tool call to verify connection
   - For Azure DevOps: Can attempt a simple tool call to verify connection

2. **Handle Connection Errors**:
   - If connection test fails, proceed to error handling
   - Document connection error for debugging

### Step 4: Error Handling

**If MCP Server Tools Not Available:**

```
❌ [Platform] MCP server not available

Please verify:
- [Platform] MCP server is installed and configured in IDE/Cursor
- MCP server is properly connected
- MCP server tools are accessible

For setup instructions, refer to [Platform] MCP server documentation.
```

**If MCP Server Connection Failed:**

```
❌ [Platform] MCP server connection failed

Please verify:
- MCP server is running
- Network connectivity is available
- Authentication credentials are valid
```

## Output

If successful:
- **MCP Server Status**: `available`
- **Platform**: Platform identifier
- **Tools Verified**: List of verified tools

## Usage Example

```markdown
## Step 2: Validate MCP Server

Follow the instructions in: `agent-qa/framework/git-repository/config/validate-mcp-server.md`

Ensure MCP server is available before proceeding with operations.
```

## Reference Patterns

This instruction file follows patterns from:
- `agent-qa/commands/analyze-requirements/1-initialize-and-determine-input.md` - MCP server initialization patterns

## Important Notes

- MCP server validation should be performed before any operations
- Framework validates tool availability, not necessarily functionality
- Clear error messages guide users to fix MCP server configuration
- Platform-specific tool names may vary (especially for GitHub)

