# Release Reporting

You write the narrative content of a release note and you build the traceability matrix that links
requirements to code changes, test cases, and other deliverables — whether that matrix lives inside
a release note or stands alone as a traceability report.

## When This Applies

Loaded by `generate-release-notes` phase 3 for `## Release Note Content`; by `generate-release-notes`
phase 4, `generate-traceability-report` phase 2, and `generate-test-cases` phase 4 for
`## Traceability Matrix`. Each caller supplies the requirements, code changes, test cases, and other
deliverables already loaded or discovered in its own earlier phases.

## Release Note Content

### Executive Summary

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

### Requirements Summary

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

### Code Changes Summary

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

### Test Coverage

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

### Affected Components

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

### Impact Analysis

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

### Reference Existing Deliverables

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

### Exclude Out-of-Scope Content

Ensure out-of-scope content is NOT included:
- ❌ Deployment notes
- ❌ Breaking changes documentation
- ❌ Migration requirements documentation
- ❌ Performance impacts documentation

## Traceability Matrix

### Code Changes to Requirements

Create mapping between code changes and requirements:

```markdown
## Code Changes to Requirements Traceability

| Requirement | Commits | PRs/MRs | Files Changed | Status |
|-------------|---------|---------|---------------|--------|
| PROJ-123 | [N] commits | [M] PRs | [K] files | ✅ Complete |
| PROJ-124 | [N] commits | [M] PRs | [K] files | ✅ Complete |
| PROJ-125 | - | - | - | ⚠️ No code changes |

### Detailed Mapping

#### PROJ-123
- **Commits**:
  - `abc123def` - [Commit message] - [Link to commit]
  - `def456ghi` - [Commit message] - [Link to commit]
- **PRs/MRs**:
  - PR #123 - [PR title] - [Link to PR]
  - MR #456 - [MR title] - [Link to MR]
- **Files Changed**: [List of files with links]
```

Include:
- Summary table showing code changes per requirement
- Detailed mapping with commit/PR links
- Status indicators (Complete, No code changes)

### Test Cases to Requirements

Create traceability matrix for test cases:

```markdown
## Test Cases to Requirements Traceability

| Requirement | Test Cases | Coverage | Status |
|-------------|------------|----------|--------|
| PROJ-123 | TC-001, TC-002, TC-003 | 3 test cases | ✅ Covered |
| PROJ-124 | TC-004, TC-005 | 2 test cases | ✅ Covered |
| PROJ-125 | - | - | ⚠️ No test cases |

### Detailed Mapping

#### PROJ-123
- **Test Cases**:
  - TC-001: [Test case summary] - [Link to test case]
  - TC-002: [Test case summary] - [Link to test case]
  - TC-003: [Test case summary] - [Link to test case]
- **Test Types**: Positive (2), Negative (1), Edge Cases (0)
- **Coverage**: [Coverage percentage or ratio]
```

Include:
- Summary table showing test cases per requirement
- Detailed mapping with test case links
- Test type breakdown (positive, negative, edge cases)
- Coverage metrics

If `test-cases/` exists:
- Read each test case file
- Extract all test case IDs (`TC-{KEY}-{NNN}`)
- Map each test case to its requirement key
- Count test cases per requirement
- Note test case priorities (P1-P4)

Build: `requirement_key → [test_case_ids]`

### Test Case Coverage by Requirement

Create `test-cases-traceability-matrix.md`:

**Coverage Matrix**:
| Requirement Key | Total Tests | Positive | Negative | Edge Cases | Coverage % |
|----------------|-------------|----------|----------|------------|------------|
| PROJ-123 | 8 | 3 | 3 | 2 | 100% |
| PROJ-124 | 6 | 2 | 2 | 2 | 95% |

**Coverage Analysis**:
- Requirements coverage: X/Y requirements covered (Z%)
- Acceptance criteria coverage: X/Y AC items covered (Z%)
- Gap analysis: Identify missing coverage areas

### Code Changes to Test Cases

Show what code is covered by which tests:

```markdown
## Code Changes to Test Cases Traceability

| Code Change | Test Cases | Coverage Status |
|-------------|------------|-----------------|
| Commit: abc123def | TC-001, TC-002 | ✅ Covered |
| PR #123 | TC-003, TC-004 | ✅ Covered |
| Commit: def456ghi | - | ⚠️ Not covered |

### Detailed Mapping

#### Commit: abc123def
- **Files Changed**: [List of files]
- **Test Cases**:
  - TC-001: [Test case summary] - Tests [specific functionality]
  - TC-002: [Test case summary] - Tests [specific functionality]
- **Coverage**: [Coverage details]

#### PR #123
- **Files Changed**: [List of files]
- **Test Cases**:
  - TC-003: [Test case summary] - Tests [specific functionality]
  - TC-004: [Test case summary] - Tests [specific functionality]
- **Coverage**: [Coverage details]
```

Include:
- Summary table showing test coverage per code change
- Detailed mapping with test case links
- Coverage status indicators
- Coverage details per code change

### Gherkin Scenarios to Requirements

If `gherkin/` exists:
- Read each `.feature` file
- Extract feature file name (maps to requirement key)
- Count scenarios and scenario outlines per feature
- Extract tags

Build: `requirement_key → {feature_file, scenario_count, tags}`

### Playwright Specs to Requirements

If `playwright/` exists:
- Read each `.spec.ts` file
- Extract requirement key from filename
- Count test functions per spec
- List page objects referenced

Build: `requirement_key → {spec_file, test_count, page_objects}`

### Other Deliverables to Requirements

For each of: `test-strategy/`, `test-charter/`, `test-plan/`, `risk-register/`, `release-notes/`:
- Check if the deliverable exists
- Extract `source_requirements` from YAML front matter
- Note which requirements are covered

### Full Requirement Traceability Matrix

Create comprehensive traceability matrix:

```markdown
## Full Requirement Traceability Matrix

| Requirement | Code Changes | Test Cases | Coverage | Status |
|-------------|--------------|------------|----------|--------|
| PROJ-123 | ✅ [N] commits, [M] PRs | ✅ [K] test cases | [X]% | ✅ Complete |
| PROJ-124 | ✅ [N] commits, [M] PRs | ✅ [K] test cases | [X]% | ✅ Complete |
| PROJ-125 | ⚠️ No code changes | ⚠️ No test cases | 0% | ⚠️ Incomplete |

### Traceability Summary
- **Total Requirements**: [N]
- **Requirements with Code Changes**: [M]
- **Requirements with Test Cases**: [K]
- **Requirements Fully Traced**: [L]
- **Requirements Partially Traced**: [P]
- **Requirements Not Traced**: [Q]
```

Include:
- Comprehensive matrix showing all traceability links
- Status indicators (Complete, Incomplete, Not traced)
- Traceability summary statistics

### Cross-Deliverable Coverage Matrix

Combine all mappings into a single matrix:

```
requirement_key → {
  requirement: {file, title, language},
  test_cases: {count, ids, priorities},
  gherkin: {file, scenarios, tags},
  playwright: {file, tests, page_objects},
  test_strategy: true/false,
  test_charter: true/false,
  test_plan: true/false,
  risk_register: true/false,
  release_notes: true/false
}
```

### Identify Gaps

For each requirement:
1. **No test cases**: Requirement exists but no test cases generated
2. **No Gherkin**: Test cases exist but no `.feature` file (if `gherkin/` folder exists)
3. **No Playwright**: Test cases exist but no `.spec.ts` file (if `playwright/` folder exists)
4. **Orphaned test cases**: Test case IDs referencing requirement keys not in `requirements/`

### Artifact Links

Include links to all related artifacts:

```markdown
## Artifact Links

### Requirements
- [Requirements Index](requirements/requirements-index.md)
- [PROJ-123 Requirement](requirements/PROJ-123-requirement.md)
- [PROJ-124 Requirement](requirements/PROJ-124-requirement.md)

### Code Changes
- [Commits Index](commits/commits-index.md)
- [PROJ-123 Commits](commits/PROJ-123-commits.md)
- [PROJ-124 Commits](commits/PROJ-124-commits.md)

### Test Cases
- [Test Cases Index](test-cases/test-cases-index.md)
- [PROJ-123 Test Cases](test-cases/PROJ-123-test-cases.md)
- [PROJ-124 Test Cases](test-cases/PROJ-124-test-cases.md)

### Test Plans
- [Test Plan Index](test-plan/test-plan-index.md)
- [Release Test Plan](test-plan/release-test-plan.md)

### Test Strategies
- [Test Strategy Index](test-strategy/test-strategy-index.md)
- [Release Test Strategy](test-strategy/release-test-strategy.md)
```

Include:
- Links to all requirements files
- Links to all commit analysis files
- Links to all test case files
- Links to test plans, strategies, charters, risk registers

### Format Traceability Matrix as Markdown Table

Format all traceability matrices as markdown tables:

- Use proper markdown table syntax
- Include headers and alignment
- Use status indicators (✅, ⚠️, ❌)
- Make tables readable and scannable

## What This Role Never Does

- Never fabricate a commit, PR, test case, or link that the loaded deliverables do not contain
- Never include out-of-scope content (deployment notes, breaking changes, migration, performance)
- Never translate requirement content — deliverables stay in the source language
- Never flag a gap for a deliverable type that does not exist in the output folder
