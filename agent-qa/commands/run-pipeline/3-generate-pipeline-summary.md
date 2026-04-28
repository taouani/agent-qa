# Phase 3: Generate Pipeline Summary

## Core Responsibilities

Display a final summary of the pipeline execution.

## Workflow

### Step 1: Display Pipeline Results

```
Pipeline Execution Summary
===========================

Output Folder: {output_folder}

Results:
  [1/6] analyze-requirements ........... SUCCESS (3 files)
  [2/6] generate-test-charter .......... SUCCESS (1 file)
  [3/6] generate-test-strategy ......... SUCCESS (1 file)
  [4/6] generate-test-cases ............ SUCCESS (4 files)
  [5/6] generate-test-plan ............. SUCCESS (1 file)
  [6/6] generate-risk-register ......... SUCCESS (1 file)

Total: 6/6 commands succeeded
Files generated: 11
```

If there were failures:
```
Results:
  [1/4] analyze-requirements ........... SUCCESS (3 files)
  [2/4] generate-test-cases ............ SUCCESS (4 files)
  [3/4] generate-gherkin ............... FAILED (template error)
  [4/4] generate-playwright-tests ...... SKIPPED (depends on gherkin)

Total: 2/4 commands succeeded, 1 failed, 1 skipped
```

### Step 2: List Generated Deliverables

```
Deliverables:
  requirements/     3 files
  test-charter/     1 file
  test-strategy/    1 file
  test-cases/       4 files (3 MD + 1 CSV)
  test-plan/        1 file
  risk-register/    1 file
  README.md         1 file (output index)
```

### Step 3: Suggest Next Steps

Based on what was generated, suggest logical next steps:

```
Next steps:
  - /generate-gherkin          Generate BDD feature files from test cases
  - /generate-playwright-tests Generate Playwright specs from test cases
  - /publish-to-confluence     Publish deliverables to Confluence
  - /validate-outputs          Validate all generated files
  - /generate-traceability-report  Generate coverage matrix
```

Only suggest commands that weren't already in the pipeline and make sense given the deliverables generated.

## Constraints

- This is a summary phase — do NOT generate additional files
- Do NOT re-execute any commands
- Be clear about which commands succeeded, failed, or were skipped
