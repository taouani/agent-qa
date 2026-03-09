# Phase 4: Generate Test Data Files

## Core Responsibilities

Write test data files to the output folder.

## Workflow

### Step 1: Create Output Directory

Create `{selected_folder}/test-data/`

### Step 2: Generate Per-Entity Data Files

For each entity, write `{selected_folder}/test-data/{entity-name}-data.md`:

```markdown
---
type: test-data
generated: YYYY-MM-DD HH:MM
source_requirements:
  - {REQUIREMENT-KEY}
language: {detected-language}
version: "1.0"
---

# Test Data: {Entity Name}

## Entity Description

{Brief description of the entity and its context}

## Fields

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| email | string (email) | Yes | max 255 chars |
| password | string | Yes | 8-128 chars, uppercase + lowercase + number |
| role | enum | Yes | admin, user, viewer (default: user) |

## Valid Data

| ID | Description | email | password | role |
|----|-------------|-------|----------|------|
| VD-User-001 | Standard user | john.doe@example.com | SecurePass123! | user |
| VD-User-002 | Admin user | admin@company.org | AdminStr0ng!Pass | admin |

## Invalid Data

| ID | Description | Field | Value | Expected Error |
|----|-------------|-------|-------|---------------|
| ID-User-001 | Invalid email | email | not-an-email | Invalid email format |
| ID-User-002 | Short password | password | Ab1! | Min 8 characters |

## Boundary Data

| ID | Description | Field | Value | Expected |
|----|-------------|-------|-------|----------|
| BD-User-001 | Max length email | email | {255-char email} | Accepted |
| BD-User-002 | Over max email | email | {256-char email} | Rejected |

## Null/Empty Data

| ID | Description | Field | Value | Expected |
|----|-------------|-------|-------|----------|
| NE-User-001 | Empty email | email | (empty) | Required field |

## Security Data

| ID | Description | Field | Value | Expected |
|----|-------------|-------|-------|----------|
| SD-User-001 | SQL injection | email | '; DROP TABLE-- | Rejected/sanitized |
```

### Step 3: Generate Data Summary Index

Write `{selected_folder}/test-data/README.md`:

```markdown
---
type: test-data-index
generated: YYYY-MM-DD HH:MM
source_requirements:
  - {all requirement keys}
language: {majority_language}
version: "1.0"
---

# Test Data Specification

## Summary

| Entity | Fields | Valid Sets | Invalid Sets | Boundary Sets | Total |
|--------|--------|-----------|-------------|--------------|-------|
| User | 3 | 3 | 5 | 4 | 12 |
| Order | 5 | 4 | 8 | 6 | 18 |

## Data Files

- `user-data.md` — User entity test data
- `order-data.md` — Order entity test data

## Assumptions

{List of assumptions made about field constraints that were not explicit in requirements}
```

### Step 4: Update Output Index

Follow the instructions in `@agent-qa/commands/common/generate-output-index.md` to update the output folder README.md.

### Step 5: Execute Post-Generation Hooks

Follow the instructions in `@agent-qa/commands/common/execute-post-hooks.md` to run any configured post-generation hooks.

### Step 6: Present Results

```
Test data generation complete!

Output: {selected_folder}/test-data/
  - {entity_count} entities
  - {total_data_sets} data sets
  - {valid_count} valid, {invalid_count} invalid, {boundary_count} boundary

Files:
  - user-data.md (12 data sets)
  - order-data.md (18 data sets)
  - README.md (index)
```

## Constraints

- Write files ONLY to the `test-data/` subdirectory
- Do NOT modify existing deliverable files
- Follow output-standards.md for YAML front matter and markdown formatting
- Use specific, realistic values — not generic placeholders
- Include YAML front matter in all markdown files
