# Specification: Commit Analysis and Technical Release Note Generation

## Goal

Create two separate commands (`analyze-commits` and `generate-release-notes`) that analyze git commits and pull requests/merge requests to extract code changes, correlate them with Jira tickets, and generate comprehensive technical release notes with full requirement traceability linking code changes, requirements, and test cases.

## User Stories

- As a QA Analyst, I want to analyze commits and PRs correlated with Jira tickets so that I can understand code changes and their impact on requirements
- As a Release Manager, I want technical release notes with full traceability so that I can document feature changes, code impacts, and test coverage for releases
- As a QA Manager, I want commit analysis stored separately so that I can reuse it for future requirement analysis enhancements

## Specific Requirements

**Repository MCP Server Configuration**
- Use repository platform selection from installation configuration (GitHub, GitLab, or Azure DevOps)
- Assume corresponding MCP server is already installed and configured
- Support all three platforms via their respective MCP servers
- Read repository platform from agent configuration (YAML file)

**Commit and Pull Request Analysis Command (`analyze-commits`)**
- Accept input: Jira filter (JQL query), fixVersion(s), specific Jira ticket key(s), repository project ID, optional date range
- Support single Jira ticket key analysis (e.g., "PROJ-123")
- Support multiple Jira ticket keys analysis (comma-separated or array format)
- Support JQL query or fixVersion-based analysis
- Use repository MCP server tools to retrieve commits and PRs/MRs
- Store outputs in `agent-qa/YYYY-MM-DD-{folder-name}/commits/` following existing folder structure pattern

**Jira-Git Correlation Methods**
- Correlate using branch names matching Jira keys (e.g., "PROJ-123-feature", "PROJ-123_rc")
- Correlate using commit messages containing Jira keys (e.g., "PROJ-123: Fix bug")
- Correlate using PR/MR titles referencing Jira keys
- Correlate using PR/MR descriptions referencing Jira keys
- Correlate using PR/MR labels containing Jira keys
- Correlate using PR/MR custom fields containing Jira keys
- Support all correlation methods simultaneously for comprehensive matching

**Code Change Extraction and Analysis**
- Extract file paths changed for each commit/PR
- Extract lines added/removed per file
- Extract code diff snippets (actual code changes, not just metadata)
- Analyze actual code changes to understand impact and context
- Generate summary of changes per file
- Generate overall change summary per commit/PR
- Store analysis results for future requirement analysis enhancement

**Commit Processing Scope**
- Analyze all commits (no exclusions for merge commits, revert commits, etc.)
- Process both individual commits and PRs/MRs
- Process commits for each correlated Jira ticket
- Handle pagination for large commit histories
- Support date range filtering when provided

**Commit Analysis Output Format**
- Generate markdown files with code change analysis
- Include correlation mapping (Jira ticket → commits/PRs)
- Include code diff snippets in formatted markdown code blocks
- Include change summaries per file and overall
- Include commit metadata (author, date, message, hash)
- Include PR/MR metadata (title, description, status, merge date, links)

**Technical Release Note Generation Command (`generate-release-notes`)**
- Support two input modes: prompt user to select existing requirements analysis folder (like other generate commands), or call without requirements (automatically triggers `analyze-requirements` command)
- Check for existing requirements analysis folders in `agent-qa/` directory
- Prompt user to select folder if multiple exist
- Automatically call `analyze-requirements` if no requirements found
- Store outputs in `agent-qa/YYYY-MM-DD-{folder-name}/release-notes/` following existing pattern

**Release Note Content Generation**
- Generate requirements summary from Jira tickets (from requirements analysis)
- Generate code changes summary from commits/PRs (via `analyze-commits` command or existing analysis)
- Include test cases generated (if available from test-cases folder)
- Identify affected components/modules from code changes
- Generate impact analysis based on requirements and code changes
- Exclude deployment notes, breaking changes, migration requirements, and performance impacts

**Release Note Traceability**
- Link code changes (commits/PRs) to requirements (Jira tickets) with explicit references
- Link test cases to requirements with traceability matrix
- Link code changes to test cases showing what code is covered by which tests
- Generate full requirement traceability matrix/summary
- Include links to all related artifacts (requirements, commits, test cases, test plans)

**Release Note Integration**
- Use existing requirements analysis data from selected folder
- Optionally use generated test cases, test plans, risk registers as context
- Call `analyze-commits` command if commit analysis not already done for the selected folder
- Integrate commit analysis results into release note generation
- Reference existing deliverables (test cases, test plans, strategies, charters) in release notes

**Release Note Output Structure**
- Generate one release note per requirement analysis folder (easiest approach)
- Format as professional markdown following agent-os standards
- Include executive summary, requirements section, code changes section, test coverage section, traceability matrix
- Use proper markdown formatting (tables, lists, code blocks, links)
- Include all traceability links between artifacts

**Command Structure and Patterns**
- Follow agent-os multi-phase command patterns (like `analyze-requirements`, `generate-test-charter`, etc.)
- Use numbered phase files for workflow steps
- Implement folder selection logic similar to other generate commands
- Support standalone operation (can call without prerequisites, triggers dependent commands)
- Integrate with existing folder structure (`agent-qa/YYYY-MM-DD-{folder-name}/`)

**MCP Server Tool Usage**
- Use GitLab MCP tools: `mcp_gitlab_search_commits`, `mcp_gitlab_get_merge_request`, `mcp_gitlab_get_branch_diffs`, etc.
- Use GitHub MCP tools: equivalent GitHub MCP server tools for commits, PRs, diffs
- Use Azure DevOps MCP tools: equivalent Azure DevOps MCP server tools for commits, PRs, diffs
- Handle platform-specific differences in MCP tool interfaces
- Abstract platform differences in command implementation

**Error Handling**
- Handle missing repository configuration with clear error messages
- Handle MCP server unavailability gracefully
- Handle missing commits/PRs for Jira tickets (not an error, document as "no code changes found")
- Handle invalid Jira ticket keys or filters
- Handle repository project ID not found
- Provide informative error context for debugging
- Continue processing other tickets if one fails

**Code Analysis Storage**
- Store code diff snippets for future requirement analysis enhancement
- Store correlation mappings for reuse
- Store change summaries in structured format
- Enable future integration with requirement analysis command

## Visual Design

No visual assets provided.

## Existing Code to Leverage

**Atlassian MCP Integration Patterns**
- Reuse MCP server initialization patterns from `analyze-requirements/1-initialize-and-determine-input.md`
- Reuse folder structure and date-based folder creation logic from existing commands
- Reuse MCP tool calling patterns and error handling from Atlassian integration

**Command Structure Patterns**
- Reuse multi-phase command structure from `analyze-requirements/analyze-requirements.md`
- Reuse folder selection logic from `generate-test-charter/1-find-and-select-requirements.md`
- Reuse standalone command patterns that trigger dependent commands
- Reuse output folder structure patterns (`YYYY-MM-DD-{folder-name}/`)

**Jira-Git Correlation Patterns**
- Reference `jira-gitlab-analysis.md` template for branch name matching patterns (e.g., "PROJ-123_rc", "PROJ-123")
- Reference template for commit message parsing and Jira key extraction
- Reference template for PR/MR correlation methods

**Release Note Generation Patterns**
- Reference existing release note generation patterns from prompt templates
- Reuse traceability matrix generation patterns from test case generation
- Reuse markdown formatting standards from agent-os standards

**Code Analysis Patterns**
- Reference code analysis patterns from prompt templates
- Reuse diff extraction and formatting patterns
- Reuse change summary generation patterns

## Out of Scope

- Deployment notes in release notes
- Breaking changes documentation
- Migration requirements documentation
- Performance impacts documentation
- Direct integration into `analyze-requirements` workflow (separate commands)
- Combining multiple requirements analyses into one release note (one per folder)
- Automatic test case generation from code changes
- Code review or quality analysis of code changes
- Automated deployment or CI/CD integration
- Real-time commit monitoring or webhooks
- Git repository cloning or local repository access (MCP servers only)

