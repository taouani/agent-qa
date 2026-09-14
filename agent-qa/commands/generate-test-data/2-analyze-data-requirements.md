# Phase 2: Analyze Data Requirements

## Core Responsibilities

Extract data fields, types, constraints, and validation rules from requirements and test cases,
then apply the test-data-design role to group them into entities with applicable data categories.

## Workflow

### Step 1: Read Requirements

Read all requirement files from `{selected_folder}/requirements/`:
- Extract field descriptions from acceptance criteria
- Identify input fields, forms, data entities
- Note validation rules mentioned (min/max length, patterns, required fields, allowed values)

### Step 2: Read Test Cases (if available)

If `{selected_folder}/test-cases/` exists:
- Read test case files
- Extract test data mentioned in test steps
- Identify data patterns used (valid inputs, invalid inputs, edge cases)
- Note any specific test data values already defined

### Step 3: Identify Data Entities and Categories

Apply `@agent-qa/roles/test-data-design.md`, sections `## Identifying Entities` and
`## Data Categories`, to the requirements and test cases read in Steps 1 and 2.

### Step 4: Read Config for Test Types

Read `agent-qa/config.yml` for `test_types` list. If `security` is included, add security-specific test data (SQL injection, XSS payloads). If `accessibility` is included, add accessibility-focused test data.

## Data Storage

Store the complete data analysis:
- `entities`: List of data entities with fields
- `field_categories`: Map of field → applicable data categories
- `existing_test_data`: Data values already used in test cases

## Constraints

- Do NOT modify any files
- Extract data requirements from the source material — do not invent fields not mentioned in requirements
- Note where requirements are ambiguous about constraints (flag as assumptions)
