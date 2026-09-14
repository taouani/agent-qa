# Gherkin Authoring

You turn mapped test cases into Gherkin scenarios, deciding how steps become Given/When/Then,
when a scenario should be an outline, and which tags apply.

## When This Applies

Loaded by `generate-gherkin` phase 2 (Map Test Cases to Scenarios) and phase 3 (Generate Feature
Files), after the feature template is loaded and test cases are grouped by requirement.

`agent-qa/formats/gherkin/feature-template.md` is authoritative for feature-file syntax and
layout — tag placement, keyword order, indentation, and the priority-to-tag mapping. Any
skeleton shown below is illustrative of the judgement being described, not a specification of
the file format. Where the two differ, the template wins.

## Step Classification

### Identify Shared Preconditions

For each requirement group, analyze all test cases' prerequisites:

1. Collect all preconditions across test cases in the group
2. Find preconditions that appear in ALL test cases (or the vast majority)
3. These shared preconditions become the `Background` section
4. Remove shared preconditions from individual Scenarios

### Classify Test Steps

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

## Scenario Types

### Determine Scenario Type

For each test case:

- **Scenario**: Test case has a single set of test data values, or no data-driven aspect
- **Scenario Outline**: Test case has multiple data rows or explicitly tests multiple input variations

For Scenario Outline:
- Identify variable placeholders from the test data columns
- Map data values to the Examples table
- Replace concrete values in step text with `<variable>` placeholders

## Tagging

### Map Priority Tags

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

## Authoring Feature Content

### Generate Feature Content

For each requirement key in the `features` map, generate a `.feature` file:

```gherkin
@{REQUIREMENT-KEY} @regression
Feature: {Requirement Summary}
  As a {user role}
  I want {objective}
  So that {business value}

  Background:
    Given {shared_precondition_1}
    And {shared_precondition_2}

  {scenarios}
```

#### Feature Header

- Tag line: `@{REQUIREMENT-KEY}` plus `@regression` if applicable
- Feature name: requirement summary
- User story format (As a / I want / So that):
  - Extract from the requirement description if available
  - If not available, derive from the requirement summary

#### Background Section

- Include only if shared preconditions were identified in Phase 2
- Use `Given` for the first step and `And` for subsequent steps
- Omit the Background section entirely if no shared preconditions exist

### Generate Scenarios

For each test case mapped to this feature:

#### Simple Scenario

```gherkin
  @{priority_tag}
  Scenario: {TC-ID} - {Test Case Summary}
    Given {precondition_step}
    And {additional_precondition}
    When {action_step}
    And {additional_action}
    Then {verification_step}
    And {additional_verification}
```

- Priority tag on its own line before the Scenario
- Scenario name includes test case ID and summary
- Use `And` for consecutive steps of the same type (Given/When/Then)
- Use `But` for negative assertions within a Then block

#### Scenario Outline

```gherkin
  @{priority_tag}
  Scenario Outline: {TC-ID} - {Test Case Summary}
    Given {step_with_<variable>}
    When {step_with_<variable>}
    Then {step_with_<variable>}

    Examples:
      | variable1 | variable2 | ... |
      | value1a   | value2a   | ... |
      | value1b   | value2b   | ... |
```

- Variable placeholders use angle brackets: `<variable_name>`
- Examples table header matches variable names
- Each row represents one test data combination

## What This Role Never Does

- Never translate or rewrite test step content — only restructure into Gherkin format
- Never add test steps that were not in the original test cases
- Never change test data values from how they appear in the source
