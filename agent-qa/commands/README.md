# Agent-QA Commands

This directory contains all agent-qa commands following agent-os multi-phase command patterns.

## Command Structure

Each command follows the agent-os pattern with:
- Main command file: `{command-name}.md`
- Numbered phase instruction files: `{phase-number}-{phase-name}.md`

## Available Commands

### 1. analyze-requirements

Analyzes Jira issues (single issue, multiple issues, or JQL filter) and generates requirement markdown files.

**Input**: Jira issue key(s) or JQL filter query
**Output**: `agent-qa/YYYY-MM-DD-{folder-name}/requirements/`

**Phases**:
1. Initialize and determine input type
2. Retrieve Jira issues
3. Process epics and child stories
4. Analyze linked content
5. Extract and structure requirements
6. Perform quality analysis
7. Generate requirement files

### 2. generate-test-charter

Generates test charters from analyzed requirements.

**Input**: User selection of requirements analysis folder
**Output**: `agent-qa/YYYY-MM-DD-{folder-name}/test-charter/`

**Phases**:
1. Find and select requirements analysis
2. Load requirements data
3. Generate test charter content
4. Generate test charter files

**Dependencies**: Requires `analyze-requirements` to be run first

### 3. generate-test-strategy

Generates test strategies from analyzed requirements, including test charter if available.

**Input**: User selection of requirements analysis folder
**Output**: `agent-qa/YYYY-MM-DD-{folder-name}/test-strategy/`

**Phases**:
1. Find and select requirements analysis
2. Load requirements and related deliverables (test charter)
3. Generate test strategy content
4. Generate test strategy files

**Dependencies**: Requires `analyze-requirements` to be run first. Optionally uses `generate-test-charter` output.

### 4. generate-test-cases

Generates test cases (positive, negative, edge cases) from analyzed requirements, including test charter and/or test strategy if available.

**Input**: User selection of requirements analysis folder
**Output**: `agent-qa/YYYY-MM-DD-{folder-name}/test-cases/`

**Phases**:
1. Find and select requirements analysis
2. Load requirements and related deliverables (test charter, test strategy)
3. Generate test cases content
4. Generate test case files (markdown + CSV for Xray)

**Dependencies**: Requires `analyze-requirements` to be run first. Optionally uses `generate-test-charter` and/or `generate-test-strategy` outputs.

### 5. generate-test-plan

Generates test plans from analyzed requirements, including test charter, test strategy, and/or test cases if available.

**Input**: User selection of requirements analysis folder
**Output**: `agent-qa/YYYY-MM-DD-{folder-name}/test-plan/`

**Phases**:
1. Find and select requirements analysis
2. Load requirements and related deliverables (test charter, test strategy, test cases)
3. Generate test plan content
4. Generate test plan files

**Dependencies**: Requires `analyze-requirements` to be run first. Optionally uses `generate-test-charter`, `generate-test-strategy`, and/or `generate-test-cases` outputs.

### 6. generate-risk-register

Generates risk registers from analyzed requirements, including test charter, test strategy, and/or test cases if available.

**Input**: User selection of requirements analysis folder
**Output**: `agent-qa/YYYY-MM-DD-{folder-name}/risk-register/`

**Phases**:
1. Find and select requirements analysis
2. Load requirements and related deliverables (test charter, test strategy, test cases)
3. Identify and analyze risks
4. Generate risk register files

**Dependencies**: Requires `analyze-requirements` to be run first. Optionally uses `generate-test-charter`, `generate-test-strategy`, and/or `generate-test-cases` outputs.

## Folder Structure

All outputs follow this pattern:
```
agent-qa/
  YYYY-MM-DD-{folder-name}/
    requirements/          # From analyze-requirements
    test-charter/          # From generate-test-charter
    test-strategy/         # From generate-test-strategy
    test-cases/            # From generate-test-cases
    test-plan/             # From generate-test-plan
    risk-register/         # From generate-risk-register
```

Where `{folder-name}` is:
- Issue key for single issues (e.g., "PROJ-123")
- "release" for multiple issues or JQL filters

## Workflow

1. **First**: Run `analyze-requirements` with Jira issue(s) or JQL filter
2. **Then**: Run any of the generate commands, selecting the requirements analysis to use
3. **Optional**: Generate commands can use outputs from previous generate commands as context

## Notes

- All commands follow agent-os multi-phase patterns
- Commands are independent and can be run in any order (after analyze-requirements)
- Each command prompts user to select which requirements analysis to use
- Commands automatically detect and include related deliverables when available

