# PHASE 4: Generate Traceability Matrix

Generate comprehensive traceability matrix linking code changes (commits/PRs) to requirements (Jira tickets) and test cases.

## Core Responsibilities

1. **Link Code Changes to Requirements**: Create explicit references between commits/PRs and requirements
2. **Link Test Cases to Requirements**: Create traceability matrix for test cases
3. **Link Code Changes to Test Cases**: Show what code is covered by which tests
4. **Generate Full Traceability Matrix**: Create comprehensive traceability matrix/summary
5. **Include Links to Artifacts**: Include links to all related artifacts

## Workflow

### Step 1: Link Code Changes to Requirements

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

### Step 2: Link Test Cases to Requirements

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

### Step 3: Link Code Changes to Test Cases

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

### Step 4: Generate Full Requirement Traceability Matrix

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

### Step 5: Include Links to All Related Artifacts

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

### Step 6: Format Traceability Matrix as Markdown Table

Format all traceability matrices as markdown tables:

- Use proper markdown table syntax
- Include headers and alignment
- Use status indicators (✅, ⚠️, ❌)
- Make tables readable and scannable

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

