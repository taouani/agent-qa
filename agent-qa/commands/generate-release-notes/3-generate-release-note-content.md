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

### Step 1: Generate Executive Summary

Create executive summary:

```markdown
## Executive Summary

This release includes [N] requirements, [M] code changes (commits/PRs), and [K] test cases.

**Key Highlights:**
- [Feature 1]: [Brief description]
- [Feature 2]: [Brief description]
- [Bug Fix]: [Brief description]

**Scope:**
- Requirements: [N] tickets
- Code Changes: [M] commits, [P] PRs/MRs
- Test Coverage: [K] test cases
- Affected Components: [List of components]
```

Include:
- High-level overview of release
- Key highlights (major features, bug fixes)
- Scope summary (requirements count, code changes count, test coverage)

### Step 2: Generate Requirements Summary

Generate requirements summary from Jira tickets:

```markdown
## Requirements Summary

### Requirements Overview
- **Total Requirements**: [N]
- **Requirements with Code Changes**: [M]
- **Requirements without Code Changes**: [K]

### Requirements Details

#### PROJ-123: [Requirement Summary]
- **Status**: [Status]
- **Assignee**: [Assignee]
- **Description**: [Brief description]
- **Acceptance Criteria**: [List of AC]
- **Code Changes**: [Link to commit analysis]
- **Test Cases**: [Link to test cases]

[Repeat for each requirement]
```

Include:
- Requirements overview statistics
- Individual requirement details
- Links to code changes and test cases
- Requirement status and assignee

### Step 3: Generate Code Changes Summary

Generate code changes summary from commits/PRs:

```markdown
## Code Changes Summary

### Code Changes Overview
- **Total Commits**: [N]
- **Total PRs/MRs**: [M]
- **Total Files Changed**: [K]
- **Total Lines Added**: [L]
- **Total Lines Removed**: [R]
- **Net Change**: [+/-N]

### Code Changes by Requirement

#### PROJ-123
- **Commits**: [N] commits
- **PRs/MRs**: [M] PRs/MRs
- **Files Changed**: [K] files
- **Summary**: [Brief summary of changes]
- **Link**: [Link to commit analysis file]

[Repeat for each requirement with code changes]
```

Include:
- Code changes overview statistics
- Code changes grouped by requirement
- Links to detailed commit analysis files
- Summary of changes per requirement

### Step 4: Include Test Coverage

If test cases available, include test coverage section:

```markdown
## Test Coverage

### Test Coverage Overview
- **Total Test Cases**: [N]
- **Test Cases by Requirement**: [M] requirements covered
- **Test Coverage**: [Percentage or ratio]

### Test Cases by Requirement

#### PROJ-123
- **Test Cases**: [N] test cases
- **Test Types**: [Positive, Negative, Edge Cases]
- **Link**: [Link to test cases file]

[Repeat for each requirement with test cases]
```

Include:
- Test coverage overview statistics
- Test cases grouped by requirement
- Links to test case files
- Test coverage metrics

### Step 5: Identify Affected Components

Identify affected components/modules from code changes:

```markdown
## Affected Components

### Components Overview
- **Total Components Affected**: [N]

### Components Details

#### Component: [Component Name]
- **Files Changed**: [List of files]
- **Changes Summary**: [Brief summary]
- **Requirements**: [List of related requirements]
- **Impact**: [High/Medium/Low]

[Repeat for each affected component]
```

Include:
- List of affected components/modules
- Files changed per component
- Related requirements per component
- Impact assessment per component

### Step 6: Generate Impact Analysis

Generate impact analysis based on requirements and code changes:

```markdown
## Impact Analysis

### Overall Impact Assessment
- **Risk Level**: [High/Medium/Low]
- **Affected Areas**: [List of areas]
- **Dependencies**: [List of dependencies]

### Impact by Requirement

#### PROJ-123
- **Impact Level**: [High/Medium/Low]
- **Affected Areas**: [List of areas]
- **Dependencies**: [List of dependencies]
- **Risk Factors**: [List of risk factors]

[Repeat for each requirement]
```

Include:
- Overall impact assessment
- Impact analysis per requirement
- Affected areas and dependencies
- Risk factors

### Step 7: Reference Existing Deliverables

Reference existing deliverables (test cases, test plans, strategies, charters):

```markdown
## Related Deliverables

### Test Deliverables
- **Test Cases**: [Link to test-cases folder]
- **Test Plans**: [Link to test-plan folder]
- **Test Strategies**: [Link to test-strategy folder]
- **Test Charters**: [Link to test-charter folder]
- **Risk Registers**: [Link to risk-register folder]

### Analysis Deliverables
- **Requirements Analysis**: [Link to requirements folder]
- **Commit Analysis**: [Link to commits folder]
```

Include:
- Links to all generated deliverables
- Brief description of each deliverable
- Organization by type (test deliverables, analysis deliverables)

### Step 8: Exclude Out-of-Scope Content

Ensure out-of-scope content is NOT included:
- ❌ Deployment notes
- ❌ Breaking changes documentation
- ❌ Migration requirements documentation
- ❌ Performance impacts documentation

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

