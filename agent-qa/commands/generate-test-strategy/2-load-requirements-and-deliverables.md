# PHASE 2: Load Requirements and Related Deliverables

Load requirements data and check for test charter if available.

## Core Responsibilities

1. **Load Requirements**: Load requirements from selected folder
2. **Check for Test Charter**: Check if test charter exists in test-charter folder
3. **Load Test Charter**: If available, load test charter content
4. **Store in Memory**: Store all data in memory

## Workflow

### Step 1: Load Requirements Data

Load requirements data (same as generate-test-charter Phase 2):
- Read requirements-index.md
- Load all requirement files
- Parse and structure requirements

### Step 2: Check for Test Charter

Check if test charter folder exists:
- Path: `agent-qa/YYYY-MM-DD-{folder-name}/test-charter/`
- Check for `test-charter-index.md` or `test-charter.md`

### Step 3: Load Test Charter (if available)

If test charter exists:
- Read test charter file(s)
- Parse test charter content
- Extract relevant information (risks, areas to explore, test approach)

### Step 4: Store in Memory

Store requirements and test charter (if available) in memory for strategy generation.

## Important Constraints

- Test charter is optional (not required)
- If test charter not found, proceed with requirements only
- Include test charter context when generating strategy

