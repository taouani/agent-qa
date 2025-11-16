# GitHub MCP Tool Mapping

Documentation of GitHub MCP tool mappings to unified framework operations.

## Purpose

This document maps GitHub-specific MCP tools to unified framework operations, showing how platform-specific tools are used behind the unified interface.

**Note**: Exact GitHub MCP tool names may vary depending on the GitHub MCP server implementation. This document provides the expected mapping pattern.

## Tool Mappings

### Commit Search

**Unified Operation**: `operations/commit-search.md`

**GitHub MCP Tool**: GitHub commit search tools (exact name depends on MCP server)

**Mapping**:
- Unified parameter `repository_project_id` → GitHub `owner/repo` format
- Unified parameter `branch_name` → GitHub `branch` (optional)
- Unified parameter `commit_message` → GitHub search query (optional)
- Unified parameter `date_range` → GitHub date filtering (optional)
- Unified parameter `pagination` → GitHub pagination (optional)

**Response Transformation**:
- GitHub commit response → Standardized commit metadata format (see `formats/commit-metadata-format.md`)

### PR/MR Retrieval - Get by ID

**Unified Operation**: `operations/pr-mr-retrieval.md` (get by ID)

**GitHub MCP Tool**: GitHub PR retrieval tools (exact name depends on MCP server)

**Mapping**:
- Unified parameter `repository_project_id` → GitHub `owner/repo` format
- Unified parameter `pr_mr_id` → GitHub PR number

**Response Transformation**:
- GitHub PR response → Standardized PR/MR metadata format (see `formats/pr-mr-metadata-format.md`)

### PR/MR Retrieval - Search

**Unified Operation**: `operations/pr-mr-retrieval.md` (search)

**GitHub MCP Tool**: GitHub PR listing/search tools (exact name depends on MCP server)

**Mapping**:
- Unified parameter `repository_project_id` → GitHub `owner/repo` format
- Unified parameter `search_query` → GitHub search query (title, body, labels)

**Response Transformation**:
- GitHub PR list response → Standardized PR/MR metadata array

### Diff Extraction - Branch Diffs

**Unified Operation**: `operations/diff-extraction.md` (branch diffs)

**GitHub MCP Tool**: GitHub diff/compare tools (exact name depends on MCP server)

**Mapping**:
- Unified parameter `repository_project_id` → GitHub `owner/repo` format
- Unified parameter `branch_name` → GitHub `branch`
- Unified parameter `from_branch` → GitHub `base` (optional)
- Unified parameter `to_branch` → GitHub `head` (optional)

**Response Transformation**:
- GitHub diff response → Standardized code changes format (see `formats/code-changes-format.md`)

### Diff Extraction - PR Diffs

**Unified Operation**: `operations/diff-extraction.md` (PR/MR diffs)

**GitHub MCP Tool**: GitHub PR diff tools (exact name depends on MCP server)

**Mapping**:
- Unified parameter `repository_project_id` → GitHub `owner/repo` format
- Unified parameter `pr_mr_id` → GitHub PR number

**Response Transformation**:
- GitHub PR diff response → Standardized code changes format

### Branch Listing

**Unified Operation**: `operations/branch-listing.md`

**GitHub MCP Tool**: GitHub branch listing tools (exact name depends on MCP server)

**Mapping**:
- Unified parameter `repository_project_id` → GitHub `owner/repo` format
- Unified parameter `filter_contains` → GitHub branch name filtering
- Unified parameter `top` → GitHub pagination (optional)

**Response Transformation**:
- GitHub branch list response → Standardized branch information array (see `formats/branch-information-format.md`)

## GitHub-Specific Parameters

### Repository ID Format

- GitHub uses `owner/repo` format (e.g., `octocat/Hello-World`)
- Framework transforms `repository_project_id` to this format for GitHub operations

### Pull Request Terminology

- GitHub uses "Pull Request" (PR) terminology
- Framework abstracts this as "PR/MR" for consistency

## Error Handling

GitHub-specific errors are handled according to:
- `errors/common-error-handling.md` - Common error patterns
- `errors/mcp-server-errors.md` - MCP server error handling
- `errors/repository-errors.md` - Repository error handling
- `errors/network-errors.md` - Network/rate limiting error handling

## Usage Notes

- All GitHub operations require `owner/repo` format for repository identifier
- GitHub uses PR numbers (not internal IDs) for PR operations
- GitHub supports advanced search queries for filtering
- GitHub has rate limiting - framework handles this gracefully
- Exact tool names depend on GitHub MCP server implementation

## Implementation Notes

When implementing GitHub-specific operations:
1. Check available GitHub MCP tools in the environment
2. Map unified parameters to GitHub-specific parameters
3. Transform GitHub responses to standardized format
4. Handle GitHub-specific error cases (rate limiting, etc.)

