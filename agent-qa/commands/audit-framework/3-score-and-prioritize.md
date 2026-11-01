# Phase 3: Score and Prioritize

## Core Responsibilities

Turn observations into identified, ranked findings.

## Workflow Steps

### Step 1: Convert Observations to Findings

Merge observations describing the same root cause into one finding. Assign each a stable id
`AF-001`, `AF-002`, and so on, in the order they will appear in the report. These ids are read
by `refactor-framework` and must not be reused across runs within the same output folder.

### Step 2: Assign Severity

Use `## Severity Levels` from `@agent-qa/rules/automation-conventions.md`. A framework-level
finding is Critical only when it can cause a false pass across many tests.

### Step 3: Score Impact and Risk

For each finding, record:

- **Impact**: High, Medium, or Low — how much reliability or maintenance cost it drives
- **Risk of change**: High, Medium, or Low — how much of the suite a fix would touch
- **Effort**: rough file count that a fix would modify

### Step 4: Rank

Order by high impact and low risk first. State the ordering rule in the report so the engineer
can disagree with it knowingly.

### Step 5: Identify Dependencies

Record which findings must be fixed before others — for example, a shared locator strategy must
change before the page objects that depend on it. Express as `depends_on: [AF-002]`.

## Data Storage

- `findings`: list of {id, axis, severity, impact, risk, effort, depends_on, evidence}

## Constraints

- Do NOT modify any file
- Do NOT rank by effort alone
- Every finding must carry an id, a severity, and evidence
