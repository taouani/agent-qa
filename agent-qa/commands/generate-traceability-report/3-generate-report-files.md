# Phase 3: Generate Report Files

## Core Responsibilities

Generate the traceability report file from the matrix built in Phase 2.

## Workflow

### Step 1: Generate Traceability Report

Write `{selected_folder}/traceability-report.md`:

```markdown
---
type: traceability-report
generated: YYYY-MM-DD HH:MM
source_requirements:
  - {KEY-1}
  - {KEY-2}
language: {majority_language}
version: "1.0"
---

# Traceability Report

## Summary

| Metric | Count |
|--------|-------|
| Requirements | {count} |
| Test Cases | {count} |
| Gherkin Scenarios | {count} |
| Playwright Tests | {count} |
| Coverage Rate | {percentage}% |

## Coverage Matrix

| Requirement | Test Cases | Gherkin | Playwright | Strategy | Charter | Plan | Risk Register |
|------------|-----------|---------|-----------|----------|---------|------|--------------|
| PROJ-123 | 5 (P1:2, P2:3) | 5 scenarios | 5 tests | Y | Y | Y | Y |
| PROJ-124 | 3 (P2:1, P3:2) | 3 scenarios | - | Y | Y | Y | Y |
| PROJ-125 | - | - | - | Y | - | - | - |

Legend: Y = covered, - = not generated

## Detailed Test Case Traceability

| Test Case ID | Requirement | Priority | Gherkin Scenario | Playwright Test |
|-------------|-------------|----------|-----------------|-----------------|
| TC-PROJ-123-001 | PROJ-123 | P1 | Scenario: ... | test('TC-PROJ-123-001: ...') |
| TC-PROJ-123-002 | PROJ-123 | P1 | Scenario: ... | test('TC-PROJ-123-002: ...') |
| TC-PROJ-124-001 | PROJ-124 | P2 | Scenario: ... | - |

## Gap Analysis

### Requirements Without Test Cases
{list of requirements with no test cases, or "None — all requirements have test cases"}

### Test Cases Without Gherkin Coverage
{list of test cases with no .feature mapping, or "N/A — gherkin/ not generated" or "None — full coverage"}

### Test Cases Without Playwright Coverage
{list of test cases with no .spec.ts mapping, or "N/A — playwright/ not generated" or "None — full coverage"}

### Orphaned Artifacts
{list of test cases referencing unknown requirements, or "None"}

## Coverage by Priority

| Priority | Total Test Cases | With Gherkin | With Playwright | Coverage |
|----------|-----------------|-------------|-----------------|----------|
| P1 Critical | {count} | {count} | {count} | {%} |
| P2 High | {count} | {count} | {count} | {%} |
| P3 Medium | {count} | {count} | {count} | {%} |
| P4 Low | {count} | {count} | {count} | {%} |
```

### Step 2: Update Output Index

Follow the instructions in `@agent-qa/commands/common/generate-output-index.md` to update the output folder README.md.

### Step 3: Present Results

Display a summary:

```
Traceability report generated!

Output: {selected_folder}/traceability-report.md

Coverage Summary:
  - {requirement_count} requirements analyzed
  - {test_case_count} test cases mapped
  - {coverage_rate}% overall coverage
  - {gap_count} gaps identified
```

## Constraints

- Write files ONLY within the selected output folder
- Do NOT modify existing deliverable files
- Only report gaps for deliverable types that exist in the output folder
- Use the requirement's detected language for requirement-specific sections
- Follow output-standards.md for YAML front matter and markdown formatting
