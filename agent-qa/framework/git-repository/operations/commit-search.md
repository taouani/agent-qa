# Commit Search - Unified Interface

Unified interface for searching commits across GitLab, GitHub, and Azure DevOps platforms.

## Purpose

This instruction file provides a unified interface for commit search operations. Commands should use this file instead of calling platform-specific MCP tools directly. The framework automatically routes to the appropriate platform-specific implementation.

## Core Responsibilities

1. **Get Platform Configuration**: Retrieve platform value from configuration
2. **Route to Platform Implementation**: Route to platform-specific implementation based on platform
3. **Return Standardized Output**: Return commits in standardized format regardless of platform

## Workflow

### Step 1: Get Platform Configuration

Retrieve the platform value from memory (set by `config/read-platform-config.md`):

- Platform should be one of: `github`, `gitlab`, `azure-devops`
- If platform not set, return error and request platform configuration

### Step 2: Route to Platform Implementation

Based on the platform, route to the appropriate implementation:

- **If platform is `gitlab`**: Follow instructions in `operations/commit-search-gitlab.md`
- **If platform is `github`**: Follow instructions in `operations/commit-search-github.md`
- **If platform is `azure-devops`**: Follow instructions in `operations/commit-search-azure-devops.md`

### Step 3: Return Standardized Output

All platform implementations return commits in standardized format (see `formats/commit-metadata-format.md`).

## Unified Parameters

**Required Parameters:**
- `repository_project_id` - Repository identifier (format varies by platform)

**Optional Parameters:**
- `branch_name` - Branch name to search commits in
- `commit_message` - Search text to match in commit messages
- `date_range` - Date range filter (format: `YYYY-MM-DD:YYYY-MM-DD` or similar)
- `pagination` - Pagination parameters (page number, items per page)

## Output Format

Returns an array of standardized commit metadata objects (see `formats/commit-metadata-format.md`):

```json
[
  {
    "hash": "abc123...",
    "author": "John Doe",
    "date": "2025-01-15T10:30:00Z",
    "message": "PROJ-123: Fix bug",
    "branch_name": "main",
    "repository_project_id": "..."
  },
  ...
]
```

## Usage Example

```markdown
## Step 1: Search Commits

Follow the instructions in: `agent-qa/framework/git-repository/operations/commit-search.md`

Parameters:
- repository_project_id: [from config or input]
- branch_name: "main" (optional)
- commit_message: "PROJ-123" (optional)
- date_range: "2025-01-01:2025-01-31" (optional)

The framework automatically routes to the correct platform implementation.
```

## Error Handling

Errors are handled according to:
- `errors/common-error-handling.md` - Common error patterns
- Platform-specific error handling in implementation files

## Important Notes

- Commands should **never** call platform-specific MCP tools directly
- Always use this unified interface file
- Framework handles all platform-specific differences transparently
- Platform detection is automatic based on configuration

