# Platform Abstraction

Unified interface patterns for platform abstraction across GitLab, GitHub, and Azure DevOps.

## Purpose

This document explains how the framework provides a unified interface that abstracts platform differences, allowing commands to use git repository operations without platform-specific knowledge.

## Core Concept

Commands call framework instruction files (like `operations/commit-search.md`) rather than platform-specific MCP tools directly. The framework automatically routes to the appropriate platform-specific implementation based on the configured platform.

## Unified Interface Pattern

### How It Works

1. **Command Calls Framework Operation**:
   ```markdown
   ## Step 1: Search Commits
   
   Follow the instructions in: `agent-qa/framework/git-repository/operations/commit-search.md`
   ```

2. **Framework Operation Routes to Platform Implementation**:
   - Framework operation file checks platform value (from config)
   - Routes to platform-specific implementation:
     - `operations/commit-search-gitlab.md` (if platform is gitlab)
     - `operations/commit-search-github.md` (if platform is github)
     - `operations/commit-search-azure-devops.md` (if platform is azure-devops)

3. **Platform Implementation Calls MCP Tools**:
   - Platform-specific file calls the appropriate MCP tools
   - Transforms platform-specific responses to standardized format

4. **Standardized Output Returned**:
   - All platforms return data in the same format
   - Commands receive consistent data structure regardless of platform

## Common Operation Signatures

### Commit Search

**Unified Interface:**
- **Input Parameters**: `repository_project_id`, `branch_name` (optional), `commit_message` (optional), `date_range` (optional), `pagination` (optional)
- **Output Format**: Standardized commit metadata array (see `formats/commit-metadata-format.md`)

**Platform Implementations:**
- GitLab: Uses `mcp_gitlab_search_commits`
- GitHub: Uses GitHub MCP commit search tools
- Azure DevOps: Uses `mcp_Azure_DevOps_repo_search_commits`

### PR/MR Retrieval

**Unified Interface:**
- **Input Parameters**: `repository_project_id`, `pr_mr_id` (for get by ID), `search_query` (for search)
- **Output Format**: Standardized PR/MR metadata (see `formats/pr-mr-metadata-format.md`)

**Platform Implementations:**
- GitLab: Uses `mcp_gitlab_get_merge_request`, `mcp_gitlab_list_pull_requests_by_repo_or_project`
- GitHub: Uses GitHub MCP PR retrieval tools
- Azure DevOps: Uses `mcp_Azure_DevOps_repo_get_pull_request_by_id`

### Diff Extraction

**Unified Interface:**
- **Input Parameters**: `repository_project_id`, `branch_name` (for branch diffs), `pr_mr_id` (for PR/MR diffs), `from_branch` (optional), `to_branch` (optional)
- **Output Format**: Standardized code changes structure (see `formats/code-changes-format.md`)

**Platform Implementations:**
- GitLab: Uses `mcp_gitlab_get_branch_diffs`, `mcp_gitlab_get_merge_request_diffs`
- GitHub: Uses GitHub MCP diff extraction tools
- Azure DevOps: Uses `mcp_Azure_DevOps_repo_get_branch_diffs`

### Branch Listing

**Unified Interface:**
- **Input Parameters**: `repository_project_id`, `filter_contains` (optional), `top` (optional)
- **Output Format**: Standardized branch information array (see `formats/branch-information-format.md`)

**Platform Implementations:**
- GitLab: Uses `mcp_gitlab_list_branches_by_repo`
- GitHub: Uses GitHub MCP branch listing tools
- Azure DevOps: Uses Azure DevOps MCP branch listing tools

## Platform-Specific Differences Hidden

### Parameter Mapping

Platform-specific implementations handle parameter mapping:

- **GitLab**: Direct parameter mapping (project_id → project_id)
- **GitHub**: Parameter mapping (project_id → owner/repo)
- **Azure DevOps**: Parameter mapping (project_id → project, repository)

### Response Transformation

Platform-specific implementations transform responses to standardized format:

- **GitLab**: Transform GitLab response structure to unified format
- **GitHub**: Transform GitHub response structure to unified format
- **Azure DevOps**: Transform Azure DevOps response structure to unified format

## Usage Examples

### Example 1: Commit Search

```markdown
## Step 1: Read Platform Configuration

Follow the instructions in: `agent-qa/framework/git-repository/config/read-platform-config.md`

## Step 2: Search Commits

Follow the instructions in: `agent-qa/framework/git-repository/operations/commit-search.md`

Parameters:
- repository_project_id: [from config or input]
- branch_name: "main" (optional)
- commit_message: "PROJ-123" (optional)

The framework automatically routes to the correct platform implementation.
```

### Example 2: PR/MR Retrieval

```markdown
## Step 1: Get PR by ID

Follow the instructions in: `agent-qa/framework/git-repository/operations/pr-mr-retrieval.md`

Parameters:
- repository_project_id: [from config or input]
- pr_mr_id: "123"

The framework handles platform differences (MR for GitLab, PR for GitHub/Azure DevOps).
```

## Benefits

1. **Platform Independence**: Commands don't need to know which platform is configured
2. **Consistent Interface**: Same operation signature across all platforms
3. **Standardized Output**: Commands receive data in the same format
4. **Easy Maintenance**: Platform-specific logic isolated in implementation files
5. **Extensibility**: Easy to add new platforms by creating new implementation files

## Implementation Files

Platform-specific implementations are in:
- `operations/[operation-name]-gitlab.md`
- `operations/[operation-name]-github.md`
- `operations/[operation-name]-azure-devops.md`

MCP tool mappings are documented in:
- `operations/mcp-tool-mapping-gitlab.md`
- `operations/mcp-tool-mapping-github.md`
- `operations/mcp-tool-mapping-azure-devops.md`

## Important Notes

- Commands should **never** call platform-specific MCP tools directly
- Always use framework operation files for git repository operations
- Framework handles all platform-specific differences transparently
- Platform detection is automatic based on configuration

