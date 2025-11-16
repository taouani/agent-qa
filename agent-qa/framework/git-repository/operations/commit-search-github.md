# Commit Search - GitHub Implementation

GitHub-specific implementation of commit search operation.

## Purpose

This instruction file implements commit search for GitHub platform. It is called automatically by the unified `operations/commit-search.md` interface when platform is `github`.

## Core Responsibilities

1. **Map Unified Parameters**: Transform unified parameters to GitHub-specific parameters
2. **Call GitHub MCP Tool**: Use GitHub commit search tools
3. **Handle Pagination**: Manage GitHub pagination
4. **Transform Response**: Transform GitHub response to standardized format

## Workflow

### Step 1: Map Unified Parameters to GitHub Parameters

Transform unified parameters to GitHub-specific format:

- `repository_project_id` → Parse to `owner/repo` format (e.g., `octocat/Hello-World`)
- `branch_name` → `branch` (optional, if provided)
- `commit_message` → Search query (optional, if provided)
- `date_range` → Date filtering (optional, parse date range string)
- `pagination` → GitHub pagination parameters (optional)

### Step 2: Call GitHub MCP Tool

Call GitHub MCP commit search tools with mapped parameters:

**Note**: Exact tool names depend on GitHub MCP server implementation. Check available tools and use appropriate one.

```markdown
Call: [GitHub MCP commit search tool]
Parameters:
- owner: [parsed from repository_project_id]
- repo: [parsed from repository_project_id]
- branch: [mapped from branch_name, if provided]
- [search parameters based on commit_message, if provided]
- [pagination parameters, if provided]
```

### Step 3: Handle Pagination

If pagination is needed:

1. **Check Response**: Check if more pages are available (GitHub uses link headers or pagination tokens)
2. **Request Next Page**: If more pages, call tool again with pagination parameters
3. **Combine Results**: Combine results from all pages
4. **Return Combined Results**: Return all commits in single array

### Step 4: Transform GitHub Response to Standardized Format

Transform each GitHub commit to standardized format (see `formats/commit-metadata-format.md`):

**GitHub Commit Fields → Standardized Fields:**
- `sha` → `hash`
- `commit.author.name` → `author`
- `commit.author.date` → `date` (format to ISO 8601)
- `commit.message` → `message`
- `branch_name` (from context) → `branch_name`
- `owner/repo` → `repository_project_id`

### Step 5: Return Standardized Output

Return array of standardized commit metadata objects.

## Error Handling

Handle GitHub-specific errors according to:
- `errors/common-error-handling.md` - Common error patterns
- `errors/mcp-server-errors.md` - MCP server error handling
- `errors/repository-errors.md` - Repository error handling
- `errors/network-errors.md` - Rate limiting error handling

**GitHub-Specific Errors:**
- Repository not found → Repository error
- Invalid branch name → Repository error
- Rate limiting (403) → Network error (handle gracefully, may need to wait)

## Reference

- **Unified Interface**: `operations/commit-search.md`
- **MCP Tool Mapping**: `operations/mcp-tool-mapping-github.md`
- **Output Format**: `formats/commit-metadata-format.md`

## Important Notes

- Exact GitHub MCP tool names depend on MCP server implementation
- GitHub uses `owner/repo` format for repository identifiers
- GitHub has strict rate limiting - handle gracefully
- GitHub pagination may use link headers or tokens

