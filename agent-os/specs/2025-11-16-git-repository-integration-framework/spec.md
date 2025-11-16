# Specification: Git Repository Integration Framework

## Goal

Create a reusable framework of instruction files (markdown) that provides a unified interface for git repository operations across GitLab, GitHub, and Azure DevOps platforms, abstracting platform-specific MCP tool differences and standardizing configuration management, common operations, error handling, and output formats for use by commands like `analyze-commits` and future commands requiring git repository access.

## User Stories

- As a QA Analyst, I want commands to use a unified framework for git repository operations so that I can work with any repository platform (GitLab, GitHub, Azure DevOps) without platform-specific knowledge
- As a Developer, I want reusable git repository operation patterns so that I can build new commands quickly without duplicating platform abstraction logic
- As a QA Manager, I want consistent error handling and data formats across all git operations so that I can rely on predictable behavior regardless of repository platform

## Specific Requirements

**Framework Structure and Location**
- Create reusable instruction files (markdown) in shared framework location (e.g., `agent-qa/framework/git-repository/`)
- Framework files should be separate from commands but referenced by them
- Follow agent-os patterns similar to how Atlassian integration patterns are reused
- Provide clear documentation for framework usage and integration

**Platform Abstraction Layer**
- Provide unified interface that abstracts platform differences (GitLab, GitHub, Azure DevOps)
- Hide platform-specific MCP tool implementations behind common interface patterns
- Commands call framework instruction files rather than platform-specific MCP tools directly
- Support all three platforms with equivalent functionality
- Map platform-specific MCP tools to unified operation patterns

**Configuration Management**
- Centralize repository platform configuration reading from YAML config files (`agent-os/config.yml` or `agent-qa/config.yml`)
- Centralize MCP server validation and availability checking
- Centralize repository project ID management (from config or input parameters)
- Provide consistent configuration access patterns for all commands
- Handle missing configuration with clear, actionable error messages

**Commit Search Standardization**
- Standardize commit search across platforms (by branch name, commit message, date range)
- Handle pagination consistently across platforms
- Provide unified interface for commit filtering and retrieval
- Return standardized commit data structure regardless of platform

**PR/MR Retrieval Standardization**
- Standardize pull request/merge request retrieval (get by ID, search by title/description/labels)
- Provide unified interface for PR/MR operations
- Handle platform-specific differences transparently
- Return standardized PR/MR data structure regardless of platform

**Diff Extraction Standardization**
- Standardize diff extraction (branch diffs, PR/MR diffs)
- Extract file paths, lines added/removed, diff snippets consistently
- Format diffs uniformly across platforms
- Provide unified interface for diff operations

**Correlation Methods**
- Include branch name matching patterns (e.g., "PROJ-123-feature", "PROJ-123_rc")
- Include commit message parsing and Jira key extraction
- Include PR/MR title/description/label matching patterns
- Provide reusable correlation logic for commands

**Error Handling Patterns**
- Provide common error handling patterns for MCP server failures, missing repositories, invalid project IDs, network/timeout errors, unauthorized access
- Consistent error messages across all operations
- Graceful degradation (continue processing despite individual failures)
- Error context logging for debugging purposes

**Output Format Standardization**
- Standardize commit/PR data structure across platforms
- Provide unified data format for commit metadata (hash, author, date, message), PR/MR metadata (ID, title, description, status, merge date, links), code changes (file paths, lines added/removed, diff snippets), branch information
- Ensure all commands receive data in the same format regardless of platform

**MCP Tool Mapping Documentation**
- Document GitLab MCP tool mappings (`mcp_gitlab_search_commits`, `mcp_gitlab_get_merge_request`, `mcp_gitlab_get_branch_diffs`, `mcp_gitlab_get_merge_request_diffs`, `mcp_gitlab_list_branches_by_repo`, `mcp_gitlab_list_pull_requests_by_repo_or_project`)
- Document GitHub MCP tool mappings (equivalent tools to GitLab)
- Document Azure DevOps MCP tool mappings (`mcp_Azure_DevOps_repo_search_commits`, `mcp_Azure_DevOps_repo_get_pull_request_by_id`, `mcp_Azure_DevOps_repo_get_branch_diffs`)
- Provide clear mapping between unified operations and platform-specific tools

## Visual Design

No visual assets provided.

## Existing Code to Leverage

**Atlassian MCP Integration Patterns**
- Reuse MCP server initialization patterns from `analyze-requirements/1-initialize-and-determine-input.md` for connection validation
- Reference error handling patterns from Atlassian integration for MCP server unavailability scenarios

**Configuration Reading Patterns**
- Reuse configuration reading patterns from `analyze-commits/1-initialize-and-determine-input.md` for YAML config file access
- Reference platform detection logic for validating supported platforms

**Platform-Specific Implementation Patterns**
- Reference platform abstraction concepts from `analyze-commits` phases 3-4 for handling platform differences
- Reuse platform-specific tool mapping patterns documented in existing commands

**Error Handling Patterns**
- Reference error handling from existing commands for consistent error message formatting
- Reuse graceful degradation patterns for continuing processing despite failures

**Command Structure Patterns**
- Follow agent-os instruction file patterns for framework file structure
- Reference multi-phase command patterns for organizing framework operations

## Out of Scope

- Installation-time repository platform selection (roadmap item #16)
- Installation scripts and configuration prompts (roadmap item #17)
- Direct command implementation (framework provides patterns, commands use them)
- Refactoring existing `analyze-commits` command to use framework (can be done separately)
- Database or persistent storage for framework data
- Web UI or frontend components
- Real-time commit monitoring or webhooks
- Git repository cloning or local repository access (MCP servers only)

