# PHASE 1: Initialize and Determine Input Type

The FIRST STEP is to initialize the Atlassian MCP server connection, determine input type, and create the appropriate output folder structure.

## Core Responsibilities

1. **Validate MCP Server Connection**: Check if Atlassian MCP server tools are accessible
2. **Determine Input Type**: Identify if input is a single Jira issue key, multiple issue keys, or JQL filter
3. **Read Optional Parameter**: Read `include_commits` parameter (default: false)
4. **Create Output Folder**: Create dated folder structure based on input type
5. **Document Folder Structure**: Document the folder path for subsequent phases

## Workflow

### Step 1: Validate MCP Server Connection

Verify that Atlassian MCP server tools are available:

1. Check for `mcp_Atlassian_getAccessibleAtlassianResources` tool availability
2. Call `mcp_Atlassian_getAccessibleAtlassianResources` to verify connection
3. If successful, proceed to next step
4. If failed, provide clear error message about MCP server unavailability

### Step 2: Determine Input Type

Analyze the input parameter to determine its type:

- **Single Jira Issue Key**: Input matches pattern `[PROJECT-KEY]-[NUMBER]` (e.g., "PROJ-123")
  - Store input as single issue key
  - Set folder name to the issue key (e.g., "PROJ-123")
  
- **Multiple Jira Issue Keys**: Input contains comma-separated issue keys (e.g., "PROJ-123, PROJ-124, PROJ-125")
  - Parse comma-separated keys
  - Validate each key format
  - Set folder name to "release"
  
- **JQL Filter**: Input contains JQL query patterns (e.g., "project = PROJ AND status = Open")
  - Store input as JQL query
  - Set folder name to "release"

**Input Processing Logic:**

1. **Detect Input Type**:
   - If input matches single issue key pattern → Single Issue Key
   - If input contains commas and issue key patterns → Multiple Issue Keys
   - If input contains "=", "AND", "OR", "IN", "NOT" → JQL Query

2. **Validate Input Format**:
   - Ensure input is not empty
   - Provide informative error messages for invalid input
   - Handle edge cases (empty input, malformed keys, invalid JQL)

### Step 3: Read Optional Parameter

Read the optional `include_commits` parameter:

1. **Check for Parameter**:
   - Look for `include_commits` in input parameters
   - Default value: `false` if not provided

2. **Validate Parameter**:
   - Ensure value is boolean (`true` or `false`)
   - Handle case-insensitive input ("True", "TRUE", "true" all treated as `true`)
   - If invalid value provided, default to `false` and warn user

3. **Store Parameter**:
   - Store `include_commits` value in memory for subsequent phases
   - Document whether commit analysis will be performed

4. **Output Confirmation**:
   - If `include_commits` is `true`, output: "✅ Commit analysis enabled - commits will be analyzed and included in requirement analysis"
   - If `include_commits` is `false` (default), no special output needed

### Step 4: Create Output Folder Structure

Create the output folder structure using the following pattern:

```
agent-qa/$(date +%Y-%m-%d)-$(folder-name)/requirements/
```

Where:
- `$(date +%Y-%m-%d)` is the current date in YYYY-MM-DD format
- `$(folder-name)` is:
  - The issue key if single issue (e.g., "PROJ-123")
  - "release" if multiple issues or JQL filter

**Examples:**
- Single issue "PROJ-123" on 2025-01-15 → `agent-qa/2025-01-15-PROJ-123/requirements/`
- Multiple issues or filter on 2025-01-15 → `agent-qa/2025-01-15-release/requirements/`

**Folder Creation Steps:**

1. Get current date in YYYY-MM-DD format
2. Construct folder path: `agent-qa/YYYY-MM-DD-{folder-name}/requirements/`
3. Create folder structure (create parent directories if needed)
4. Store folder path in memory for subsequent phases

### Step 5: Document Folder Structure

Document the created folder structure:

- Store the base folder path: `agent-qa/YYYY-MM-DD-{folder-name}/`
- Store the requirements folder path: `agent-qa/YYYY-MM-DD-{folder-name}/requirements/`
- Store input type and folder name for reference

### Step 6: Output Confirmation

If initialization is successful, output:

```
✅ Atlassian MCP server connection validated
✅ Input type determined: [single issue|multiple issues|JQL filter]
✅ Output folder created: agent-qa/YYYY-MM-DD-{folder-name}/requirements/

Ready for requirements analysis.
```

If initialization fails, output:

```
❌ Initialization failed: [error message]

Please verify:
- MCP server is configured in IDE/Cursor
- Input format is correct (issue key or JQL query)
- Network connectivity is available
```

## Important Constraints

- MCP server authentication is handled by IDE/Cursor - no custom auth needed
- Folder names use issue key for single issues, "release" for multiple issues/filters
- Date format must be YYYY-MM-DD
- Create full folder structure including parent directories

