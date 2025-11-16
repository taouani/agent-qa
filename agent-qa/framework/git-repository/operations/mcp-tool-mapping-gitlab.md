# GitLab MCP Tool Mapping

Documentation of GitLab MCP tool mappings to unified framework operations.

## Purpose

This document maps GitLab-specific MCP tools to unified framework operations, showing how platform-specific tools are used behind the unified interface.

## Tool Mappings

### Commit Search

**Unified Operation**: `operations/commit-search.md`

**GitLab MCP Tool**: `mcp_gitlab_search_commits`

**Mapping**:
- Unified parameter `repository_project_id` → GitLab `project_id`
- Unified parameter `branch_name` → GitLab `branch` (optional)
- Unified parameter `commit_message` → GitLab `searchText` (optional)
- Unified parameter `date_range` → GitLab `fromDate`/`toDate` (optional)
- Unified parameter `pagination` → GitLab `page`/`per_page` (optional)

**Response Transformation**:
- GitLab commit response → Standardized commit metadata format (see `formats/commit-metadata-format.md`)

### PR/MR Retrieval - Get by ID

**Unified Operation**: `operations/pr-mr-retrieval.md` (get by ID)

**GitLab MCP Tool**: `mcp_gitlab_get_merge_request`

**Mapping**:
- Unified parameter `repository_project_id` → GitLab `project_id`
- Unified parameter `pr_mr_id` → GitLab `merge_request_iid`

**Response Transformation**:
- GitLab MR response → Standardized PR/MR metadata format (see `formats/pr-mr-metadata-format.md`)

### PR/MR Retrieval - Search

**Unified Operation**: `operations/pr-mr-retrieval.md` (search)

**GitLab MCP Tool**: `mcp_gitlab_list_pull_requests_by_repo_or_project`

**Mapping**:
- Unified parameter `repository_project_id` → GitLab `project_id`
- Unified parameter `search_query` → GitLab filtering (title, description, labels)

**Response Transformation**:
- GitLab MR list response → Standardized PR/MR metadata array

### Diff Extraction - Branch Diffs

**Unified Operation**: `operations/diff-extraction.md` (branch diffs)

**GitLab MCP Tool**: `mcp_gitlab_get_branch_diffs`

**Mapping**:
- Unified parameter `repository_project_id` → GitLab `project_id`
- Unified parameter `branch_name` → GitLab `branch`
- Unified parameter `from_branch` → GitLab `from` (optional)
- Unified parameter `to_branch` → GitLab `to` (optional)

**Response Transformation**:
- GitLab diff response → Standardized code changes format (see `formats/code-changes-format.md`)

### Diff Extraction - MR Diffs

**Unified Operation**: `operations/diff-extraction.md` (PR/MR diffs)

**GitLab MCP Tool**: `mcp_gitlab_get_merge_request_diffs`

**Mapping**:
- Unified parameter `repository_project_id` → GitLab `project_id`
- Unified parameter `pr_mr_id` → GitLab `merge_request_iid`

**Response Transformation**:
- GitLab MR diff response → Standardized code changes format

### Branch Listing

**Unified Operation**: `operations/branch-listing.md`

**GitLab MCP Tool**: `mcp_gitlab_list_branches_by_repo`

**Mapping**:
- Unified parameter `repository_project_id` → GitLab `repositoryId`
- Unified parameter `filter_contains` → GitLab filtering by branch name
- Unified parameter `top` → GitLab `top` (optional)

**Response Transformation**:
- GitLab branch list response → Standardized branch information array (see `formats/branch-information-format.md`)

## GitLab-Specific Parameters

### Project ID Format

- GitLab accepts numeric project ID (e.g., `12345`) or path-based ID (e.g., `group/project`)
- Framework handles both formats transparently

### Merge Request vs Pull Request

- GitLab uses "Merge Request" (MR) terminology
- Framework abstracts this as "PR/MR" for consistency

## Error Handling

GitLab-specific errors are handled according to:
- `errors/common-error-handling.md` - Common error patterns
- `errors/mcp-server-errors.md` - MCP server error handling
- `errors/repository-errors.md` - Repository error handling

## Usage Notes

- All GitLab operations require `project_id` parameter
- GitLab uses `merge_request_iid` (internal ID) for MR operations
- GitLab pagination uses `page` and `per_page` parameters
- GitLab supports filtering by multiple criteria (title, description, labels)

