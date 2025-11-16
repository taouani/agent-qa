# PHASE 3: Correlate Tickets with Commits/PRs

Correlate retrieved Jira tickets with commits and pull requests/merge requests using multiple correlation methods.

## Core Responsibilities

1. **Extract Jira Keys**: Extract Jira ticket keys from retrieved tickets
2. **Correlate Using Multiple Methods**: Use all correlation methods simultaneously
3. **Create Correlation Mapping**: Map Jira tickets to commits/PRs
4. **Handle Missing Correlations**: Document tickets with no correlated commits/PRs

## Workflow

### Step 1: Extract Jira Keys from Tickets

For each retrieved ticket:
- Extract ticket key (e.g., "PROJ-123")
- Store ticket key with ticket metadata
- Create list of all Jira keys for correlation

### Step 2: Correlate Using Branch Name Matching

For each Jira key, search for branches matching patterns:
- `{JIRA-KEY}` (e.g., "PROJ-123")
- `{JIRA-KEY}-*` (e.g., "PROJ-123-feature", "PROJ-123-bugfix")
- `{JIRA-KEY}_rc` (e.g., "PROJ-123_rc")
- `{JIRA-KEY}_*` (e.g., "PROJ-123_rc", "PROJ-123_dev")

**Platform-Specific Implementation:**
- **GitLab**: Use `mcp_gitlab_list_branches_by_repo` and filter by branch name patterns
- **GitHub**: Use GitHub MCP tools to list branches and filter by name patterns
- **Azure DevOps**: Use Azure DevOps MCP tools to list branches and filter by name patterns

For each matching branch:
- Retrieve commits from that branch
- Correlate commits with Jira ticket

### Step 3: Correlate Using Commit Messages

For each Jira key, search commits containing the key in commit message:
- Search pattern: commit message contains `{JIRA-KEY}` (e.g., "PROJ-123", "PROJ-123:", "fixes PROJ-123")

**Platform-Specific Implementation:**
- **GitLab**: Use `mcp_gitlab_search_commits` with search text containing Jira key
- **GitHub**: Use GitHub MCP tools to search commits by message
- **Azure DevOps**: Use Azure DevOps MCP tools to search commits by message

Apply date range filtering if provided in Phase 1.

### Step 4: Correlate Using PR/MR Titles

For each Jira key, search PRs/MRs with title containing the key:
- Search pattern: PR/MR title contains `{JIRA-KEY}`

**Platform-Specific Implementation:**
- **GitLab**: Use `mcp_gitlab_list_pull_requests_by_repo_or_project` and filter by title
- **GitHub**: Use GitHub MCP tools to list PRs and filter by title
- **Azure DevOps**: Use Azure DevOps MCP tools to list PRs and filter by title

### Step 5: Correlate Using PR/MR Descriptions

For each Jira key, search PRs/MRs with description containing the key:
- Search pattern: PR/MR description contains `{JIRA-KEY}`

**Platform-Specific Implementation:**
- Use same tools as Step 4, but filter by description field

### Step 6: Correlate Using PR/MR Labels

For each Jira key, search PRs/MRs with labels containing the key:
- Search pattern: PR/MR labels contain `{JIRA-KEY}`

**Platform-Specific Implementation:**
- Use same tools as Step 4, but filter by labels field

### Step 7: Correlate Using PR/MR Custom Fields

For each Jira key, search PRs/MRs with custom fields containing the key:
- Search pattern: PR/MR custom fields contain `{JIRA-KEY}`

**Platform-Specific Implementation:**
- Use same tools as Step 4, but filter by custom fields

### Step 8: Combine All Correlation Methods

For each Jira ticket:
- Combine results from all correlation methods (Steps 2-7)
- Deduplicate commits/PRs (same commit/PR may match multiple methods)
- Create comprehensive list of correlated commits/PRs

### Step 9: Create Correlation Mapping

Create correlation mapping structure:
```
{
  "PROJ-123": {
    "ticket": { ... ticket data ... },
    "commits": [
      { "hash": "...", "message": "...", "author": "...", "date": "...", "correlation_method": "branch_name" },
      { "hash": "...", "message": "...", "author": "...", "date": "...", "correlation_method": "commit_message" }
    ],
    "prs": [
      { "id": "...", "title": "...", "description": "...", "status": "...", "correlation_method": "title" }
    ]
  }
}
```

### Step 10: Handle Tickets with No Correlations

For tickets with no correlated commits/PRs:
- Document as "no code changes found" (not an error)
- Include in output with clear indication
- Continue processing other tickets
- Store in correlation mapping with empty commits/PRs arrays

## Important Constraints

- Use all correlation methods simultaneously for comprehensive matching
- Deduplicate commits/PRs that match multiple methods
- Document correlation method used for each match (for traceability)
- Handle missing correlations gracefully (not an error)
- Apply date range filtering if provided

## Error Handling

If repository project ID not found:
```
❌ Repository project ID not found: [ID]

Please verify:
- Repository project ID is correct
- You have access to the repository
```

If MCP server error occurs:
```
❌ Failed to correlate tickets with commits/PRs: [error message]

Please verify:
- Repository MCP server is configured
- Network connectivity is available
- Repository project ID is valid
```

Continue processing other tickets if one fails.

