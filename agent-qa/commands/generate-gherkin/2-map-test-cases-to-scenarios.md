# Phase 2: Map Test Cases to Scenarios

## Core Responsibilities

- Classify test steps as Given, When, or Then
- Identify shared preconditions for Background sections
- Determine Scenario vs Scenario Outline based on test data
- Group test cases into Features by requirement key

## Workflow Steps

### Step 1: Load Feature Template

Check for a custom template first, then fall back to the default:

1. Check `agent-qa/custom-templates/gherkin/feature-template.md`
2. If not found, read `agent-qa/formats/gherkin/feature-template.md`

If neither template is found, use the default mapping rules described below.

### Step 2: Group Test Cases by Requirement

Organize test cases by their linked requirement key:

```
PROJ-123:
  - TC-PROJ-123-001 (P1)
  - TC-PROJ-123-002 (P2)
  - TC-PROJ-123-003 (P3)
PROJ-124:
  - TC-PROJ-124-001 (P1)
```

Each group will become one `.feature` file.

### Step 3: Map Test Cases to Scenarios

Apply `@agent-qa/roles/gherkin-authoring.md`, sections `## Step Classification`,
`## Scenario Types` and `## Tagging`, to the test cases grouped in Step 2.

## Data Storage

Store for subsequent phases:
- `features`: Map of requirement key → Feature structure containing:
  - Feature name and description (As a / I want / So that)
  - Background steps (if any)
  - List of Scenarios/Scenario Outlines with their steps and tags
- `tag_summary`: Count of tags used
- `step_classification_log`: Record of how steps were classified (for traceability)

## Constraints

- Do NOT write any files in this phase
- Preserve the original language of test step text
- Do NOT translate or rewrite test step content — only restructure into Gherkin format
