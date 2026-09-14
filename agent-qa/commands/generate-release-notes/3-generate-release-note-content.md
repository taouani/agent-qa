# PHASE 3: Generate Release Note Content

Generate release note content including executive summary, requirements summary, code changes summary, test coverage, affected components, and impact analysis.

## Core Responsibilities

1. **Generate Executive Summary**: Create high-level summary of the release
2. **Generate Requirements Summary**: Summarize requirements from Jira tickets
3. **Generate Code Changes Summary**: Summarize code changes from commits/PRs
4. **Include Test Coverage**: Include test cases generated (if available)
5. **Identify Affected Components**: Identify affected components/modules from code changes
6. **Generate Impact Analysis**: Generate impact analysis based on requirements and code changes
7. **Exclude Out-of-Scope Content**: Exclude deployment notes, breaking changes, migration requirements, performance impacts

## Workflow

### Step 1: Generate Release Note Content

Apply `@agent-qa/roles/release-notes-content.md` to the requirements, code changes, test cases, and
other deliverables loaded in Phase 2.

The role owns the executive summary, requirements summary, code changes summary, test coverage,
affected components, impact analysis, deliverable references, and scope exclusions. This phase owns
what is supplied to it and where the release note content is written.

## Important Constraints

- Generate comprehensive but concise content
- Link to all related artifacts (requirements, commits, test cases)
- Group content by requirement for traceability
- Exclude out-of-scope content (deployment, breaking changes, migration, performance)
- Reference existing deliverables with links

## Error Handling

If content generation fails for a requirement:
- Log error with context
- Continue generating content for other requirements
- Document failed requirements in output

Continue processing despite individual failures.

