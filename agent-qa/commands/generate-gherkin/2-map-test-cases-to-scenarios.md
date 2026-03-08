# Phase 2: Map Test Cases to Scenarios

## Core Responsibilities

- Classify test steps as Given, When, or Then
- Identify shared preconditions for Background sections
- Determine Scenario vs Scenario Outline based on test data
- Group test cases into Features by requirement key

## Workflow Steps

### Step 1: Load Feature Template

Read the feature template from `agent-qa/formats/gherkin/feature-template.md` to apply mapping rules.

If the template is not found, use the default mapping rules described below.

### Step 2: Group Test Cases by Requirement

Organize test cases by their linked requirement key:

```
PROJ-123:
  - TC-PROJ-123-001 (P1)
  - TC-PROJ-123-002 (P2)
  - TC-PROJ-123-003 (P3)
PROJ-124:
  - TC-PROJ-124-001 (P1)
```

Each group will become one `.feature` file.

### Step 3: Identify Shared Preconditions

For each requirement group, analyze all test cases' prerequisites:

1. Collect all preconditions across test cases in the group
2. Find preconditions that appear in ALL test cases (or the vast majority)
3. These shared preconditions become the `Background` section
4. Remove shared preconditions from individual Scenarios

### Step 4: Classify Test Steps

For each test step in each test case, classify using verb pattern matching:

**Given (Context/Navigation):**
- Navigate, Open, Go to, Browse, Access
- Log in, Sign in, Authenticate
- Set, Configure, Ensure, Prerequisite
- Any step that establishes initial state

**When (Actions):**
- Enter, Input, Type, Fill
- Click, Press, Tap, Submit
- Select, Choose, Pick
- Upload, Download, Drag
- Search, Filter, Sort
- Check, Uncheck, Toggle
- Scroll, Expand, Collapse

**Then (Assertions):**
- Verify, Validate, Confirm
- Observe, Check (when verifying), Assert
- Ensure (when verifying outcome)
- See, Expect
- Should be, Should contain, Should display

**Ambiguous steps**: If a step verb is ambiguous, consider its position:
- Steps before any action → Given
- Steps that are actions → When
- Steps at the end verifying results → Then

### Step 5: Determine Scenario Type

For each test case:

- **Scenario**: Test case has a single set of test data values, or no data-driven aspect
- **Scenario Outline**: Test case has multiple data rows or explicitly tests multiple input variations

For Scenario Outline:
- Identify variable placeholders from the test data columns
- Map data values to the Examples table
- Replace concrete values in step text with `<variable>` placeholders

### Step 6: Map Priority Tags

Apply tag mapping per test case:

| Priority | Tags |
|----------|------|
| P1 Critical | `@critical @smoke` |
| P2 High | `@high` |
| P3 Medium | `@medium` |
| P4 Low | `@low` |

Additional tags:
- Add `@regression` if test case is flagged for regression suite
- Add `@{REQUIREMENT-KEY}` at the Feature level

## Data Storage

Store for subsequent phases:
- `features`: Map of requirement key → Feature structure containing:
  - Feature name and description (As a / I want / So that)
  - Background steps (if any)
  - List of Scenarios/Scenario Outlines with their steps and tags
- `tag_summary`: Count of tags used
- `step_classification_log`: Record of how steps were classified (for traceability)

## Constraints

- Do NOT write any files in this phase
- Preserve the original language of test step text
- Do NOT translate or rewrite test step content — only restructure into Gherkin format
