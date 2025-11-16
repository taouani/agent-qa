# Task Breakdown: Commit Analysis and Technical Release Note Generation

## Overview
Total Tasks: 6 task groups

## Task List

### Configuration Layer

#### Task Group 1: Repository MCP Server Configuration
**Dependencies:** None

- [x] 1.0 Implement repository platform configuration reading
  - [x] 1.1 Read repository platform from agent configuration (YAML file)
    - Locate agent configuration file (e.g., `agent-os/config.yml` or `agent-qa/config.yml`)
    - Read repository platform setting (GitHub, GitLab, or Azure DevOps)
    - Validate platform value is one of supported platforms
    - Handle missing configuration with clear error message
  - [x] 1.2 Detect available MCP server tools based on platform
    - Check for GitLab MCP tools if platform is GitLab
    - Check for GitHub MCP tools if platform is GitHub
    - Check for Azure DevOps MCP tools if platform is Azure DevOps
    - Verify MCP server is available and configured
  - [x] 1.3 Create platform abstraction layer
    - Abstract platform-specific differences in MCP tool interfaces
    - Create unified interface for commit/PR retrieval across platforms
    - Document platform-specific tool mappings
    - Handle platform detection errors gracefully

**Acceptance Criteria:**
- Repository platform read from configuration file
- Platform detection works for all three platforms (GitHub, GitLab, Azure DevOps)
- MCP server availability verified before use
- Clear error messages for missing configuration or unavailable MCP servers
- Platform abstraction layer handles differences between MCP servers

### Commit Analysis Command

#### Task Group 2: Create `analyze-commits` Command Structure
**Dependencies:** Task Group 1

- [x] 2.0 Create `analyze-commits` command structure
  - [x] 2.1 Create main command file (`agent-qa/commands/analyze-commits/analyze-commits.md`)
    - Define command purpose and workflow overview
    - Document input parameters (Jira filter, fixVersion, ticket key(s), repository project ID, optional date range)
    - Document output location (`agent-qa/YYYY-MM-DD-{folder-name}/commits/`)
    - List all phases in sequence
    - Follow agent-os multi-phase command pattern
  - [x] 2.2 Create Phase 1: Initialize and Determine Input (`1-initialize-and-determine-input.md`)
    - Validate repository MCP server connection
    - Determine input type (Jira filter, fixVersion, single ticket key, multiple ticket keys)
    - Create output folder structure (`agent-qa/YYYY-MM-DD-{folder-name}/commits/`)
    - Read repository project ID from input or configuration
    - Handle optional date range parameter
    - Reuse patterns from `analyze-requirements/1-initialize-and-determine-input.md`
  - [x] 2.3 Create Phase 2: Retrieve Jira Tickets (`2-retrieve-jira-tickets.md`)
    - Process input to retrieve Jira tickets
    - Support JQL query input
    - Support fixVersion input
    - Support single ticket key input
    - Support multiple ticket keys input
    - Use Atlassian MCP tools to retrieve tickets
    - Handle pagination for large result sets
    - Store ticket data in memory for correlation
  - [x] 2.4 Create Phase 3: Correlate Tickets with Commits/PRs (`3-correlate-tickets-with-commits.md`)
    - Extract Jira keys from retrieved tickets
    - Use branch name matching (e.g., "PROJ-123-feature", "PROJ-123_rc")
    - Search commits by commit message containing Jira keys
    - Search PRs/MRs by title containing Jira keys
    - Search PRs/MRs by description containing Jira keys
    - Search PRs/MRs by labels containing Jira keys
    - Search PRs/MRs by custom fields containing Jira keys
    - Combine all correlation methods for comprehensive matching
    - Create correlation mapping (Jira ticket → commits/PRs)
    - Handle tickets with no correlated commits/PRs (document as "no code changes found")
  - [x] 2.5 Create Phase 4: Extract Code Changes (`4-extract-code-changes.md`)
    - Retrieve commits for each correlated ticket
    - Retrieve PRs/MRs for each correlated ticket
    - Extract file paths changed for each commit/PR
    - Extract lines added/removed per file
    - Extract code diff snippets (actual code changes)
    - Use repository MCP tools to get diffs
    - Handle pagination for large commit histories
    - Apply date range filtering if provided
    - Process all commits (no exclusions)
  - [x] 2.6 Create Phase 5: Analyze Code Changes (`5-analyze-code-changes.md`)
    - Analyze actual code changes to understand impact and context
    - Generate summary of changes per file
    - Generate overall change summary per commit/PR
    - Store analysis results for future requirement analysis enhancement
    - Format code diff snippets for markdown output
  - [x] 2.7 Create Phase 6: Generate Commit Analysis Files (`6-generate-commit-analysis-files.md`)
    - Create markdown files with code change analysis
    - Include correlation mapping (Jira ticket → commits/PRs)
    - Include code diff snippets in formatted markdown code blocks
    - Include change summaries per file and overall
    - Include commit metadata (author, date, message, hash)
    - Include PR/MR metadata (title, description, status, merge date, links)
    - Group by Jira ticket
    - Create summary index file
    - Follow agent-os markdown formatting standards

**Acceptance Criteria:**
- `analyze-commits` command structure created following agent-os patterns
- All 6 phases documented with clear responsibilities
- Input parameter handling supports all required formats
- Output folder structure matches existing pattern (`YYYY-MM-DD-{folder-name}/commits/`)
- Correlation methods implemented for all specified approaches
- Code change extraction and analysis documented
- Markdown file generation follows agent-os standards

### Release Note Generation Command

#### Task Group 3: Create `generate-release-notes` Command Structure
**Dependencies:** Task Group 2

- [x] 3.0 Create `generate-release-notes` command structure
  - [x] 3.1 Create main command file (`agent-qa/commands/generate-release-notes/generate-release-notes.md`)
    - Define command purpose and workflow overview
    - Document two input modes (select existing folder or call without requirements)
    - Document output location (`agent-qa/YYYY-MM-DD-{folder-name}/release-notes/`)
    - List all phases in sequence
    - Follow agent-os multi-phase command pattern
    - Reuse patterns from `generate-test-charter/generate-test-charter.md`
  - [x] 3.2 Create Phase 1: Find and Select Requirements (`1-find-and-select-requirements.md`)
    - Scan for existing requirements analysis folders in `agent-qa/`
    - List available options to user
    - Prompt user to select folder
    - Handle case where no requirements found (automatically call `analyze-requirements`)
    - Validate selected folder contains requirements
    - Store selected folder path for subsequent phases
    - Reuse patterns from `generate-test-charter/1-find-and-select-requirements.md`
  - [x] 3.3 Create Phase 2: Load Requirements and Check for Commits (`2-load-requirements-and-check-commits.md`)
    - Load requirements analysis data from selected folder
    - Check if commit analysis exists for selected folder (`commits/` subfolder)
    - If commit analysis not found, automatically call `analyze-commits` command
    - Load commit analysis data if available
    - Load test cases if available (`test-cases/` subfolder)
    - Load test plans if available (`test-plan/` subfolder)
    - Load test strategies if available (`test-strategy/` subfolder)
    - Load test charters if available (`test-charter/` subfolder)
    - Load risk registers if available (`risk-register/` subfolder)
    - Store all loaded data in memory for release note generation
  - [x] 3.4 Create Phase 3: Generate Release Note Content (`3-generate-release-note-content.md`)
    - Generate executive summary
    - Generate requirements summary from Jira tickets
    - Generate code changes summary from commits/PRs
    - Include test cases generated (if available)
    - Identify affected components/modules from code changes
    - Generate impact analysis based on requirements and code changes
    - Exclude deployment notes, breaking changes, migration requirements, performance impacts
    - Reference existing deliverables (test cases, test plans, strategies, charters)
  - [x] 3.5 Create Phase 4: Generate Traceability Matrix (`4-generate-traceability-matrix.md`)
    - Link code changes (commits/PRs) to requirements (Jira tickets) with explicit references
    - Link test cases to requirements with traceability matrix
    - Link code changes to test cases showing what code is covered by which tests
    - Generate full requirement traceability matrix/summary
    - Include links to all related artifacts (requirements, commits, test cases, test plans)
    - Format traceability matrix as markdown table
  - [x] 3.6 Create Phase 5: Generate Release Note Files (`5-generate-release-note-files.md`)
    - Create markdown file with release note content
    - Include executive summary section
    - Include requirements section
    - Include code changes section
    - Include test coverage section
    - Include traceability matrix section
    - Use proper markdown formatting (tables, lists, code blocks, links)
    - Include all traceability links between artifacts
    - Create summary index file
    - Follow agent-os markdown formatting standards
    - Generate one release note per requirement analysis folder

**Acceptance Criteria:**
- `generate-release-notes` command structure created following agent-os patterns
- All 5 phases documented with clear responsibilities
- Folder selection logic matches other generate commands
- Automatic `analyze-requirements` call when no requirements found
- Automatic `analyze-commits` call when commit analysis not found
- Release note content includes all required sections
- Traceability matrix links all artifacts correctly
- Markdown file generation follows agent-os standards

### Platform-Specific Implementation

#### Task Group 4: Implement GitLab MCP Integration
**Dependencies:** Task Groups 1, 2

- [x] 4.0 Implement GitLab-specific commit and PR analysis
  - [x] 4.1 Implement GitLab commit search
    - Use `mcp_gitlab_search_commits` tool for commit retrieval
    - Search commits by branch name matching Jira keys
    - Search commits by commit message containing Jira keys
    - Handle pagination for large commit histories
    - Apply date range filtering if provided
  - [x] 4.2 Implement GitLab merge request retrieval
    - Use `mcp_gitlab_get_merge_request` tool for MR details
    - Search MRs by title, description, labels containing Jira keys
    - Retrieve MR diffs using `mcp_gitlab_get_branch_diffs` or `mcp_gitlab_get_merge_request_diffs`
    - Extract file paths, lines changed, and diff snippets
  - [x] 4.3 Implement GitLab diff extraction
    - Use `mcp_gitlab_get_branch_diffs` for branch comparisons
    - Use `mcp_gitlab_get_merge_request_diffs` for MR diffs
    - Extract code diff snippets from GitLab API responses
    - Format diffs for markdown output
  - [x] 4.4 Test GitLab integration
    - Test commit search with various Jira key patterns
    - Test MR retrieval and diff extraction
    - Test error handling for missing commits/MRs
    - Verify correlation accuracy

**Acceptance Criteria:**
- GitLab commit search works with all correlation methods
- GitLab MR retrieval and diff extraction functional
- Code diff snippets extracted correctly
- Error handling works for GitLab-specific errors
- Integration tested with real GitLab repositories

#### Task Group 5: Implement GitHub MCP Integration
**Dependencies:** Task Groups 1, 2

- [x] 5.0 Implement GitHub-specific commit and PR analysis
  - [x] 5.1 Implement GitHub commit search
    - Use GitHub MCP tools for commit retrieval (equivalent to GitLab tools)
    - Search commits by branch name matching Jira keys
    - Search commits by commit message containing Jira keys
    - Handle pagination for large commit histories
    - Apply date range filtering if provided
  - [x] 5.2 Implement GitHub pull request retrieval
    - Use GitHub MCP tools for PR details
    - Search PRs by title, description, labels containing Jira keys
    - Retrieve PR diffs using GitHub MCP tools
    - Extract file paths, lines changed, and diff snippets
  - [x] 5.3 Implement GitHub diff extraction
    - Use GitHub MCP tools for diff retrieval
    - Extract code diff snippets from GitHub API responses
    - Format diffs for markdown output
  - [x] 5.4 Test GitHub integration
    - Test commit search with various Jira key patterns
    - Test PR retrieval and diff extraction
    - Test error handling for missing commits/PRs
    - Verify correlation accuracy

**Acceptance Criteria:**
- GitHub commit search works with all correlation methods
- GitHub PR retrieval and diff extraction functional
- Code diff snippets extracted correctly
- Error handling works for GitHub-specific errors
- Integration tested with real GitHub repositories

#### Task Group 6: Implement Azure DevOps MCP Integration
**Dependencies:** Task Groups 1, 2

- [x] 6.0 Implement Azure DevOps-specific commit and PR analysis
  - [x] 6.1 Implement Azure DevOps commit search
    - Use Azure DevOps MCP tools for commit retrieval (equivalent to GitLab/GitHub tools)
    - Search commits by branch name matching Jira keys
    - Search commits by commit message containing Jira keys
    - Handle pagination for large commit histories
    - Apply date range filtering if provided
  - [x] 6.2 Implement Azure DevOps pull request retrieval
    - Use Azure DevOps MCP tools for PR details
    - Search PRs by title, description, labels containing Jira keys
    - Retrieve PR diffs using Azure DevOps MCP tools
    - Extract file paths, lines changed, and diff snippets
  - [x] 6.3 Implement Azure DevOps diff extraction
    - Use Azure DevOps MCP tools for diff retrieval
    - Extract code diff snippets from Azure DevOps API responses
    - Format diffs for markdown output
  - [x] 6.4 Test Azure DevOps integration
    - Test commit search with various Jira key patterns
    - Test PR retrieval and diff extraction
    - Test error handling for missing commits/PRs
    - Verify correlation accuracy

**Acceptance Criteria:**
- Azure DevOps commit search works with all correlation methods
- Azure DevOps PR retrieval and diff extraction functional
- Code diff snippets extracted correctly
- Error handling works for Azure DevOps-specific errors
- Integration tested with real Azure DevOps repositories

### Error Handling and Integration

#### Task Group 7: Implement Error Handling and Integration Logic
**Dependencies:** Task Groups 2, 3, 4, 5, 6

- [x] 7.0 Implement comprehensive error handling
  - [x] 7.1 Handle missing repository configuration
    - Detect missing repository platform in configuration
    - Provide clear error message with setup instructions
    - Handle missing repository project ID
  - [x] 7.2 Handle MCP server unavailability
    - Detect MCP server unavailability gracefully
    - Provide informative error messages
    - Guide user to check MCP server installation
  - [x] 7.3 Handle missing commits/PRs for Jira tickets
    - Document as "no code changes found" (not an error)
    - Continue processing other tickets
    - Include in output with clear indication
  - [x] 7.4 Handle invalid Jira ticket keys or filters
    - Validate Jira ticket key format
    - Validate JQL query syntax
    - Provide informative error messages
    - Continue processing valid tickets if multiple provided
  - [x] 7.5 Handle repository project ID not found
    - Detect invalid project ID
    - Provide clear error message
    - Guide user to verify project ID
  - [x] 7.6 Implement error context for debugging
    - Log errors with context (ticket key, commit hash, etc.)
    - Include error details in markdown output for debugging
    - Continue processing despite individual failures
    - Provide summary of errors at end of processing

**Acceptance Criteria:**
- All error scenarios handled gracefully
- Clear error messages provided for all failure cases
- Process continues despite individual failures
- Error context logged for debugging
- User guidance provided for common errors

## Execution Order

Recommended implementation sequence:
1. Configuration Layer (Task Group 1) - Foundation for all other work
2. Commit Analysis Command Structure (Task Group 2) - Core command structure
3. Platform-Specific Implementations (Task Groups 4, 5, 6) - Can be done in parallel
4. Release Note Generation Command Structure (Task Group 3) - Depends on commit analysis
5. Error Handling and Integration (Task Group 7) - Final polish and robustness

## Notes

- Task Groups 4, 5, and 6 can be implemented in parallel as they are independent platform implementations
- Task Group 3 depends on Task Group 2 being complete
- Task Group 7 should be implemented after all platform integrations are complete
- All commands follow agent-os multi-phase command patterns
- All outputs follow existing folder structure patterns (`YYYY-MM-DD-{folder-name}/`)
- Code analysis storage enables future integration with requirement analysis command

