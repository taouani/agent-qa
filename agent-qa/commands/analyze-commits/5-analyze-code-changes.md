# PHASE 5: Analyze Code Changes

Analyze code changes to understand impact and context, generating summaries per file and overall summaries per commit/PR.

## Core Responsibilities

1. **Analyze Code Changes**: Analyze actual code changes to understand impact and context
2. **Generate File Summaries**: Generate summary of changes per file
3. **Generate Overall Summaries**: Generate overall change summary per commit/PR
4. **Store Analysis Results**: Store analysis results for future requirement analysis enhancement
5. **Format Diff Snippets**: Format code diff snippets for markdown output

## Workflow

### Step 1: Analyze the Code Changes

Apply `@agent-qa/roles/code-change-analysis.md` to the diffs extracted in Phase 4. Supply: the
per-file diffs, the commit and PR/MR metadata, and the ticket correlation from Phase 3.

### Step 2: Store Analysis Results for Future Enhancement

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

### Step 3: Format Code Diff Snippets for Markdown

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

