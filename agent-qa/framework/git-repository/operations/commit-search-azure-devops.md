# Commit Search - Azure DevOps Implementation

Azure DevOps-specific implementation of commit search operation.

## Purpose

This instruction file implements commit search for Azure DevOps platform. It is called automatically by the unified `operations/commit-search.md` interface when platform is `azure-devops`.

## Core Responsibilities

1. **Get Cloud ID**: Retrieve Azure DevOps cloud ID (required)
2. **Map Unified Parameters**: Transform unified parameters to Azure DevOps-specific parameters
3. **Call Azure DevOps MCP Tool**: Use `mcp_Azure_DevOps_repo_search_commits` tool
4. **Handle Pagination**: Manage Azure DevOps pagination (skip, top)
5. **Transform Response**: Transform Azure DevOps response to standardized format

## Workflow

### Step 1: Get Cloud ID

Retrieve Azure DevOps cloud ID from memory (set by `config/get-cloud-id.md`):

- Cloud ID is required for all Azure DevOps operations
- If cloud ID not set, return error and request cloud ID configuration

### Step 2: Parse Repository Project ID

Azure DevOps requires separate `project` and `repository` parameters:

- Parse `repository_project_id` to extract `project` and `repository`
- Or use separate `project` and `repository` parameters if provided
- If parsing fails, return error with guidance

### Step 3: Map Unified Parameters to Azure DevOps Parameters

Transform unified parameters to Azure DevOps-specific format:

- `cloudId` → `cloudId` (from Step 1)
- `project` → `project` (parsed from repository_project_id)
- `repository` → `repository` (parsed from repository_project_id)
- `branch_name` → `version` (optional, branch name format)
- `commit_message` → `searchText` (optional, if provided)
- `date_range` → `fromDate`/`toDate` (optional, parse date range string)
- `pagination` → `skip`/`top` (optional, parse pagination parameters)

### Step 4: Call Azure DevOps MCP Tool

Call `mcp_Azure_DevOps_repo_search_commits` with mapped parameters:

```markdown
Call: mcp_Azure_DevOps_repo_search_commits
Parameters:
- cloudId: [from Step 1]
- project: [parsed from repository_project_id]
- repository: [parsed from repository_project_id]
- version: [mapped from branch_name, if provided]
- searchText: [mapped from commit_message, if provided]
- fromDate: [parsed from date_range, if provided]
- toDate: [parsed from date_range, if provided]
- skip: [from pagination, if provided]
- top: [from pagination, if provided]
```

### Step 5: Handle Pagination

If pagination is needed:

1. **Check Response**: Check if more results are available
2. **Request Next Page**: If more results, call tool again with incremented `skip` value
3. **Combine Results**: Combine results from all pages
4. **Return Combined Results**: Return all commits in single array

### Step 6: Transform Azure DevOps Response to Standardized Format

Transform each Azure DevOps commit to standardized format (see `formats/commit-metadata-format.md`):

**Azure DevOps Commit Fields → Standardized Fields:**
- `commitId` → `hash`
- `author.name` → `author`
- `author.date` → `date` (format to ISO 8601)
- `comment` → `message`
- `branch_name` (from context) → `branch_name`
- `project/repository` → `repository_project_id`

### Step 7: Return Standardized Output

Return array of standardized commit metadata objects.

## Error Handling

Handle Azure DevOps-specific errors according to:
- `errors/common-error-handling.md` - Common error patterns
- `errors/mcp-server-errors.md` - MCP server error handling
- `errors/repository-errors.md` - Repository error handling
- `errors/unauthorized-errors.md` - OAuth authorization errors

**Azure DevOps-Specific Errors:**
- Cloud ID not found → Configuration error
- Project not found → Repository error
- Repository not found → Repository error
- Invalid branch name → Repository error
- OAuth token expired → Unauthorized error

## Reference

- **Unified Interface**: `operations/commit-search.md`
- **MCP Tool Mapping**: `operations/mcp-tool-mapping-azure-devops.md`
- **Output Format**: `formats/commit-metadata-format.md`
- **Cloud ID**: `config/get-cloud-id.md`

## Important Notes

- Cloud ID is required for all Azure DevOps operations
- Azure DevOps requires separate `project` and `repository` parameters
- Azure DevOps uses `skip`/`top` for pagination (not page numbers)
- Azure DevOps authentication uses OAuth tokens

