# Commit Search - GitLab Implementation

GitLab-specific implementation of commit search operation.

## Purpose

This instruction file implements commit search for GitLab platform. It is called automatically by the unified `operations/commit-search.md` interface when platform is `gitlab`.

## Core Responsibilities

1. **Map Unified Parameters**: Transform unified parameters to GitLab-specific parameters
2. **Call GitLab MCP Tool**: Use `mcp_gitlab_search_commits` tool
3. **Handle Pagination**: Manage GitLab pagination (page, per_page)
4. **Transform Response**: Transform GitLab response to standardized format

## Workflow

### Step 1: Map Unified Parameters to GitLab Parameters

Transform unified parameters to GitLab-specific format:

- `repository_project_id` → `project_id` (GitLab accepts numeric ID or path)
- `branch_name` → `branch` (optional, if provided)
- `commit_message` → `searchText` (optional, if provided)
- `date_range` → `fromDate`/`toDate` (optional, parse date range string)
- `pagination` → `page`/`per_page` (optional, parse pagination parameters)

### Step 2: Call GitLab MCP Tool

Call `mcp_gitlab_search_commits` with mapped parameters:

```markdown
Call: mcp_gitlab_search_commits
Parameters:
- project_id: [mapped from repository_project_id]
- branch: [mapped from branch_name, if provided]
- searchText: [mapped from commit_message, if provided]
- fromDate: [parsed from date_range, if provided]
- toDate: [parsed from date_range, if provided]
- page: [from pagination, if provided]
- per_page: [from pagination, if provided]
```

### Step 3: Handle Pagination

If pagination is needed:

1. **Check Response**: Check if more pages are available
2. **Request Next Page**: If more pages, call tool again with incremented page number
3. **Combine Results**: Combine results from all pages
4. **Return Combined Results**: Return all commits in single array

### Step 4: Transform GitLab Response to Standardized Format

Transform each GitLab commit to standardized format (see `formats/commit-metadata-format.md`):

**GitLab Commit Fields → Standardized Fields:**
- `id` → `hash`
- `author_name` → `author`
- `committed_date` → `date` (format to ISO 8601)
- `message` → `message`
- `branch_name` (from context) → `branch_name`
- `project_id` → `repository_project_id`

### Step 5: Return Standardized Output

Return array of standardized commit metadata objects.

## Error Handling

Handle GitLab-specific errors according to:
- `errors/common-error-handling.md` - Common error patterns
- `errors/mcp-server-errors.md` - MCP server error handling
- `errors/repository-errors.md` - Repository error handling

**GitLab-Specific Errors:**
- Project not found → Repository error
- Invalid branch name → Repository error
- Rate limiting → Network error (handle gracefully)

## Reference

- **Unified Interface**: `operations/commit-search.md`
- **MCP Tool Mapping**: `operations/mcp-tool-mapping-gitlab.md`
- **Output Format**: `formats/commit-metadata-format.md`

