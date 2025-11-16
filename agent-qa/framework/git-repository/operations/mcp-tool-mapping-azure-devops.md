# Azure DevOps MCP Tool Mapping

Documentation of Azure DevOps MCP tool mappings to unified framework operations.

## Purpose

This document maps Azure DevOps-specific MCP tools to unified framework operations, showing how platform-specific tools are used behind the unified interface.

## Tool Mappings

### Commit Search

**Unified Operation**: `operations/commit-search.md`

**Azure DevOps MCP Tool**: `mcp_Azure_DevOps_repo_search_commits`

**Mapping**:
- Unified parameter `repository_project_id` → Azure DevOps `project` and `repository` parameters
- Unified parameter `branch_name` → Azure DevOps `version` (optional, branch name)
- Unified parameter `commit_message` → Azure DevOps `searchText` (optional)
- Unified parameter `date_range` → Azure DevOps `fromDate`/`toDate` (optional)
- Unified parameter `pagination` → Azure DevOps `skip`/`top` (optional)

**Additional Parameters**:
- Azure DevOps requires `cloudId` (from `config/get-cloud-id.md`)
- Azure DevOps may require separate `project` and `repository` parameters

**Response Transformation**:
- Azure DevOps commit response → Standardized commit metadata format (see `formats/commit-metadata-format.md`)

### PR/MR Retrieval - Get by ID

**Unified Operation**: `operations/pr-mr-retrieval.md` (get by ID)

**Azure DevOps MCP Tool**: `mcp_Azure_DevOps_repo_get_pull_request_by_id`

**Mapping**:
- Unified parameter `repository_project_id` → Azure DevOps `project` and `repository` parameters
- Unified parameter `pr_mr_id` → Azure DevOps `pullRequestId`

**Additional Parameters**:
- Azure DevOps requires `cloudId` (from `config/get-cloud-id.md`)

**Response Transformation**:
- Azure DevOps PR response → Standardized PR/MR metadata format (see `formats/pr-mr-metadata-format.md`)

### PR/MR Retrieval - Search

**Unified Operation**: `operations/pr-mr-retrieval.md` (search)

**Azure DevOps MCP Tool**: Azure DevOps PR listing/search tools

**Mapping**:
- Unified parameter `repository_project_id` → Azure DevOps `project` and `repository` parameters
- Unified parameter `search_query` → Azure DevOps filtering (title, description)

**Additional Parameters**:
- Azure DevOps requires `cloudId` (from `config/get-cloud-id.md`)

**Response Transformation**:
- Azure DevOps PR list response → Standardized PR/MR metadata array

### Diff Extraction - Branch Diffs

**Unified Operation**: `operations/diff-extraction.md` (branch diffs)

**Azure DevOps MCP Tool**: `mcp_Azure_DevOps_repo_get_branch_diffs`

**Mapping**:
- Unified parameter `repository_project_id` → Azure DevOps `project` and `repository` parameters
- Unified parameter `branch_name` → Azure DevOps `to` branch
- Unified parameter `from_branch` → Azure DevOps `from` branch (optional)
- Unified parameter `to_branch` → Azure DevOps `to` branch (optional)

**Additional Parameters**:
- Azure DevOps requires `cloudId` (from `config/get-cloud-id.md`)

**Response Transformation**:
- Azure DevOps diff response → Standardized code changes format (see `formats/code-changes-format.md`)

### Diff Extraction - PR Diffs

**Unified Operation**: `operations/diff-extraction.md` (PR/MR diffs)

**Azure DevOps MCP Tool**: Azure DevOps PR diff tools

**Mapping**:
- Unified parameter `repository_project_id` → Azure DevOps `project` and `repository` parameters
- Unified parameter `pr_mr_id` → Azure DevOps `pullRequestId`

**Additional Parameters**:
- Azure DevOps requires `cloudId` (from `config/get-cloud-id.md`)

**Response Transformation**:
- Azure DevOps PR diff response → Standardized code changes format

### Branch Listing

**Unified Operation**: `operations/branch-listing.md`

**Azure DevOps MCP Tool**: Azure DevOps branch listing tools

**Mapping**:
- Unified parameter `repository_project_id` → Azure DevOps `project` and `repository` parameters
- Unified parameter `filter_contains` → Azure DevOps branch name filtering
- Unified parameter `top` → Azure DevOps `top` (optional)

**Additional Parameters**:
- Azure DevOps requires `cloudId` (from `config/get-cloud-id.md`)

**Response Transformation**:
- Azure DevOps branch list response → Standardized branch information array (see `formats/branch-information-format.md`)

## Azure DevOps-Specific Parameters

### Cloud ID Requirement

- Azure DevOps requires `cloudId` for all operations
- Cloud ID is retrieved using `config/get-cloud-id.md`
- Cloud ID must be provided to all Azure DevOps MCP tool calls

### Project and Repository Separation

- Azure DevOps separates `project` and `repository` parameters
- Framework may need to parse `repository_project_id` to extract both values
- Or framework may require separate `project` and `repository` parameters

### Pull Request Terminology

- Azure DevOps uses "Pull Request" (PR) terminology
- Framework abstracts this as "PR/MR" for consistency

## Error Handling

Azure DevOps-specific errors are handled according to:
- `errors/common-error-handling.md` - Common error patterns
- `errors/mcp-server-errors.md` - MCP server error handling
- `errors/repository-errors.md` - Repository error handling
- `errors/unauthorized-errors.md` - Authorization error handling (Azure DevOps uses OAuth)

## Usage Notes

- All Azure DevOps operations require `cloudId` parameter
- Azure DevOps may require separate `project` and `repository` parameters
- Azure DevOps uses `pullRequestId` (numeric) for PR operations
- Azure DevOps pagination uses `skip` and `top` parameters
- Azure DevOps authentication uses OAuth tokens

## Implementation Notes

When implementing Azure DevOps-specific operations:
1. Always include `cloudId` from configuration
2. Parse or separate `project` and `repository` from `repository_project_id`
3. Transform Azure DevOps responses to standardized format
4. Handle Azure DevOps-specific error cases (OAuth errors, etc.)

