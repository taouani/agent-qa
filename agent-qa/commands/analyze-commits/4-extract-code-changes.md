# PHASE 4: Extract Code Changes

Extract code changes (file paths, lines changed, diff snippets) from correlated commits and pull requests/merge requests.

## Core Responsibilities

1. **Retrieve Commits**: Get commit details for each correlated commit
2. **Retrieve PRs/MRs**: Get PR/MR details and diffs for each correlated PR/MR
3. **Extract File Changes**: Extract file paths, lines added/removed per file
4. **Extract Diff Snippets**: Extract actual code diff snippets (not just metadata)
5. **Handle Pagination**: Handle pagination for large commit histories
6. **Apply Date Range Filtering**: Apply date range filtering if provided

## Workflow

### Step 1: Retrieve Commit Details

For each commit in correlation mapping:

**Platform-Specific Implementation:**

- **GitLab**:
  - Use `mcp_gitlab_search_commits` to get commit details
  - Retrieve commit hash, author, date, message
  - Use `mcp_gitlab_get_branch_diffs` to get diff for commit

- **GitHub**:
  - Use GitHub MCP tools to get commit details
  - Retrieve commit hash, author, date, message
  - Use GitHub MCP tools to get diff for commit

- **Azure DevOps**:
  - Use Azure DevOps MCP tools to get commit details
  - Retrieve commit hash, author, date, message
  - Use Azure DevOps MCP tools to get diff for commit

### Step 2: Retrieve PR/MR Details and Diffs

For each PR/MR in correlation mapping:

**Platform-Specific Implementation:**

- **GitLab**:
  - Use `mcp_gitlab_get_merge_request` to get MR details
  - Use `mcp_gitlab_get_merge_request_diffs` or `mcp_gitlab_get_branch_diffs` to get diff
  - Retrieve MR title, description, status, merge date, links

- **GitHub**:
  - Use GitHub MCP tools to get PR details
  - Use GitHub MCP tools to get PR diff
  - Retrieve PR title, description, status, merge date, links

- **Azure DevOps**:
  - Use Azure DevOps MCP tools to get PR details
  - Use Azure DevOps MCP tools to get PR diff
  - Retrieve PR title, description, status, merge date, links

### Step 3: Extract File Paths Changed

For each commit/PR:
- Extract list of file paths changed
- Store file paths with commit/PR metadata
- Track unique file paths across all commits/PRs

### Step 4: Extract Lines Added/Removed Per File

For each file in each commit/PR:
- Extract lines added count
- Extract lines removed count
- Store per-file statistics:
  ```
  {
    "file_path": "src/components/Button.tsx",
    "lines_added": 15,
    "lines_removed": 8,
    "net_change": 7
  }
  ```

### Step 5: Extract Code Diff Snippets

For each file in each commit/PR:
- Extract actual code diff snippets (not just metadata)
- Include both added and removed code lines
- Store diff snippets with context (surrounding lines if available)
- Format diff snippets for markdown output (use code blocks with diff syntax)

**Diff Format:**
```diff
--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -10,6 +10,8 @@ export const Button = ({ label, onClick }) => {
     className="btn-primary"
     onClick={onClick}
   >
+    <span className="icon">{icon}</span>
     {label}
   </button>
 );
```

### Step 6: Handle Pagination

For large commit histories:
- Check if more commits/PRs are available
- Continue retrieving until all commits/PRs processed
- Track progress to avoid infinite loops

### Step 7: Apply Date Range Filtering

If date range provided in Phase 1:
- Filter commits by commit date (within date range)
- Filter PRs/MRs by creation/merge date (within date range)
- Only include commits/PRs within date range

### Step 8: Process All Commits

Process all commits (no exclusions):
- Include merge commits
- Include revert commits
- Include all commit types
- Process both individual commits and PRs/MRs

### Step 9: Store Code Changes in Memory

Store extracted code changes in memory:
- Store per-commit/PR code changes
- Store per-file code changes
- Store diff snippets
- Store statistics (lines added/removed, files changed)
- Structure data for analysis phase

## Important Constraints

- Extract actual code diff snippets (not just metadata)
- Process all commits (no exclusions for merge/revert commits)
- Handle pagination for large commit histories
- Apply date range filtering if provided
- Store diff snippets formatted for markdown output

## Error Handling

If commit/PR retrieval fails:
- Log error with context (commit hash, PR ID)
- Continue processing other commits/PRs
- Document failed commits/PRs in output

If diff extraction fails:
- Log error with context (file path, commit/PR)
- Continue processing other files
- Document failed files in output

Continue processing despite individual failures.

