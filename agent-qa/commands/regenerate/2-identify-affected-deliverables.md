# PHASE 2: Identify Affected Deliverables

Map changed requirements to affected deliverables and determine regeneration scope.

## Core Responsibilities

1. **Scan Deliverable Files**: Identify all deliverables in the output folder
2. **Build Dependency Map**: Map each deliverable to its source requirements
3. **Classify Change Impact**: Determine the type of regeneration needed per deliverable
4. **Present Regeneration Plan**: Show the user what will be regenerated and get confirmation

## Workflow

### Step 1: Scan All Deliverable Files

For each changed requirement, scan all deliverable files in the output folder and build a complete file inventory:

- List every file in every subfolder
- Read YAML front matter to identify source requirements per file
- Note file types (`.md`, `.csv`, `.json`, `.feature`, `.spec.ts`, `.html`)

### Step 2: Build Dependency Map

For each changed requirement key, identify affected deliverables using these rules:

| Deliverable Pattern | Affected When |
|---------------------|---------------|
| `requirements/{KEY}.md` | Directly affected by any change |
| `test-cases/test-cases-{KEY}.md` | Requirement content changed |
| `test-cases/xray-bulk-import.csv` | Any test case changed |
| `test-cases/xray-import.json` | Any test case changed |
| `test-cases/testrail-import.csv` | Any test case changed |
| `gherkin/{KEY}.feature` | Test cases changed |
| `playwright/{KEY}.spec.ts` | Test cases changed |
| `api-tests/*-api-tests.md` | Test cases changed |
| `accessibility-tests/*-accessibility-tests.md` | Test cases changed |
| `test-data/*-data.md` | Requirement data fields changed |
| `test-strategy/test-strategy.md` | Priority or scope changed |
| `test-plan/test-plan.md` | Scope, priority, or timeline changed |
| `risk-register/risk-register.md` | Priority or risk factors changed |
| `test-charter/test-charter.md` | Scope changed |
| Index files (`*-index.md`, `README.md`, traceability) | Always regenerate if any deliverable changed |

### Step 3: Classify Change Impact

For each affected deliverable, assign an action type:

- **Content change** (description or acceptance criteria changed): Regenerate test cases and all downstream deliverables (gherkin, playwright, api-tests, accessibility-tests)
- **Priority change** (priority field changed): Update priority in all deliverables without regenerating content
- **Scope change** (new requirements added or removed): Regenerate strategy, plan, risk register, and charter
- **Minor change** (only status changed): No regeneration needed, skip

### Step 4: Present Regeneration Plan

Display the regeneration plan to the user in this format:

```
Changed Requirements:
- {KEY}: {change description}
- {KEY}: {change description}

Affected Deliverables:
- {path} (regenerate)
- {path} (regenerate)
- {path} (update priority only)

Unchanged: {count} deliverables
```

### Step 5: Get User Confirmation

Ask the user to confirm the regeneration plan before proceeding:

- If confirmed, store the plan and proceed to Phase 3
- If declined, stop the command

### Step 6: Store Phase Results

Store in memory for subsequent phases:

- Affected deliverables list with action type per file (regenerate / update / skip)
- Dependency chain for each changed requirement
- Files that will remain unchanged

## Constraints

- Do NOT modify any files in this phase
- Always show the regeneration plan and get explicit user confirmation before proceeding
- Mark deliverables that exist in the folder but were not part of the original generation as "skipped"
- Only include deliverable files that actually exist in the output folder in the plan
