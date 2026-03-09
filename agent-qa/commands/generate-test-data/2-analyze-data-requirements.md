# Phase 2: Analyze Data Requirements

## Core Responsibilities

Extract data fields, types, constraints, and validation rules from requirements and test cases.

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

### Step 3: Identify Data Entities

Group extracted fields into data entities:

```
entities:
  - name: "User"
    fields:
      - name: "email"
        type: "string"
        format: "email"
        constraints: {required: true, max_length: 255}
      - name: "password"
        type: "string"
        constraints: {required: true, min_length: 8, max_length: 128, pattern: "must contain uppercase, lowercase, number"}
      - name: "role"
        type: "enum"
        values: ["admin", "user", "viewer"]
        constraints: {required: true, default: "user"}
```

### Step 4: Identify Data Categories

For each field, determine which data categories apply:

| Category | Description | Example |
|----------|-------------|---------|
| Valid | Standard valid values | `"user@example.com"` |
| Invalid | Values that should be rejected | `"not-an-email"` |
| Boundary | Edge of valid range | `""` (empty), max length string |
| Null/Empty | Missing or empty values | `null`, `""`, `undefined` |
| Special Characters | Unicode, injection attempts | `"user@例え.jp"`, `"'; DROP TABLE--"` |
| Format | Correct/incorrect format | `"user@.com"`, `"user@domain"` |

### Step 5: Read Config for Test Types

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
