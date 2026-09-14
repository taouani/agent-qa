# PHASE 4: Generate Traceability Matrix

Generate comprehensive traceability matrix linking code changes (commits/PRs) to requirements (Jira tickets) and test cases.

## Core Responsibilities

1. **Link Code Changes to Requirements**: Create explicit references between commits/PRs and requirements
2. **Link Test Cases to Requirements**: Create traceability matrix for test cases
3. **Link Code Changes to Test Cases**: Show what code is covered by which tests
4. **Generate Full Traceability Matrix**: Create comprehensive traceability matrix/summary
5. **Include Links to Artifacts**: Include links to all related artifacts

## Workflow

### Step 1: Generate Traceability Matrix

Apply `@agent-qa/roles/traceability-matrix.md` to the requirements, code changes, and test cases
loaded in Phase 2, and to any Gherkin, Playwright, or other deliverables present in the selected
output folder.

The role owns linking code changes to requirements, test cases to requirements, code changes to
test cases, the cross-deliverable coverage matrix, gap identification, the full requirement matrix,
artifact links, and markdown formatting. This phase owns what is supplied to it and where the
traceability matrix is written.

## Important Constraints

- Create comprehensive traceability linking all artifacts
- Format traceability matrices as markdown tables
- Include links to all related artifacts
- Show coverage status clearly
- Group traceability by requirement for clarity

## Error Handling

If traceability generation fails for a requirement:
- Log error with context
- Continue generating traceability for other requirements
- Document failed requirements in output

Continue processing despite individual failures.

