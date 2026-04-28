# Phase 3: Generate Validation Report

## Core Responsibilities

Present validation results as a clear, actionable report to the user.

## Workflow

### Step 1: Calculate Summary Statistics

From the validation results collected in Phase 2:

- **Total files checked**: Count of all files validated
- **Total checks run**: Count of all individual validation checks
- **Passed**: Count of checks with PASS status
- **Failed**: Count of checks with FAIL status
- **Warnings**: Count of checks with WARN status
- **Pass rate**: (Passed / Total checks) * 100

### Step 2: Display Summary

```
Validation Report: {selected_folder}
=====================================

Summary:
  Files checked:    {total_files}
  Checks run:       {total_checks}
  Passed:           {passed} ({pass_rate}%)
  Failed:           {failed}
  Warnings:         {warnings}

Overall Status:     {ALL PASSED | N FAILURE(S) | N WARNING(S)}
```

### Step 3: Display Failures (if any)

Group failures by validation rule:

```
Failures:

  YAML Front Matter:
    - requirements/PROJ-123.md: Missing field "language"
    - test-cases/PROJ-124-test-cases.md: Invalid type value "test_cases" (expected "test-cases")

  File Naming:
    - test-cases/proj123-tests.md: Does not match pattern "{REQUIREMENT-KEY}-test-cases.md"

  CSV Format:
    - test-cases/PROJ-123-test-cases.csv: Row 5 — Missing column "Labels"
    - test-cases/PROJ-123-test-cases.csv: Row 8 — Priority "High Priority" not in allowed values

  Test Case IDs:
    - Duplicate ID: TC-PROJ-123-003 found in both PROJ-123-test-cases.md and PROJ-124-test-cases.md

  Cross-Deliverable Consistency:
    - gherkin/: Missing .feature file for PROJ-124 (test cases exist)
```

### Step 4: Display Warnings (if any)

```
Warnings:

  - test-cases/notes.txt: Unexpected file in test-cases/ directory
  - playwright/: No spec files found for PROJ-125 (test cases exist but may be API-only)
```

### Step 5: Provide Recommendations

Based on failures, provide actionable recommendations:

```
Recommendations:

  1. Add missing "language" field to YAML front matter in 2 files
  2. Rename 1 file to match naming conventions
  3. Fix CSV formatting issues in 1 file (2 rows affected)
  4. Generate missing Gherkin feature file for PROJ-124
```

## Constraints

- Do NOT modify any files — report only
- Group issues by category for readability
- Include file paths and specific details for every failure
- If everything passes, display a success message and skip the Failures/Warnings sections
