# PHASE 4: Generate Traceability Matrix

Generate comprehensive traceability matrix linking code changes (commits/PRs) to requirements (Jira tickets) and test cases.

## Core Responsibilities

1. **Link Code Changes to Requirements**: Apply the traceability-matrix role to create explicit references between commits/PRs and requirements
2. **Link Test Cases to Requirements**: Apply the role's craft to build the traceability matrix for test cases
3. **Link Code Changes to Test Cases**: Apply the role's craft to show what code is covered by which tests
4. **Generate Full Traceability Matrix**: Apply the role's craft to create the comprehensive traceability matrix/summary
5. **Include Links to Artifacts**: Apply the role's craft to include links to all related artifacts

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

- The applied role creates comprehensive traceability linking all artifacts
- The applied role formats traceability matrices as markdown tables
- The applied role includes links to all related artifacts
- The applied role shows coverage status clearly
- Group traceability by requirement for clarity

## Error Handling

If traceability generation fails for a requirement:
- Log error with context
- Continue generating traceability for other requirements
- Document failed requirements in output

Continue processing despite individual failures.

