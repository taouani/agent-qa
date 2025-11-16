# Git Repository Integration Framework - Operation Index

Complete reference of all available framework operations, organized by category.

## Configuration Management

### Platform Configuration
- **`config/read-platform-config.md`** - Read repository platform from YAML config
  - Supported platforms: `github`, `gitlab`, `azure-devops`
  - Reads from: `agent-os/config.yml` or `agent-qa/config.yml`
  - Returns: Platform identifier

### MCP Server Validation
- **`config/validate-mcp-server.md`** - Validate MCP server availability
  - Checks platform-specific MCP server tools
  - Provides consistent error messages
  - Returns: Validation status

### Project ID Management
- **`config/manage-project-id.md`** - Manage repository project ID
  - Handles project ID from config or input parameters
  - Validates project ID format per platform
  - Returns: Project ID

### Cloud ID (Azure DevOps)
- **`config/get-cloud-id.md`** - Retrieve Azure DevOps cloud ID
  - Handles cloud ID from config or input
  - Validates cloud ID format
  - Returns: Cloud ID

## Common Operations

### Commit Search
- **`operations/commit-search.md`** - Unified commit search interface
  - Parameters: `repository_project_id`, `branch_name` (optional), `commit_message` (optional), `date_range` (optional), `pagination` (optional)
  - Platform implementations:
    - `operations/commit-search-gitlab.md` - GitLab implementation
    - `operations/commit-search-github.md` - GitHub implementation
    - `operations/commit-search-azure-devops.md` - Azure DevOps implementation
  - Returns: Standardized commit metadata array

### PR/MR Retrieval
- **`operations/pr-mr-retrieval.md`** - Unified PR/MR retrieval interface
  - Operations: Get by ID, Search by title/description/labels
  - Parameters: `repository_project_id`, `pr_mr_id` (for get by ID), `search_query` (for search)
  - Platform implementations:
    - `operations/pr-mr-retrieval-gitlab.md` - GitLab implementation
    - `operations/pr-mr-retrieval-github.md` - GitHub implementation
    - `operations/pr-mr-retrieval-azure-devops.md` - Azure DevOps implementation
  - Returns: Standardized PR/MR metadata

### Diff Extraction
- **`operations/diff-extraction.md`** - Unified diff extraction interface
  - Operations: Get branch diffs, Get PR/MR diffs
  - Parameters: `repository_project_id`, `branch_name` (for branch diffs), `pr_mr_id` (for PR/MR diffs), `from_branch` (optional), `to_branch` (optional)
  - Platform implementations:
    - `operations/diff-extraction-gitlab.md` - GitLab implementation
    - `operations/diff-extraction-github.md` - GitHub implementation
    - `operations/diff-extraction-azure-devops.md` - Azure DevOps implementation
  - Returns: Standardized code changes structure

### Branch Listing
- **`operations/branch-listing.md`** - Unified branch listing interface
  - Parameters: `repository_project_id`, `filter_contains` (optional), `top` (optional)
  - Platform implementations:
    - `operations/branch-listing-gitlab.md` - GitLab implementation
    - `operations/branch-listing-github.md` - GitHub implementation
    - `operations/branch-listing-azure-devops.md` - Azure DevOps implementation
  - Returns: Standardized branch information array

## Platform Abstraction

### Platform Abstraction Layer
- **`operations/platform-abstraction.md`** - Unified interface patterns
  - Documents common operation signatures
  - Explains how platform-specific implementations are hidden
  - Provides usage examples

### MCP Tool Mappings
- **`operations/mcp-tool-mapping-gitlab.md`** - GitLab MCP tool mappings
- **`operations/mcp-tool-mapping-github.md`** - GitHub MCP tool mappings
- **`operations/mcp-tool-mapping-azure-devops.md`** - Azure DevOps MCP tool mappings

## Correlation Methods

### Branch Name Matching
- **`correlation/branch-name-matching.md`** - Match Jira keys in branch names
  - Patterns: `PROJ-123-feature`, `PROJ-123_rc`, `PROJ-123/branch-name`
  - Returns: Extracted Jira keys

### Commit Message Parsing
- **`correlation/commit-message-parsing.md`** - Extract Jira keys from commit messages
  - Patterns: `PROJ-123: Fix bug`, `[PROJ-123] Description`, multiple keys
  - Returns: Extracted Jira keys

### PR/MR Matching
- **`correlation/pr-mr-matching.md`** - Match Jira keys in PR/MR metadata
  - Searches: Title, description, labels, custom fields
  - Returns: Extracted Jira keys

### Unified Correlation
- **`correlation/unified-correlation.md`** - Combine all correlation methods
  - Uses all methods simultaneously
  - Returns: Correlation mapping (Jira key → commits/PRs)

## Error Handling

### Common Error Handling
- **`errors/common-error-handling.md`** - Common error handling patterns
  - Error types: MCP server failures, missing repositories, invalid project IDs, network/timeout errors, unauthorized access
  - Consistent error message formats
  - Graceful degradation patterns

### Specific Error Types
- **`errors/mcp-server-errors.md`** - MCP server failure handling
- **`errors/repository-errors.md`** - Repository error handling
- **`errors/network-errors.md`** - Network/timeout error handling
- **`errors/unauthorized-errors.md`** - Authorization error handling

## Output Format Standardization

### Data Format Specifications
- **`formats/commit-metadata-format.md`** - Standardized commit metadata structure
- **`formats/pr-mr-metadata-format.md`** - Standardized PR/MR metadata structure
- **`formats/code-changes-format.md`** - Standardized code changes structure
- **`formats/branch-information-format.md`** - Standardized branch information structure
- **`formats/unified-output-format.md`** - Unified output format combining all data types

## Platform Support Matrix

| Operation | GitLab | GitHub | Azure DevOps |
|-----------|--------|--------|--------------|
| Commit Search | ✅ | ✅ | ✅ |
| PR/MR Retrieval | ✅ | ✅ | ✅ |
| Diff Extraction | ✅ | ✅ | ✅ |
| Branch Listing | ✅ | ✅ | ✅ |
| Correlation Methods | ✅ | ✅ | ✅ |

## Operation Dependencies

```
Configuration Management
    ↓
Platform Abstraction
    ↓
Common Operations (Commit Search, PR/MR Retrieval, Diff Extraction, Branch Listing)
    ↓
Correlation Methods
    ↓
Output Format Standardization
```

## Quick Reference

**For Command Developers:**
1. Start with `config/read-platform-config.md` to get platform
2. Use `config/validate-mcp-server.md` to validate MCP server
3. Use `operations/[operation-name].md` for unified operations
4. Use `errors/common-error-handling.md` for error handling
5. Use `formats/[format-name].md` for output formatting

**For Platform-Specific Details:**
- See `operations/[operation-name]-[platform].md` files
- See `operations/mcp-tool-mapping-[platform].md` files

