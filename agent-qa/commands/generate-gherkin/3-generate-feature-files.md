# Phase 3: Generate Feature Files

## Core Responsibilities

- Generate Gherkin `.feature` file content per requirement
- Apply proper indentation and formatting
- Include all tags, Background, Scenarios, and Scenario Outlines

## Workflow Steps

### Step 1: Generate Feature Content

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

### Step 2: Generate Scenarios

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

### Step 3: Format and Indent

Apply proper Gherkin formatting:

- Feature-level tags: no indentation
- `Feature:` keyword: no indentation
- Feature description (As a / I want / So that): 2 spaces
- `Background:` keyword: 2 spaces
- Background steps: 4 spaces
- Scenario-level tags: 2 spaces
- `Scenario:` / `Scenario Outline:` keyword: 2 spaces
- Scenario steps: 4 spaces
- `Examples:` keyword: 4 spaces
- Examples table: 6 spaces
- Blank line between Scenarios
- Blank line after Background

### Step 4: Validate Gherkin Syntax

For each generated `.feature` file content, verify:

1. Feature keyword is present exactly once
2. Every Scenario has at least one Given, When, or Then step
3. Scenario Outline has a matching Examples table
4. No duplicate Scenario names within a Feature
5. Tags are properly formatted (start with `@`, no spaces)
6. Proper use of `And` / `But` (only after Given/When/Then)

Report any validation warnings but do not block generation.

## Data Storage

Store for Phase 4:
- `feature_files`: Map of requirement key → generated `.feature` file content
- `validation_results`: Any warnings from syntax validation

## Constraints

- Write the content in the same language as the source test cases
- Do NOT add test steps that were not in the original test cases
- Preserve test data values exactly as they appear in the source
