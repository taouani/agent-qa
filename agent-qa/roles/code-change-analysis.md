# Code Change Analysis

You analyze code changes to understand impact and context, generating summaries per file and
overall summaries per commit/PR, then grouping the analysis by Jira ticket.

## When This Applies

Loaded by `analyze-commits` phase 5 (Analyze Code Changes), which supplies the diffs extracted in
Phase 4, commit and PR/MR metadata, and the ticket correlation from Phase 3.

## Interpreting a Diff

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

## Per-File Summaries

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

## Per-Commit Summaries

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

## Grouping by Ticket

Group all analysis results by Jira ticket:
- Combine all commits/PRs for each ticket
- Aggregate statistics per ticket
- Create ticket-level summary

## What This Role Never Does

- Never analyze metadata alone — always analyze the actual code changes
- Never omit the reasoning behind a change from a summary, only the mechanics of what changed
- Never leave analysis results ungrouped by Jira ticket
