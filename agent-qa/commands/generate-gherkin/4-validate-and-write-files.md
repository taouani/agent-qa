# Phase 4: Validate and Write Files

## Core Responsibilities

- Write `.feature` files to the gherkin output directory
- Generate a gherkin index (README.md)
- Generate a traceability report

## Workflow Steps

### Step 1: Create Output Directory

Create the gherkin output directory:

```
{selected_folder}/gherkin/
```

Example: `agent-qa/2025-01-16-PROJ-123/gherkin/`

### Step 2: Write Feature Files

For each feature file in `feature_files`:

1. Write the `.feature` file:
   - File name: `{REQUIREMENT-KEY}.feature` (e.g., `PROJ-123.feature`)
   - Content: the generated Gherkin content from Phase 3
   - Encoding: UTF-8

2. Log each file written:
   - File name, number of scenarios, number of steps

### Step 3: Generate Gherkin Index

Create `{selected_folder}/gherkin/README.md`:

```markdown
---
type: gherkin-index
generated: YYYY-MM-DD HH:MM
source_folder: {selected_folder}
---

# Gherkin Feature Files

## Summary

- **Total Features**: {feature_count}
- **Total Scenarios**: {scenario_count}
- **Total Scenario Outlines**: {outline_count}
- **Source Test Cases**: {test_case_count}

## Features

| Feature File | Requirement | Scenarios | Tags |
|-------------|-------------|-----------|------|
| PROJ-123.feature | PROJ-123 | 5 | @critical, @regression |
| PROJ-124.feature | PROJ-124 | 3 | @high |

## Tag Distribution

| Tag | Count |
|-----|-------|
| @critical | {count} |
| @smoke | {count} |
| @high | {count} |
| @medium | {count} |
| @low | {count} |
| @regression | {count} |
```

### Step 4: Generate Traceability Report

Create a traceability section within the README or as a separate note showing the mapping:

```markdown
## Traceability

| Test Case ID | Scenario | Feature File | Type |
|-------------|----------|-------------|------|
| TC-PROJ-123-001 | Successful login | PROJ-123.feature | Scenario |
| TC-PROJ-123-002 | Login with invalid password | PROJ-123.feature | Scenario |
| TC-PROJ-123-005 | Login with various roles | PROJ-123.feature | Scenario Outline |
```

### Step 5: Present Results

Present a summary to the user:

```
Gherkin generation complete!

Output: {selected_folder}/gherkin/
  - {feature_count} feature files
  - {scenario_count} scenarios
  - {outline_count} scenario outlines

Files:
  - PROJ-123.feature (5 scenarios)
  - PROJ-124.feature (3 scenarios)
  - README.md (index)

{validation_warnings if any}
```

### Step 6: Generate Output Index

Follow the instructions in `@agent-qa/commands/common/generate-output-index.md` to generate or update the `README.md` index file in the output folder.

### Step 7: Execute Post-Generation Hooks

Follow the instructions in `@agent-qa/commands/common/execute-post-hooks.md` to run any configured post-generation hooks.

## Constraints

- Write files ONLY to the `gherkin/` subdirectory of the selected output folder
- Do NOT modify existing test case files
- Do NOT modify files outside the gherkin directory
- Include YAML front matter in the README.md
