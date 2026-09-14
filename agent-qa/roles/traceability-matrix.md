# Traceability Matrix

You build the traceability matrix that links requirements to code changes, test cases, Gherkin
scenarios, Playwright specs, and other deliverables — whether that matrix lives inside a release
note or stands alone as a traceability report.

## When This Applies

Loaded by `generate-release-notes` phase 4, `generate-traceability-report` phase 2, and
`generate-test-cases` phase 4. Each caller supplies the requirements, code changes, test cases, and
other deliverables already loaded or discovered in its own earlier phases.

Two callers order these subsections differently:

When invoked by `generate-release-notes`: apply them in this order — Code Changes to Requirements,
Test Cases to Requirements, Code Changes to Test Cases, Full Requirement Traceability Matrix,
Artifact Links, Format Traceability Matrix as Markdown Table.

When invoked by `generate-traceability-report`: apply them in this order — Test Cases to
Requirements, Gherkin Scenarios to Requirements, Playwright Specs to Requirements, Other
Deliverables to Requirements, Cross-Deliverable Coverage Matrix, Identify Gaps.

## Code Changes to Requirements

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

## Test Cases to Requirements

When invoked by `generate-release-notes`:

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

When invoked by `generate-traceability-report`:

If `test-cases/` exists:
- Read each test case file
- Extract all test case IDs (`TC-{KEY}-{NNN}`)
- Map each test case to its requirement key
- Count test cases per requirement
- Note test case priorities (P1-P4)

Build: `requirement_key → [test_case_ids]`

## Test Case Coverage by Requirement

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

## Code Changes to Test Cases

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

## Gherkin Scenarios to Requirements

If `gherkin/` exists:
- Read each `.feature` file
- Extract feature file name (maps to requirement key)
- Count scenarios and scenario outlines per feature
- Extract tags

Build: `requirement_key → {feature_file, scenario_count, tags}`

## Playwright Specs to Requirements

If `playwright/` exists:
- Read each `.spec.ts` file
- Extract requirement key from filename
- Count test functions per spec
- List page objects referenced

Build: `requirement_key → {spec_file, test_count, page_objects}`

## Other Deliverables to Requirements

For each of: `test-strategy/`, `test-charter/`, `test-plan/`, `risk-register/`, `release-notes/`:
- Check if the deliverable exists
- Extract `source_requirements` from YAML front matter
- Note which requirements are covered

## Full Requirement Traceability Matrix

When invoked by `generate-release-notes`:

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

## Cross-Deliverable Coverage Matrix

When invoked by `generate-traceability-report`:

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

## Identify Gaps

When invoked by `generate-traceability-report`:

For each requirement:
1. **No test cases**: Requirement exists but no test cases generated
2. **No Gherkin**: Test cases exist but no `.feature` file (if `gherkin/` folder exists)
3. **No Playwright**: Test cases exist but no `.spec.ts` file (if `playwright/` folder exists)
4. **Orphaned test cases**: Test case IDs referencing requirement keys not in `requirements/`

## Artifact Links

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

## Format Traceability Matrix as Markdown Table

When invoked by `generate-release-notes`:

Format all traceability matrices as markdown tables:

- Use proper markdown table syntax
- Include headers and alignment
- Use status indicators (✅, ⚠️, ❌)
- Make tables readable and scannable

## What This Role Never Does

- Never fabricate a commit, PR, test case, or link that the loaded deliverables do not contain
- Never translate requirement content — deliverables stay in the source language
- Never flag a gap for a deliverable type that does not exist in the output folder
