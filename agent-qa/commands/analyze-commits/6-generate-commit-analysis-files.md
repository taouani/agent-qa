# PHASE 6: Generate Commit Analysis Files

Generate markdown files with code change analysis, correlation mappings, and summaries.

## Core Responsibilities

1. **Create Markdown Files**: Create markdown files with code change analysis
2. **Include Correlation Mapping**: Include Jira ticket → commits/PRs mapping
3. **Include Code Diff Snippets**: Include code diff snippets in formatted markdown code blocks
4. **Include Change Summaries**: Include change summaries per file and overall
5. **Include Metadata**: Include commit and PR/MR metadata
6. **Group by Jira Ticket**: Group analysis by Jira ticket
7. **Create Summary Index**: Create summary index file

## Workflow

### Step 1: Determine File Structure

Create file structure:
- One file per Jira ticket: `{JIRA-KEY}-commits.md`
- Summary index file: `commits-index.md`
- Store in: `agent-qa/YYYY-MM-DD-{folder-name}/commits/`

### Step 2: Generate Individual Ticket Files

For each Jira ticket with correlated commits/PRs:

Create file: `{JIRA-KEY}-commits.md`

**File Structure:**
```markdown
# Commit Analysis: {JIRA-KEY}

## Ticket Information
- **Key**: {JIRA-KEY}
- **Summary**: {ticket summary}
- **Status**: {ticket status}
- **Assignee**: {assignee}

## Correlation Summary
- **Total Commits**: {count}
- **Total PRs/MRs**: {count}
- **Correlation Methods**: {methods used}

## Commits

### Commit: {commit hash}
- **Author**: {author}
- **Date**: {date}
- **Message**: {message}
- **Files Changed**: {count}
- **Lines Added**: {count}
- **Lines Removed**: {count}

#### Summary
{overall change summary}

#### Files Changed
{list of files with summaries}

#### Code Changes
{diff snippets}

## Pull Requests / Merge Requests

### PR/MR: {PR/MR ID}
- **Title**: {title}
- **Status**: {status}
- **Merged**: {merge date}
- **Link**: {link}
- **Files Changed**: {count}
- **Lines Added**: {count}
- **Lines Removed**: {count}

#### Summary
{overall change summary}

#### Files Changed
{list of files with summaries}

#### Code Changes
{diff snippets}
```

### Step 3: Handle Tickets with No Correlations

For tickets with no correlated commits/PRs:

Create file: `{JIRA-KEY}-commits.md`

**File Structure:**
```markdown
# Commit Analysis: {JIRA-KEY}

## Ticket Information
- **Key**: {JIRA-KEY}
- **Summary**: {ticket summary}
- **Status**: {ticket status}

## Code Changes
⚠️ **No code changes found**

No commits or pull requests/merge requests were found correlated with this Jira ticket.

This could mean:
- Code changes have not been committed yet
- Code changes are in a different repository
- Jira ticket key was not referenced in commits/PRs
```

### Step 4: Create Summary Index File

Create `commits-index.md`:

**File Structure:**
```markdown
# Commit Analysis Index

**Analysis Date**: {date}
**Input**: {input type and value}
**Repository Platform**: {platform}
**Repository Project ID**: {project ID}
**Date Range**: {date range if provided}

## Summary Statistics
- **Total Tickets Analyzed**: {count}
- **Tickets with Code Changes**: {count}
- **Tickets without Code Changes**: {count}
- **Total Commits Found**: {count}
- **Total PRs/MRs Found**: {count}
- **Total Files Changed**: {count}
- **Total Lines Added**: {count}
- **Total Lines Removed**: {count}

## Tickets with Code Changes
{list of tickets with links to individual files}

## Tickets without Code Changes
{list of tickets with no correlations}
```

### Step 5: Format Code Diff Snippets

Include code diff snippets in markdown code blocks:

````markdown
#### Code Changes: {file_path}

```diff
--- a/{file_path}
+++ b/{file_path}
@@ -10,6 +10,8 @@
     className="btn-primary"
     onClick={onClick}
   >
+    <span className="icon">{icon}</span>
     {label}
   </button>
 );
```
````

### Step 6: Include Correlation Mapping

Include correlation mapping showing which commits/PRs were found for each ticket:

```markdown
## Correlation Details

### Correlation Methods Used
- Branch name matching
- Commit message search
- PR/MR title search
- PR/MR description search
- PR/MR labels search
- PR/MR custom fields search

### Commits Found
{list of commits with correlation method}

### PRs/MRs Found
{list of PRs/MRs with correlation method}
```

### Step 7: Include Commit Metadata

For each commit, include:
- Commit hash
- Author name and email
- Commit date
- Commit message
- Files changed count
- Lines added/removed statistics

### Step 8: Include PR/MR Metadata

For each PR/MR, include:
- PR/MR ID
- Title
- Description (summary)
- Status (open, merged, closed)
- Merge date (if merged)
- Link to PR/MR
- Files changed count
- Lines added/removed statistics

### Step 9: Write Files to Output Folder

Write all generated files to:
`agent-qa/YYYY-MM-DD-{folder-name}/commits/`

Ensure folder exists before writing files.

### Step 10: Output Confirmation

If file generation is successful, output:

```
✅ Commit analysis files generated:
   - {count} ticket analysis files
   - 1 summary index file
   - Location: agent-qa/YYYY-MM-DD-{folder-name}/commits/
```

## Important Constraints

- Follow agent-os markdown formatting standards
- Group analysis by Jira ticket
- Include all correlation mappings
- Format diff snippets properly in markdown code blocks
- Include comprehensive metadata
- Create summary index file
- Handle tickets with no correlations gracefully

## Error Handling

If file writing fails:
- Log error with context
- Continue writing other files
- Document failed files in output

Continue processing despite individual failures.

