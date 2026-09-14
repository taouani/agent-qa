# PHASE 3: Generate Release Note Content

Generate release note content including executive summary, requirements summary, code changes summary, test coverage, affected components, and impact analysis.

## Core Responsibilities

1. **Generate Executive Summary**: Apply the release-notes-content role to create a high-level summary of the release
2. **Generate Requirements Summary**: Apply the role's craft to summarize requirements from Jira tickets
3. **Generate Code Changes Summary**: Apply the role's craft to summarize code changes from commits/PRs
4. **Include Test Coverage**: Apply the role's craft to include test cases generated (if available)
5. **Identify Affected Components**: Apply the role's craft to identify affected components/modules from code changes
6. **Generate Impact Analysis**: Apply the role's craft to generate impact analysis based on requirements and code changes
7. **Exclude Out-of-Scope Content**: Apply the role's scope-exclusion craft to exclude deployment notes, breaking changes, migration requirements, performance impacts

## Workflow

### Step 1: Generate Release Note Content

Apply `@agent-qa/roles/release-notes-content.md` to the requirements, code changes, test cases, and
other deliverables loaded in Phase 2.

The role owns the executive summary, requirements summary, code changes summary, test coverage,
affected components, impact analysis, deliverable references, and scope exclusions. This phase owns
what is supplied to it and where the release note content is written.

## Important Constraints

- The applied role generates comprehensive but concise content
- The applied role links to all related artifacts (requirements, commits, test cases)
- Group content by requirement for traceability
- The applied role excludes out-of-scope content (deployment, breaking changes, migration, performance)
- The applied role references existing deliverables with links

## Error Handling

If content generation fails for a requirement:
- Log error with context
- Continue generating content for other requirements
- Document failed requirements in output

Continue processing despite individual failures.

