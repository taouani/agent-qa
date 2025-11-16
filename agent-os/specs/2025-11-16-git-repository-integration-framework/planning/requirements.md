# Spec Requirements: Git Repository Integration Framework

## Initial Description

**Roadmap Item #12**: Git Repository Integration Framework — Build framework for integrating with git repositories (GitLab, GitHub, Azure DevOps) through MCP servers, supporting commit analysis, pull request/merge request retrieval, and code change tracking.

## Requirements Discussion

### First Round Questions

**Q1:** Framework Structure - Should this be reusable instruction files (markdown) that other commands can reference, or a separate command that provides shared utilities? I'm assuming reusable instruction files/patterns that commands like `analyze-commits` and future commands can use, similar to how Atlassian integration patterns are reused.

**Answer:** Your assumption is right (reusable instruction files/patterns).

**Q2:** Abstraction Layer - Should the framework provide a unified interface that abstracts platform differences (GitLab, GitHub, Azure DevOps), so commands call framework functions rather than platform-specific MCP tools directly? I'm assuming yes, with platform-specific implementations hidden behind a common interface.

**Answer:** Yes.

**Q3:** Configuration Management - Should the framework centralize repository platform configuration reading, MCP server validation, and repository project ID management? I'm assuming yes, so commands don't duplicate this logic.

**Answer:** Yes.

**Q4:** Common Operations - Which operations should the framework standardize? I'm assuming: commit search, PR/MR retrieval, diff extraction, branch listing, and code change analysis. Should it also include correlation methods (branch name matching, commit message parsing, etc.)?

**Answer:** Exactly. Yes please. I assume that you have already access to mcp servers and their tools activated in this project so you already have a clear idea about all the tools.

**Q5:** Error Handling - Should the framework provide common error handling patterns for MCP server failures, missing repositories, invalid project IDs, etc.? I'm assuming yes, with consistent error messages and graceful degradation.

**Answer:** Yes.

**Q6:** Integration with Existing Commands - Should `analyze-commits` be refactored to use this framework, or should the framework be built alongside it for future commands? I'm assuming the framework should be built first, then `analyze-commits` can optionally be refactored to use it.

**Answer:** (Not explicitly answered, but can be inferred from context)

**Q7:** Output Format Standardization - Should the framework standardize how commit/PR data is structured and formatted across platforms? I'm assuming yes, so all commands receive data in the same format regardless of platform.

**Answer:** Yes.

**Q8:** Scope Boundaries - Should this framework only handle git repository operations, or also include installation-time repository platform selection (which seems to overlap with roadmap item #16)? I'm assuming focus on runtime operations only, leaving installation/configuration to item #16.

**Answer:** Yes please (runtime operations only, installation/configuration separate).

### Existing Code to Reference

**Similar Features Identified:**
No similar existing features identified for reference.

### Follow-up Questions

No follow-up questions needed.

## Visual Assets

### Files Provided:
No visual assets provided.

### Visual Insights:
No visual assets provided.

## Requirements Summary

### Functional Requirements

#### Framework Structure
- Create reusable instruction files (markdown) that other commands can reference
- Follow agent-os patterns similar to how Atlassian integration patterns are reused
- Provide shared utilities and common patterns for git repository operations
- Framework should be separate from commands but usable by them

#### Platform Abstraction Layer
- Provide unified interface that abstracts platform differences (GitLab, GitHub, Azure DevOps)
- Hide platform-specific MCP tool implementations behind common interface
- Commands should call framework functions rather than platform-specific MCP tools directly
- Support all three platforms: GitLab, GitHub, Azure DevOps

#### Configuration Management
- Centralize repository platform configuration reading from YAML config files
- Centralize MCP server validation and availability checking
- Centralize repository project ID management
- Provide consistent configuration access patterns for all commands
- Handle missing configuration with clear error messages

#### Common Operations Standardization
- **Commit Search**: Standardize commit search across platforms
  - Search by branch name
  - Search by commit message
  - Search by date range
  - Handle pagination
- **PR/MR Retrieval**: Standardize pull request/merge request retrieval
  - Get PR/MR by ID
  - Search PRs/MRs by title, description, labels
  - Retrieve PR/MR details
- **Diff Extraction**: Standardize diff extraction
  - Get branch diffs
  - Get PR/MR diffs
  - Extract file paths, lines changed, diff snippets
- **Branch Listing**: Standardize branch listing and filtering
- **Code Change Analysis**: Standardize code change analysis patterns
- **Correlation Methods**: Include correlation methods
  - Branch name matching (e.g., "PROJ-123-feature", "PROJ-123_rc")
  - Commit message parsing and Jira key extraction
  - PR/MR title/description/label matching

#### Error Handling Patterns
- Provide common error handling patterns for:
  - MCP server failures
  - Missing repositories
  - Invalid project IDs
  - Network/timeout errors
  - Unauthorized access
- Consistent error messages across all operations
- Graceful degradation (continue processing despite individual failures)
- Error context logging for debugging

#### Output Format Standardization
- Standardize commit/PR data structure across platforms
- Provide unified data format for:
  - Commit metadata (hash, author, date, message)
  - PR/MR metadata (ID, title, description, status, merge date, links)
  - Code changes (file paths, lines added/removed, diff snippets)
  - Branch information
- Ensure all commands receive data in the same format regardless of platform

#### MCP Tool Mapping
Based on available MCP servers and tools:

**GitLab MCP Tools:**
- `mcp_gitlab_search_commits` - Search commits
- `mcp_gitlab_get_merge_request` - Get MR details
- `mcp_gitlab_get_branch_diffs` - Get branch diffs
- `mcp_gitlab_get_merge_request_diffs` - Get MR diffs
- `mcp_gitlab_list_branches_by_repo` - List branches
- `mcp_gitlab_list_pull_requests_by_repo_or_project` - List PRs/MRs
- Additional GitLab tools as needed

**GitHub MCP Tools:**
- Equivalent tools to GitLab (exact tool names to be determined based on GitHub MCP server)
- Commit search, PR retrieval, diff extraction, branch listing

**Azure DevOps MCP Tools:**
- `mcp_Azure_DevOps_repo_search_commits` - Search commits
- `mcp_Azure_DevOps_repo_get_pull_request_by_id` - Get PR details
- `mcp_Azure_DevOps_repo_get_branch_diffs` - Get branch diffs
- Additional Azure DevOps tools as needed

### Reusability Opportunities

- **Atlassian MCP Integration Patterns**: Reference patterns from `analyze-requirements/1-initialize-and-determine-input.md` for MCP server initialization
- **Configuration Reading Patterns**: Reference patterns from `analyze-commits/1-initialize-and-determine-input.md` for configuration reading
- **Platform-Specific Implementation Patterns**: Reference patterns from `analyze-commits` phases 3-4 for platform-specific implementations
- **Error Handling Patterns**: Reference error handling from existing commands

### Scope Boundaries

**In Scope:**
- Reusable instruction files (markdown) for git repository operations
- Platform abstraction layer (GitLab, GitHub, Azure DevOps)
- Configuration management (platform reading, MCP validation, project ID management)
- Common operations standardization (commit search, PR/MR retrieval, diff extraction, branch listing, code change analysis, correlation methods)
- Error handling patterns
- Output format standardization
- Runtime operations only

**Out of Scope:**
- Installation-time repository platform selection (roadmap item #16)
- Installation scripts and configuration prompts (roadmap item #17)
- Direct command implementation (framework provides patterns, commands use them)
- Refactoring existing `analyze-commits` command (can be done separately if desired)

### Technical Considerations

- **MCP Server Integration:**
  - Framework assumes MCP servers are already installed and configured
  - Framework validates MCP server availability before use
  - Framework abstracts platform-specific tool differences

- **Configuration:**
  - Read from YAML config files (`agent-os/config.yml` or `agent-qa/config.yml`)
  - Repository platform setting: `repository_platform` (github, gitlab, azure-devops)
  - Repository project ID may be provided per operation or stored in config

- **Framework Location:**
  - Framework instruction files should be in a shared location (e.g., `agent-qa/framework/git-repository/` or similar)
  - Commands reference framework files rather than duplicating logic

- **Integration Points:**
  - Framework can be used by `analyze-commits` command
  - Framework can be used by future commands that need git repository access
  - Framework integrates with existing folder structure patterns

- **Pattern Consistency:**
  - Follow agent-os patterns for instruction file structure
  - Use consistent naming conventions
  - Provide clear documentation for framework usage

