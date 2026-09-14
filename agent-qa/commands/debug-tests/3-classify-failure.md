# Phase 3: Classify Failure

## Core Responsibilities

Assign exactly one class to each failure, with the evidence that justifies it.

## Workflow Steps

### Step 1: Load the Classification Table

Read `## Failure Classification` in `@agent-qa/rules/automation-conventions.md`.

### Step 2: Classify

Work through these questions in order. The first that answers decides the class.

1. Does the application behave incorrectly — wrong output, wrong state, or materially slower
   than the requirement or its own prior behaviour — with the assertion being right?
   → **Real defect**. Stop classifying.
   A step that still completes but takes far longer than it used to is a candidate real defect,
   not a synchronization problem. Timing that regressed is a symptom, not a test bug.
2. Does the element exist in the current UI but the locator no longer matches it? Confirm against
   a `ui-snapshots/` entry or a trace, not by assumption.
   → **Selector**
   If the UI difference cannot be traced to an intended change — a requirement, a design note, or
   a commit — it is a candidate real defect, not a selector problem. A snapshot tells you what the
   UI is, never whether it should be that.
3. Does the element appear correctly but after the assertion ran?
   → **Synchronization**
4. Is a required record missing, stale, or already consumed by another test?
   → **Test data**
   If the record is missing because the application failed to create it, that is a real defect.
   Classify as Test data only when the data was never created by the system under test.
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
