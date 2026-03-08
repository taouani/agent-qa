# PHASE 1: Initialize and Determine Input

The FIRST STEP is to initialize the repository MCP server connection, read repository platform configuration, determine input type, and create the appropriate output folder structure.

## Core Responsibilities

1. **Read Repository Platform Configuration**: Read repository platform from agent configuration (YAML file)
2. **Validate Repository MCP Server Connection**: Check if repository MCP server tools are accessible
3. **Determine Input Type**: Identify if input is a Jira filter, fixVersion, single ticket key, or multiple ticket keys
4. **Read Repository Project ID**: Read repository project ID from input or configuration
5. **Handle Optional Date Range**: Process optional date range parameter if provided
6. **Create Output Folder**: Create dated folder structure based on input type

## Workflow

### Step 1: Read Repository Platform Configuration

Read the repository platform setting from agent configuration:

1. **Locate Configuration File**:
   - Check for `agent-qa/config.yml`
   - Look for `repository_platform` setting
   - Supported values: `github`, `gitlab`, `azure-devops` (case-insensitive)

2. **Read Platform Setting**:
   - Read repository platform value from configuration
   - Validate platform is one of: GitHub, GitLab, or Azure DevOps
   - Handle missing configuration with clear error message

3. **Error Handling**:
   - If configuration file not found, provide error message:
     ```
     ❌ Repository platform configuration not found
     
     Please configure repository platform in agent-qa/config.yml:
     repository_platform: [github|gitlab|azure-devops]
     ```
   - If platform value is invalid, provide error message:
     ```
     ❌ Invalid repository platform: [value]
     
     Supported platforms: github, gitlab, azure-devops
     ```

### Step 2: Detect Available MCP Server Tools Based on Platform

Based on the detected platform, check for available MCP server tools:

1. **GitLab Platform**:
   - Check for `mcp_gitlab_search_commits` tool availability
   - Check for `mcp_gitlab_get_merge_request` tool availability
   - Check for `mcp_gitlab_get_branch_diffs` tool availability
   - Check for `mcp_gitlab_get_merge_request_diffs` tool availability
   - Verify GitLab MCP server is available and configured

2. **GitHub Platform**:
   - Check for GitHub MCP tools (equivalent to GitLab tools)
   - Verify GitHub MCP server is available and configured

3. **Azure DevOps Platform**:
   - Check for Azure DevOps MCP tools (equivalent to GitLab/GitHub tools)
   - Verify Azure DevOps MCP server is available and configured

4. **Platform Abstraction**:
   - Document platform-specific tool mappings
   - Create unified interface concept for commit/PR retrieval across platforms
   - Handle platform detection errors gracefully

5. **Error Handling**:
   - If MCP server tools not available, provide error message:
     ```
     ❌ [Platform] MCP server not available
     
     Please verify:
     - [Platform] MCP server is installed and configured in IDE/Cursor
     - MCP server is properly connected
     ```

### Step 3: Determine Input Type

Analyze the input parameter to determine its type:

- **Jira Filter (JQL Query)**: Input contains JQL query patterns (e.g., "project = PROJ AND status = Open")
  - Store input as JQL query
  - Set folder name to "release"
  
- **FixVersion**: Input is a fixVersion identifier (e.g., "v1.2.3" or "Release-2025-01")
  - Store input as fixVersion
  - Set folder name to "release"
  
- **Single Jira Ticket Key**: Input matches pattern `[PROJECT-KEY]-[NUMBER]` (e.g., "PROJ-123")
  - Store input as single issue key
  - Set folder name to the issue key (e.g., "PROJ-123")
  
- **Multiple Jira Ticket Keys**: Input contains comma-separated issue keys (e.g., "PROJ-123, PROJ-124, PROJ-125")
  - Parse comma-separated keys
  - Validate each key format
  - Set folder name to "release"

**Input Processing Logic:**

1. **Detect Input Type**:
   - If input matches single issue key pattern → Single Issue Key
   - If input contains commas and issue key patterns → Multiple Issue Keys
   - If input contains "=", "AND", "OR", "IN", "NOT" → JQL Query
   - If input matches fixVersion pattern → FixVersion

2. **Validate Input Format**:
   - Ensure input is not empty
   - Provide informative error messages for invalid input
   - Handle edge cases (empty input, malformed keys, invalid JQL)

### Step 4: Read Repository Project ID

Read repository project ID from input or configuration:

1. **Check Input Parameters**:
   - Look for `repository_project_id` in input parameters
   - If provided, use it directly

2. **Check Configuration**:
   - If not in input, check configuration file for `repository_project_id`
   - Use configured project ID if available

3. **Error Handling**:
   - If project ID not found, provide error message:
     ```
     ❌ Repository project ID not found
     
     Please provide repository project ID:
     - As input parameter: repository_project_id=[ID]
     - Or configure in config.yml: repository_project_id: [ID]
     ```

### Step 5: Handle Optional Date Range

Process optional date range parameter if provided:

1. **Check for Date Range**:
   - Look for `date_from` and `date_to` parameters
   - Validate date format (YYYY-MM-DD or ISO 8601)
   - Store date range for use in commit filtering

2. **Date Range Validation**:
   - Ensure `date_from` is before `date_to`
   - Handle invalid date formats gracefully
   - If date range invalid, warn but continue without filtering

### Step 6: Create Output Folder Structure

Create the output folder structure using the following pattern:

```
agent-qa/$(date +%Y-%m-%d)-$(folder-name)/commits/
```

Where:
- `$(date +%Y-%m-%d)` is the current date in YYYY-MM-DD format
- `$(folder-name)` is:
  - The issue key if single issue (e.g., "PROJ-123")
  - "release" if multiple issues, JQL filter, or fixVersion

**Examples:**
- Single issue "PROJ-123" on 2025-01-15 → `agent-qa/2025-01-15-PROJ-123/commits/`
- Multiple issues or filter on 2025-01-15 → `agent-qa/2025-01-15-release/commits/`

**Folder Creation Steps:**

1. Get current date in YYYY-MM-DD format
2. Construct folder path: `agent-qa/YYYY-MM-DD-{folder-name}/commits/`
3. Create folder structure (create parent directories if needed)
4. Store folder path in memory for subsequent phases

### Step 7: Document Configuration and Folder Structure

Document the configuration and folder structure:

- Store repository platform (GitHub, GitLab, or Azure DevOps)
- Store repository project ID
- Store date range if provided
- Store the base folder path: `agent-qa/YYYY-MM-DD-{folder-name}/`
- Store the commits folder path: `agent-qa/YYYY-MM-DD-{folder-name}/commits/`
- Store input type and folder name for reference

### Step 8: Output Confirmation

If initialization is successful, output:

```
✅ Repository platform detected: [GitHub|GitLab|Azure DevOps]
✅ Repository MCP server connection validated
✅ Input type determined: [JQL filter|fixVersion|single issue|multiple issues]
✅ Repository project ID: [ID]
✅ Output folder created: agent-qa/YYYY-MM-DD-{folder-name}/commits/

Ready for commit analysis.
```

If initialization fails, output:

```
❌ Initialization failed: [error message]

Please verify:
- Repository platform is configured in config.yml
- MCP server is configured in IDE/Cursor
- Input format is correct (JQL query, fixVersion, or issue key)
- Repository project ID is provided
- Network connectivity is available
```

## Important Constraints

- Repository platform configuration is read from YAML config file (not command-line)
- MCP server authentication is handled by IDE/Cursor - no custom auth needed
- Folder names use issue key for single issues, "release" for multiple issues/filters
- Date format must be YYYY-MM-DD
- Create full folder structure including parent directories
- Platform abstraction handles differences between MCP servers transparently

