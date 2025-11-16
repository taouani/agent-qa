# PHASE 5: Analyze Code Changes

Analyze code changes to understand impact and context, generating summaries per file and overall summaries per commit/PR.

## Core Responsibilities

1. **Analyze Code Changes**: Analyze actual code changes to understand impact and context
2. **Generate File Summaries**: Generate summary of changes per file
3. **Generate Overall Summaries**: Generate overall change summary per commit/PR
4. **Store Analysis Results**: Store analysis results for future requirement analysis enhancement
5. **Format Diff Snippets**: Format code diff snippets for markdown output

## Workflow

### Step 1: Analyze Code Changes

For each commit/PR, analyze the code changes:

1. **Understand Change Context**:
   - Analyze what functionality was added/modified/removed
   - Identify affected components/modules
   - Understand impact on existing codebase

2. **Identify Change Type**:
   - New feature addition
   - Bug fix
   - Refactoring
   - Configuration change
   - Test addition/modification
   - Documentation update

3. **Assess Change Impact**:
   - Identify affected areas
   - Assess risk level (high/medium/low)
   - Note dependencies or related changes

### Step 2: Generate Summary of Changes Per File

For each file changed in each commit/PR:

Generate summary:
```
File: src/components/Button.tsx
Changes:
- Added icon prop and icon rendering
- Updated button styling to accommodate icon
- Modified onClick handler to include icon click handling

Lines: +15, -8, net: +7
```

Include:
- File path
- Summary of changes (what was changed and why)
- Lines added/removed statistics
- Change type (addition, modification, deletion)

### Step 3: Generate Overall Change Summary Per Commit/PR

For each commit/PR, generate overall summary:

```
Commit: abc123def456
Author: John Doe
Date: 2025-01-15
Message: PROJ-123: Add icon support to Button component

Summary:
- Added icon prop to Button component
- Updated Button component styling
- Added icon click handling
- Updated Button tests

Files Changed: 3
Lines Added: 45
Lines Removed: 12
Net Change: +33

Affected Components:
- Button component
- Button tests
- Icon component (dependency)
```

Include:
- Commit/PR metadata (hash/ID, author, date, message/title)
- Overall summary of changes
- Statistics (files changed, lines added/removed, net change)
- Affected components/modules
- Change type and impact assessment

### Step 4: Store Analysis Results for Future Enhancement

Store analysis results in structured format for future requirement analysis enhancement:

```
{
  "commit_hash": "abc123def456",
  "jira_ticket": "PROJ-123",
  "analysis": {
    "change_type": "feature_addition",
    "impact_level": "medium",
    "affected_components": ["Button", "Icon"],
    "summary": "...",
    "file_summaries": [...],
    "diff_snippets": [...]
  }
}
```

### Step 5: Format Code Diff Snippets for Markdown

Format code diff snippets for markdown output:

- Use markdown code blocks with diff syntax highlighting
- Include file path in diff header
- Preserve line numbers if available
- Format added lines with `+` prefix
- Format removed lines with `-` prefix
- Include context lines (unchanged lines) for better understanding

**Example Format:**
````markdown
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
````

### Step 6: Group Analysis by Jira Ticket

Group all analysis results by Jira ticket:
- Combine all commits/PRs for each ticket
- Aggregate statistics per ticket
- Create ticket-level summary

## Important Constraints

- Analyze actual code changes (not just metadata)
- Generate meaningful summaries that explain what changed and why
- Store analysis results for future requirement analysis enhancement
- Format diff snippets properly for markdown output
- Group analysis by Jira ticket for traceability

## Error Handling

If analysis fails for a commit/PR:
- Log error with context
- Continue processing other commits/PRs
- Document failed analysis in output

Continue processing despite individual failures.

