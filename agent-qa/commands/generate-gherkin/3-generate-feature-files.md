# Phase 3: Generate Feature Files

## Core Responsibilities

- Generate Gherkin `.feature` file content per requirement
- Apply proper indentation and formatting
- Include all tags, Background, Scenarios, and Scenario Outlines

## Workflow Steps

### Step 1: Generate the Feature Content

Apply `@agent-qa/roles/gherkin-authoring.md`, section `## Authoring Feature Content`, to the
scenario mapping from Phase 2, using the template loaded there.

### Step 2: Format and Indent

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

### Step 3: Validate Gherkin Syntax

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
