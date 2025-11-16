# Spec Requirements: Commit Analysis and Technical Release Note Generation

## Initial Description

Combine roadmap items 13 and 15:

**Item 13: Commit and Pull Request Analysis** — Analyze git commits, pull requests, and merge requests to extract code changes, identify affected requirements, and correlate changes with Jira tickets for traceability.

**Item 15: Technical Release Note Generation** — Create technical release notes with full requirement traceability, linking code changes (commits/PRs) to requirements (Jira tickets), test cases, and documenting feature changes and impacts.

These features are tied together: commit/PR analysis provides the foundation for generating comprehensive technical release notes with full traceability.

## Requirements Discussion

### First Round Questions

**Q1:** Repository MCP Server Selection - I assume the agent should support user-selectable repository platforms (GitLab, GitHub, Azure DevOps) via MCP servers, similar to how roadmap item #16 describes. Should we implement this as a separate command that prompts the user to select their repository platform, or should it use a configuration setting from installation?

**Answer:** It should use a configuration setting from installation. During the agent-qa installation the user should be prompted to choose between GitHub, GitLab or Azure DevOps. We assume that the user already installed the corresponding MCP server.

**Q2:** Jira-Git Correlation Method - I'm thinking we should correlate commits/PRs with Jira tickets using multiple methods: branch names matching Jira keys (e.g., "PROJ-123-feature"), commit messages containing Jira keys, PR titles/descriptions referencing Jira keys, and potentially PR labels or custom fields. Should we support all these methods, or focus on specific ones?

**Answer:** Let's stick to your assumptions (support all methods: branch names, commit messages, PR titles/descriptions, PR labels, custom fields).

**Q3:** Input Parameters - For commit/PR analysis, I assume the input should be similar to your existing Jira-GitLab analysis template - a Jira filter (JQL query) or fixVersion(s), plus repository project ID and optional date range. Should we also support analyzing commits/PRs for a specific Jira ticket key, or only for filters/releases?

**Answer:** Correct. Please add analyzing commits/PRs for a specific Jira ticket key.

**Q4:** Code Change Analysis - I'm thinking we should extract: file paths changed, lines added/removed, summary of changes per file, and overall change summary. Should we also include code diff snippets, or just high-level summaries? Should we analyze the actual code changes or just metadata?

**Answer:** Please include code diff snippets and analyze code changes (it could be useful for future enhancement for the requirement analysis command).

**Q5:** Release Note Content - For technical release notes, I assume we should include: requirements summary (from Jira tickets), code changes summary (from commits/PRs), test cases generated (if available), affected components/modules, and impact analysis. Should we also include: deployment notes, breaking changes, migration requirements, or performance impacts?

**Answer:** No (exclude deployment notes, breaking changes, migration requirements, performance impacts).

**Q6:** Integration with Existing Commands - I'm thinking the release note generation should check for existing requirements analysis folders (like other generate commands) and optionally use generated test cases, test plans, and risk registers as context. Should release notes be a standalone command that prompts for requirements analysis selection, or should it integrate directly into the analyze-requirements workflow?

**Answer:** A standalone command that prompts for requirements analysis selection. But I want also the possibility to call it without requirements, in this case the standalone command will call requirement analysis command.

**Q7:** Output Structure - I assume release notes should be generated as markdown files in `agent-qa/YYYY-MM-DD-{folder-name}/release-notes/` following the same pattern as other commands. Should we generate one release note per requirement analysis folder, or support generating release notes for multiple requirements analyses combined?

**Answer:** Your assumption is good. I let you choose the easiest way to do that (one release note per requirement analysis folder).

**Q8:** Scope Boundaries - Should commit/PR analysis be a separate command (e.g., `analyze-commits`), or should it be integrated into the release note generation command? Also, should we exclude any types of commits (merge commits, revert commits, etc.) or analyze all commits?

**Answer:** I think separate command, it could be useful for future enhancement for the requirement analysis command. Analyze all commits.

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

#### Commit and Pull Request Analysis Command (`analyze-commits`)

**Core Functionality:**
- **Input Support:**
  - Jira filter (JQL query) or fixVersion(s)
  - Specific Jira ticket key(s)
  - Repository project ID (from configuration)
  - Optional date range

- **Repository Platform:**
  - Use configuration setting from installation (GitHub, GitLab, or Azure DevOps)
  - Assume corresponding MCP server is already installed
  - Support all three platforms via MCP servers

- **Jira-Git Correlation Methods:**
  - Branch names matching Jira keys (e.g., "PROJ-123-feature", "PROJ-123_rc")
  - Commit messages containing Jira keys
  - PR/MR titles referencing Jira keys
  - PR/MR descriptions referencing Jira keys
  - PR/MR labels containing Jira keys
  - PR/MR custom fields containing Jira keys

- **Code Change Analysis:**
  - Extract file paths changed
  - Extract lines added/removed per file
  - Extract code diff snippets
  - Analyze actual code changes (not just metadata)
  - Generate summary of changes per file
  - Generate overall change summary
  - Store analysis for future requirement analysis enhancement

- **Commit Processing:**
  - Analyze all commits (no exclusions for merge commits, revert commits, etc.)
  - Process commits for each correlated Jira ticket
  - Support both commits and PRs/MRs

- **Output:**
  - Markdown files with code change analysis
  - Store in `agent-qa/YYYY-MM-DD-{folder-name}/commits/` or similar structure
  - Include correlation mapping (Jira ticket → commits/PRs)
  - Include code diff snippets
  - Include change summaries

#### Technical Release Note Generation Command (`generate-release-notes`)

**Core Functionality:**
- **Input Options:**
  - **Option 1**: Prompt user to select existing requirements analysis folder (like other generate commands)
  - **Option 2**: Call without requirements analysis - in this case, automatically call `analyze-requirements` command first

- **Content Generation:**
  - Requirements summary (from Jira tickets)
  - Code changes summary (from commits/PRs via analyze-commits)
  - Test cases generated (if available from test-cases folder)
  - Affected components/modules
  - Impact analysis
  - **Exclude**: Deployment notes, breaking changes, migration requirements, performance impacts

- **Traceability:**
  - Link code changes (commits/PRs) to requirements (Jira tickets)
  - Link test cases to requirements
  - Link code changes to test cases
  - Full requirement traceability matrix

- **Integration:**
  - Use existing requirements analysis data
  - Optionally use generated test cases, test plans, risk registers as context
  - Call `analyze-commits` command if commit analysis not already done

- **Output:**
  - Markdown files in `agent-qa/YYYY-MM-DD-{folder-name}/release-notes/`
  - One release note per requirement analysis folder (easiest approach)
  - Include all traceability links
  - Professional formatting following agent-os standards

### Reusability Opportunities

- **Existing Commands:**
  - Reuse patterns from `analyze-requirements` command for folder structure and user selection
  - Reuse patterns from `generate-test-charter`, `generate-test-strategy`, etc. for standalone command structure
  - Reuse MCP server integration patterns from Atlassian integration

- **Prompt Templates:**
  - Reference `jira-gitlab-analysis.md` template for Jira-Git correlation patterns
  - Reference existing release note generation patterns from templates
  - Use code analysis patterns from templates

### Scope Boundaries

**In Scope:**
- Separate `analyze-commits` command for commit/PR analysis
- Separate `generate-release-notes` command for release note generation
- Support for GitHub, GitLab, and Azure DevOps via MCP servers
- Multiple correlation methods (branch names, commit messages, PR titles/descriptions, labels, custom fields)
- Code diff snippet extraction and analysis
- Full requirement traceability in release notes
- Integration with existing requirements analysis workflow
- Standalone operation (can call release notes without requirements, triggers analyze-requirements)

**Out of Scope:**
- Deployment notes in release notes
- Breaking changes documentation
- Migration requirements documentation
- Performance impacts documentation
- Direct integration into analyze-requirements workflow (separate commands)
- Combining multiple requirements analyses into one release note (one per folder)

### Technical Considerations

- **MCP Server Integration:**
  - Use repository MCP server selected during installation (GitHub, GitLab, or Azure DevOps)
  - Assume MCP server is already installed and configured
  - Use MCP tools for: commit retrieval, PR/MR retrieval, diff retrieval, branch analysis

- **Configuration:**
  - Repository platform selection stored in installation configuration
  - Repository project ID may need to be provided per analysis or stored in config

- **Code Analysis:**
  - Extract and store code diff snippets for future requirement analysis enhancement
  - Analyze actual code changes (not just metadata)
  - Store analysis results for reuse

- **Command Structure:**
  - Follow agent-os multi-phase command patterns
  - Separate commands: `analyze-commits` and `generate-release-notes`
  - Both commands follow existing command patterns (folder selection, standalone operation)

- **Integration Points:**
  - `generate-release-notes` can call `analyze-requirements` if no requirements found
  - `generate-release-notes` can call `analyze-commits` if commit analysis not done
  - Both commands integrate with existing folder structure (`agent-qa/YYYY-MM-DD-{folder-name}/`)

- **Output Format:**
  - Markdown files following agent-os standards
  - Proper structure, tables, and formatting
  - Traceability links between all artifacts

