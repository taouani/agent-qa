# Agent-QA Commands

This directory contains all agent-qa commands .

## Command Structure

Each command follows the multi-phase pattern with:
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

### 7. health-check

Verifies Agent-QA configuration, directory structure, and MCP server connectivity.

**Input**: None
**Output**: Health check report (displayed to user, no files generated)

**Phases**:
1. Validate configuration (config.yml, directories, IDE integrations)
2. Test MCP connectivity (Atlassian, Repository)

**Dependencies**: None

### 8. validate-outputs

Validates generated deliverables against QA conventions and output standards.

**Input**: User selection of output folder
**Output**: Validation report (displayed to user, no files generated)

**Phases**:
1. Find and select output folder
2. Validate deliverables (YAML front matter, file naming, test case IDs, CSV format, cross-deliverable consistency)
3. Generate validation report

**Dependencies**: Requires at least one output folder to exist

### 9. generate-traceability-report

Generates a cross-deliverable coverage matrix showing requirements through all deliverables.

**Input**: User selection of output folder
**Output**: `agent-qa/YYYY-MM-DD-{folder-name}/traceability-report.md`

**Phases**:
1. Find and select output folder
2. Build traceability matrix (requirements → test cases → gherkin → playwright)
3. Generate report files with gap analysis

**Dependencies**: Requires `analyze-requirements` to be run first

### 10. generate-test-data

Generates structured test data specifications (valid, invalid, boundary, null, security).

**Input**: User selection of requirements analysis folder
**Output**: `agent-qa/YYYY-MM-DD-{folder-name}/test-data/`

**Phases**:
1. Find and select requirements
2. Analyze data requirements (fields, types, constraints)
3. Generate data sets (valid, invalid, boundary, null/empty, security)
4. Generate test data files

**Dependencies**: Requires `analyze-requirements` to be run first. Optionally uses `generate-test-cases` output.

### 11. run-pipeline

Executes multiple commands in dependency order as a single pipeline.

**Input**: Pipeline specification (predefined pipeline, range, or command list)
**Output**: All deliverables from each command in the pipeline

**Phases**:
1. Parse pipeline configuration and resolve command order
2. Execute commands sequentially with auto-context passing
3. Generate pipeline summary

**Dependencies**: None (first command must be a root command)

### 12. generate-api-tests

Generates REST/GraphQL API test specifications from analyzed test cases.

**Input**: User selection of test cases folder
**Output**: API test spec files in `agent-qa/YYYY-MM-DD-{context}/api-tests/`

**Phases**:
1. Find and select test cases with API interactions
2. Analyze API endpoints from test cases and requirements
3. Generate API test specifications (positive, negative, auth, edge cases)
4. Generate API test files and index

**Dependencies**: Requires `generate-test-cases` to be run first.

### 13. generate-accessibility-tests

Generates WCAG 2.1 AA accessibility test cases from UI-facing test cases.

**Input**: User selection of test cases folder
**Output**: Accessibility test files in `agent-qa/YYYY-MM-DD-{context}/accessibility-tests/`

**Phases**:
1. Find and select UI-facing test cases
2. Analyze accessibility requirements and map to WCAG criteria
3. Generate accessibility test cases per criterion per page
4. Generate accessibility test files, WCAG compliance matrix, and index

**Dependencies**: Requires `generate-test-cases` to be run first.

### 14. regenerate

Detects requirement changes and regenerates only affected deliverables.

**Input**: User selection of existing output folder
**Output**: Updated deliverables in the same output folder, change log

**Phases**:
1. Detect changes by comparing Jira issue timestamps against deliverable timestamps
2. Identify affected deliverables and map change impact
3. Back up and regenerate affected deliverables only
4. Generate change report and update indexes

**Dependencies**: Requires an existing output folder with generated deliverables.

## Notes

- All commands follow multi-phase patterns
- Commands are independent and can be run in any order (after analyze-requirements)
- Each command prompts user to select which requirements analysis to use
- Commands automatically detect and include related deliverables when available
- Custom format templates can be placed in `agent-qa/custom-templates/` to override defaults

