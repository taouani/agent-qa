# Phase 3: Classify Failure

## Core Responsibilities

Assign exactly one class to each failure, with the evidence that justifies it.

## Workflow Steps

### Step 1: Load the Classification Table

Read `## Failure Classification` in `@agent-qa/rules/automation-conventions.md`.

### Step 2: Classify

Work through these questions in order. The first that answers decides the class.

1. Does the application behave incorrectly, with the assertion being right?
   → **Real defect**. Stop classifying.
2. Does the element exist in the current UI but the locator no longer matches it? Confirm against
   a `ui-snapshots/` entry or a trace, not by assumption.
   → **Selector**
3. Does the element appear correctly but after the assertion ran?
   → **Synchronization**
4. Is a required record missing, stale, or already consumed by another test?
   → **Test data**
5. Is the base URL, auth state, or a dependency service wrong or unavailable?
   → **Environment**
6. Does it pass and fail without any change?
   → **Flake**, and the race must be identified before anything is changed.

If no question resolves it, STOP and report what evidence is missing. Never guess a class in order
to proceed.

### Step 3: Halt on a Real Defect

When the class is Real defect, write the report immediately and stop the command:

    Real defect detected in {spec}: {description}
    The test is correct. The application is wrong.
    No test changes made. Raise this with the development team.

Do not continue to Phase 4. Making this test pass would destroy the signal it produced.

### Step 4: Halt on Environment

An environment failure is not fixed in test code. Report what is misconfigured and stop.

## Data Storage

- `classification`: per target — {class, evidence, confidence}

## Constraints

- Exactly one class per failure
- Every classification must cite evidence
- Real defect and Environment both terminate the command
- Do NOT modify any file in this phase
