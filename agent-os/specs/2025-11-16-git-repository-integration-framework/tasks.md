# Task Breakdown: Git Repository Integration Framework

## Overview
Total Tasks: 8 task groups

## Task List

### Framework Structure Layer

#### Task Group 1: Create Framework Directory Structure and Base Files
**Dependencies:** None

- [x] 1.0 Create framework directory structure and base files
  - [x] 1.1 Create framework directory structure
    - Create `agent-qa/framework/git-repository/` directory
    - Create subdirectories: `operations/`, `config/`, `errors/`, `formats/`, `correlation/`
    - Follow agent-os directory structure patterns
  - [x] 1.2 Create framework README.md
    - Document framework purpose and usage
    - Document framework structure and organization
    - Provide examples of how commands should reference framework files
    - Include integration guidelines for commands
  - [x] 1.3 Create framework index file
    - Create `framework-index.md` listing all available framework operations
    - Document which operations are available for each platform
    - Include quick reference for command developers
  - [x] 1.4 Document framework patterns
    - Document instruction file naming conventions
    - Document how commands should reference framework files
    - Document framework file structure patterns
    - Reference agent-os patterns for consistency

**Acceptance Criteria:**
- Framework directory structure created under `agent-qa/framework/git-repository/`
- README.md provides clear documentation for framework usage
- Framework index file lists all available operations
- Framework patterns documented following agent-os conventions

### Configuration Management Layer

#### Task Group 2: Implement Configuration Management Framework
**Dependencies:** Task Group 1

- [x] 2.0 Create configuration management instruction files
  - [x] 2.1 Create `config/read-platform-config.md`
    - Document reading repository platform from YAML config (`agent-os/config.yml` or `agent-qa/config.yml`)
    - Handle `repository_platform` setting (github, gitlab, azure-devops)
    - Validate platform value against supported platforms
    - Provide clear error messages for missing or invalid configuration
    - Reference configuration reading patterns from `analyze-commits/1-initialize-and-determine-input.md`
  - [x] 2.2 Create `config/validate-mcp-server.md`
    - Document MCP server validation patterns
    - Check GitLab MCP server availability (if platform is gitlab)
    - Check GitHub MCP server availability (if platform is github)
    - Check Azure DevOps MCP server availability (if platform is azure-devops)
    - Provide consistent error messages for unavailable MCP servers
    - Reference MCP server initialization patterns from `analyze-requirements/1-initialize-and-determine-input.md`
  - [x] 2.3 Create `config/manage-project-id.md`
    - Document repository project ID management
    - Handle project ID from config file (if stored)
    - Handle project ID from input parameters (if provided)
    - Validate project ID format per platform
    - Provide clear error messages for missing or invalid project IDs
  - [x] 2.4 Create `config/get-cloud-id.md` (for Azure DevOps)
    - Document Azure DevOps cloud ID retrieval patterns
    - Handle cloud ID from config or input parameters
    - Validate cloud ID format
    - Provide error handling for missing cloud ID

**Acceptance Criteria:**
- Configuration management instruction files created in `agent-qa/framework/git-repository/config/`
- Platform configuration reading standardized across all operations
- MCP server validation patterns documented and reusable
- Project ID management centralized and consistent
- Error messages are clear and actionable

### Platform Abstraction Layer

#### Task Group 3: Create Platform Abstraction and MCP Tool Mapping
**Dependencies:** Task Group 2

- [x] 3.0 Create platform abstraction instruction files
  - [x] 3.1 Create `operations/platform-abstraction.md`
    - Document unified interface patterns for platform abstraction
    - Define common operation signatures (inputs/outputs)
    - Document how platform-specific implementations are hidden
    - Provide examples of unified interface usage
  - [x] 3.2 Create `operations/mcp-tool-mapping-gitlab.md`
    - Document GitLab MCP tool mappings
    - Map `mcp_gitlab_search_commits` to unified commit search operation
    - Map `mcp_gitlab_get_merge_request` to unified PR/MR retrieval operation
    - Map `mcp_gitlab_get_branch_diffs` to unified diff extraction operation
    - Map `mcp_gitlab_get_merge_request_diffs` to unified PR/MR diff operation
    - Map `mcp_gitlab_list_branches_by_repo` to unified branch listing operation
    - Map `mcp_gitlab_list_pull_requests_by_repo_or_project` to unified PR/MR listing operation
    - Document GitLab-specific parameters and handling
  - [x] 3.3 Create `operations/mcp-tool-mapping-github.md`
    - Document GitHub MCP tool mappings (equivalent tools to GitLab)
    - Map GitHub commit search tools to unified commit search operation
    - Map GitHub PR retrieval tools to unified PR/MR retrieval operation
    - Map GitHub diff extraction tools to unified diff extraction operation
    - Map GitHub branch listing tools to unified branch listing operation
    - Document GitHub-specific parameters and handling
    - Note: Exact tool names to be determined based on GitHub MCP server
  - [x] 3.4 Create `operations/mcp-tool-mapping-azure-devops.md`
    - Document Azure DevOps MCP tool mappings
    - Map `mcp_Azure_DevOps_repo_search_commits` to unified commit search operation
    - Map `mcp_Azure_DevOps_repo_get_pull_request_by_id` to unified PR/MR retrieval operation
    - Map `mcp_Azure_DevOps_repo_get_branch_diffs` to unified diff extraction operation
    - Document Azure DevOps-specific parameters and handling (project, repository parameters)
    - Document cloud ID handling for Azure DevOps operations

**Acceptance Criteria:**
- Platform abstraction instruction files created
- MCP tool mappings documented for all three platforms
- Unified interface patterns clearly defined
- Platform-specific differences abstracted behind common interface
- Commands can use framework without platform-specific knowledge

### Common Operations Layer

#### Task Group 4: Implement Commit Search Standardization
**Dependencies:** Task Group 3

- [x] 4.0 Create commit search operation instruction files
  - [x] 4.1 Create `operations/commit-search.md`
    - Document unified commit search interface
    - Define common parameters: repository_project_id, branch_name (optional), commit_message (optional), date_range (optional), pagination (optional)
    - Define standardized output format (commit metadata structure)
    - Document how commands should call this operation
  - [x] 4.2 Create `operations/commit-search-gitlab.md`
    - Document GitLab-specific commit search implementation
    - Use `mcp_gitlab_search_commits` tool
    - Map unified parameters to GitLab-specific parameters
    - Handle pagination using GitLab pagination patterns
    - Transform GitLab response to standardized format
  - [x] 4.3 Create `operations/commit-search-github.md`
    - Document GitHub-specific commit search implementation
    - Use GitHub MCP commit search tools
    - Map unified parameters to GitHub-specific parameters
    - Handle pagination using GitHub pagination patterns
    - Transform GitHub response to standardized format
  - [x] 4.4 Create `operations/commit-search-azure-devops.md`
    - Document Azure DevOps-specific commit search implementation
    - Use `mcp_Azure_DevOps_repo_search_commits` tool
    - Map unified parameters to Azure DevOps-specific parameters (project, repository)
    - Handle pagination using Azure DevOps pagination patterns
    - Transform Azure DevOps response to standardized format

**Acceptance Criteria:**
- Commit search operation standardized across all platforms
- Unified interface documented and implemented
- Platform-specific implementations handle parameter mapping correctly
- Pagination handled consistently across platforms
- Output format standardized regardless of platform

#### Task Group 5: Implement PR/MR Retrieval Standardization
**Dependencies:** Task Group 3

- [x] 5.0 Create PR/MR retrieval operation instruction files
  - [x] 5.1 Create `operations/pr-mr-retrieval.md`
    - Document unified PR/MR retrieval interface
    - Define common operations: get by ID, search by title/description/labels
    - Define common parameters: repository_project_id, pr_mr_id (for get by ID), search_query (for search)
    - Define standardized output format (PR/MR metadata structure)
    - Document how commands should call these operations
  - [ ] 5.2 Create `operations/pr-mr-retrieval-gitlab.md`
    - Document GitLab-specific PR/MR retrieval implementation
    - Use `mcp_gitlab_get_merge_request` for get by ID
    - Use `mcp_gitlab_list_pull_requests_by_repo_or_project` for search
    - Map unified parameters to GitLab-specific parameters
    - Transform GitLab response to standardized format
  - [ ] 5.3 Create `operations/pr-mr-retrieval-github.md`
    - Document GitHub-specific PR/MR retrieval implementation
    - Use GitHub MCP PR retrieval tools
    - Map unified parameters to GitHub-specific parameters
    - Transform GitHub response to standardized format
  - [ ] 5.4 Create `operations/pr-mr-retrieval-azure-devops.md`
    - Document Azure DevOps-specific PR/MR retrieval implementation
    - Use `mcp_Azure_DevOps_repo_get_pull_request_by_id` for get by ID
    - Use Azure DevOps search tools for search operations
    - Map unified parameters to Azure DevOps-specific parameters (project, repository)
    - Transform Azure DevOps response to standardized format

**Acceptance Criteria:**
- PR/MR retrieval operations standardized across all platforms
- Unified interface supports both get by ID and search operations
- Platform-specific implementations handle parameter mapping correctly
- Output format standardized regardless of platform

#### Task Group 6: Implement Diff Extraction Standardization
**Dependencies:** Task Group 3

- [x] 6.0 Create diff extraction operation instruction files
  - [x] 6.1 Create `operations/diff-extraction.md`
    - Document unified diff extraction interface
    - Define common operations: get branch diffs, get PR/MR diffs
    - Define common parameters: repository_project_id, branch_name (for branch diffs), pr_mr_id (for PR/MR diffs), from_branch (optional), to_branch (optional)
    - Define standardized output format (file paths, lines added/removed, diff snippets)
    - Document how commands should call these operations
  - [ ] 6.2 Create `operations/diff-extraction-gitlab.md`
    - Document GitLab-specific diff extraction implementation
    - Use `mcp_gitlab_get_branch_diffs` for branch diffs
    - Use `mcp_gitlab_get_merge_request_diffs` for MR diffs
    - Map unified parameters to GitLab-specific parameters
    - Extract file paths, lines changed, diff snippets consistently
    - Transform GitLab response to standardized format
  - [ ] 6.3 Create `operations/diff-extraction-github.md`
    - Document GitHub-specific diff extraction implementation
    - Use GitHub MCP diff extraction tools
    - Map unified parameters to GitHub-specific parameters
    - Extract file paths, lines changed, diff snippets consistently
    - Transform GitHub response to standardized format
  - [ ] 6.4 Create `operations/diff-extraction-azure-devops.md`
    - Document Azure DevOps-specific diff extraction implementation
    - Use `mcp_Azure_DevOps_repo_get_branch_diffs` for branch diffs
    - Use Azure DevOps PR diff tools for PR diffs
    - Map unified parameters to Azure DevOps-specific parameters (project, repository)
    - Extract file paths, lines changed, diff snippets consistently
    - Transform Azure DevOps response to standardized format

**Acceptance Criteria:**
- Diff extraction operations standardized across all platforms
- Unified interface supports both branch diffs and PR/MR diffs
- File paths, lines changed, and diff snippets extracted consistently
- Platform-specific implementations handle parameter mapping correctly
- Output format standardized regardless of platform

#### Task Group 7: Implement Branch Listing Standardization
**Dependencies:** Task Group 3

- [x] 7.0 Create branch listing operation instruction files
  - [x] 7.1 Create `operations/branch-listing.md`
    - Document unified branch listing interface
    - Define common parameters: repository_project_id, filter_contains (optional), top (optional)
    - Define standardized output format (branch information structure)
    - Document how commands should call this operation
  - [ ] 7.2 Create `operations/branch-listing-gitlab.md`
    - Document GitLab-specific branch listing implementation
    - Use `mcp_gitlab_list_branches_by_repo` tool
    - Map unified parameters to GitLab-specific parameters
    - Transform GitLab response to standardized format
  - [ ] 7.3 Create `operations/branch-listing-github.md`
    - Document GitHub-specific branch listing implementation
    - Use GitHub MCP branch listing tools
    - Map unified parameters to GitHub-specific parameters
    - Transform GitHub response to standardized format
  - [ ] 7.4 Create `operations/branch-listing-azure-devops.md`
    - Document Azure DevOps-specific branch listing implementation
    - Use Azure DevOps branch listing tools
    - Map unified parameters to Azure DevOps-specific parameters (project, repository)
    - Transform Azure DevOps response to standardized format

**Acceptance Criteria:**
- Branch listing operation standardized across all platforms
- Unified interface documented and implemented
- Platform-specific implementations handle parameter mapping correctly
- Output format standardized regardless of platform

### Correlation Methods Layer

#### Task Group 8: Implement Correlation Methods
**Dependencies:** Task Group 4, Task Group 5

- [ ] 8.0 Create correlation methods instruction files
  - [ ] 8.1 Create `correlation/branch-name-matching.md`
    - Document branch name matching patterns for Jira key correlation
    - Define patterns: "PROJ-123-feature", "PROJ-123_rc", "PROJ-123/branch-name"
    - Document regex patterns for extracting Jira keys from branch names
    - Provide reusable correlation logic for commands
    - Include examples of branch name patterns and expected matches
  - [ ] 8.2 Create `correlation/commit-message-parsing.md`
    - Document commit message parsing and Jira key extraction
    - Define patterns: "PROJ-123: Fix bug", "[PROJ-123] Description", "PROJ-123 PROJ-124 Multiple keys"
    - Document regex patterns for extracting Jira keys from commit messages
    - Handle multiple Jira keys in single commit message
    - Provide reusable correlation logic for commands
  - [ ] 8.3 Create `correlation/pr-mr-matching.md`
    - Document PR/MR title/description/label matching patterns
    - Define patterns for extracting Jira keys from PR/MR titles
    - Define patterns for extracting Jira keys from PR/MR descriptions
    - Define patterns for extracting Jira keys from PR/MR labels
    - Define patterns for extracting Jira keys from PR/MR custom fields (if applicable)
    - Provide reusable correlation logic for commands
    - Include examples of PR/MR patterns and expected matches
  - [ ] 8.4 Create `correlation/unified-correlation.md`
    - Document unified correlation interface combining all correlation methods
    - Define how to correlate commits/PRs with Jira tickets using all methods simultaneously
    - Provide reusable correlation workflow for commands
    - Document correlation result structure (Jira key → list of commits/PRs)
    - Include examples of comprehensive correlation scenarios

**Acceptance Criteria:**
- Correlation methods documented and implemented
- Branch name matching patterns work correctly
- Commit message parsing extracts Jira keys accurately
- PR/MR matching patterns work across all platforms
- Unified correlation interface combines all methods effectively
- Correlation logic is reusable by commands

### Error Handling Layer

#### Task Group 9: Implement Error Handling Patterns
**Dependencies:** Task Group 2

- [x] 9.0 Create error handling instruction files
  - [x] 9.1 Create `errors/common-error-handling.md`
    - Document common error handling patterns for all operations
    - Define error types: MCP server failures, missing repositories, invalid project IDs, network/timeout errors, unauthorized access
    - Document consistent error message formats
    - Document graceful degradation patterns (continue processing despite individual failures)
    - Document error context logging for debugging
    - Reference error handling patterns from existing commands
  - [ ] 9.2 Create `errors/mcp-server-errors.md`
    - Document MCP server failure handling
    - Handle unavailable MCP server errors
    - Handle MCP server timeout errors
    - Provide clear error messages for MCP server issues
    - Document retry patterns (if applicable)
  - [ ] 9.3 Create `errors/repository-errors.md`
    - Document missing repository error handling
    - Handle invalid repository project ID errors
    - Handle repository access permission errors
    - Provide clear error messages for repository issues
  - [ ] 9.4 Create `errors/network-errors.md`
    - Document network/timeout error handling
    - Handle connection timeout errors
    - Handle rate limiting errors (if applicable)
    - Document graceful degradation for network issues
  - [ ] 9.5 Create `errors/unauthorized-errors.md`
    - Document unauthorized access error handling
    - Handle authentication failures
    - Handle permission denied errors
    - Provide clear error messages for authorization issues

**Acceptance Criteria:**
- Error handling patterns documented for all error types
- Consistent error messages across all operations
- Graceful degradation implemented (continue processing despite failures)
- Error context logging provides useful debugging information
- Error handling patterns are reusable by commands

### Output Format Standardization Layer

#### Task Group 10: Implement Output Format Standardization
**Dependencies:** Task Group 4, Task Group 5, Task Group 6, Task Group 7

- [ ] 10.0 Create output format standardization instruction files
  - [ ] 10.1 Create `formats/commit-metadata-format.md`
    - Document standardized commit metadata structure
    - Define fields: hash, author, date, message, branch_name, repository_project_id
    - Ensure consistent format across all platforms
    - Provide examples of standardized commit metadata
  - [ ] 10.2 Create `formats/pr-mr-metadata-format.md`
    - Document standardized PR/MR metadata structure
    - Define fields: id, title, description, status, merge_date, links (web_url, api_url), repository_project_id
    - Ensure consistent format across all platforms
    - Handle platform-specific fields (labels, reviewers, etc.) consistently
    - Provide examples of standardized PR/MR metadata
  - [ ] 10.3 Create `formats/code-changes-format.md`
    - Document standardized code changes structure
    - Define fields: file_paths (array), lines_added (per file), lines_removed (per file), diff_snippets (per file), total_files_changed, total_lines_added, total_lines_removed
    - Ensure consistent format across all platforms
    - Provide examples of standardized code changes format
  - [ ] 10.4 Create `formats/branch-information-format.md`
    - Document standardized branch information structure
    - Define fields: branch_name, commit_hash, commit_date, author, repository_project_id
    - Ensure consistent format across all platforms
    - Provide examples of standardized branch information
  - [ ] 10.5 Create `formats/unified-output-format.md`
    - Document unified output format combining all data types
    - Define how commands should structure output using framework formats
    - Provide examples of complete output structures
    - Document format transformation patterns (platform-specific → standardized)

**Acceptance Criteria:**
- Output formats standardized for all data types
- Commit metadata format consistent across platforms
- PR/MR metadata format consistent across platforms
- Code changes format consistent across platforms
- Branch information format consistent across platforms
- Unified output format documented and examples provided

### Documentation Layer

#### Task Group 11: Create Framework Documentation
**Dependencies:** All previous task groups

- [x] 11.0 Create comprehensive framework documentation
  - [x] 11.1 Enhance framework README.md
    - Add usage examples for each operation
    - Add integration examples showing how commands use framework
    - Document framework architecture and design decisions
    - Include troubleshooting guide
  - [x] 11.2 Create `framework/QUICK_START.md`
    - Provide quick start guide for command developers
    - Show how to use framework in a new command
    - Include minimal working examples
    - Link to detailed documentation
  - [ ] 11.3 Create `framework/EXAMPLES.md` (Can be added later with comprehensive examples)
    - Provide comprehensive examples of framework usage
    - Show examples for each platform (GitLab, GitHub, Azure DevOps)
    - Show examples of error handling
    - Show examples of correlation methods
  - [x] 11.4 Update framework index file
    - Ensure all operations are listed
    - Include links to all instruction files
    - Include platform support matrix
    - Include operation dependency graph

**Acceptance Criteria:**
- Framework documentation is comprehensive and clear
- Quick start guide helps developers get started quickly
- Examples demonstrate framework usage effectively
- Framework index provides complete reference
- Documentation follows agent-os documentation standards

