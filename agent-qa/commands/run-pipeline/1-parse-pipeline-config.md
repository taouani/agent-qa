# Phase 1: Parse Pipeline Configuration

## Core Responsibilities

Parse the user's pipeline specification and resolve the command execution order.

## Workflow

### Step 1: Get Pipeline Input

Ask the user for the pipeline specification. Accept one of these formats:

**Format 1: Predefined pipelines**
```
full            — All commands: analyze-requirements → test-charter → test-strategy → test-cases → test-plan → risk-register
test-automation — analyze-requirements → test-cases → generate-gherkin → generate-playwright-tests → generate-api-tests → generate-accessibility-tests
release         — analyze-commits → generate-release-notes
```

**Format 2: Start-to-end range**
```
from analyze-requirements to generate-playwright-tests
```

**Format 3: Explicit command list**
```
analyze-requirements, generate-test-cases, generate-gherkin
```

### Step 2: Resolve Dependency Chain

Using the command dependency chain, resolve the execution order:

```
analyze-requirements (root)
  ├── generate-test-charter
  ├── generate-test-strategy
  ├── generate-test-cases
  │     ├── generate-gherkin
  │     ├── generate-playwright-tests
  │     ├── generate-api-tests
  │     └── generate-accessibility-tests
  ├── generate-test-plan
  ├── generate-risk-register
  └── generate-test-data

analyze-commits (independent root)
  └── generate-release-notes
```

Rules:
1. If a command requires a prerequisite, automatically include the prerequisite
2. Order commands by dependency level (prerequisites first)
3. Commands at the same level can run in any order

### Step 3: Get Command Parameters

For the first command in the pipeline:
- If `analyze-requirements`: Ask for Jira issue key(s) or JQL filter
- If `analyze-commits`: Ask for Jira filter or tickets and date range

For all subsequent commands: auto-select the output folder from the first command.

### Step 4: Confirm Pipeline

Present the resolved pipeline to the user:

```
Pipeline to execute:
  1. analyze-requirements (PROJ-123)
  2. generate-test-charter
  3. generate-test-strategy
  4. generate-test-cases
  5. generate-test-plan
  6. generate-risk-register

Total: 6 commands
```

Ask for confirmation before proceeding.

## Data Storage

Store:
- `pipeline_commands`: Ordered list of commands to execute
- `initial_input`: Parameters for the first command
- `output_folder`: Will be set after first command runs

## Constraints

- Always validate the dependency chain — do not allow running a command without its prerequisites
- The first command must be a root command (`analyze-requirements` or `analyze-commits`)
- `publish-to-confluence` can be added at the end of any pipeline
- `validate-outputs` and `generate-traceability-report` can be added at the end of any pipeline
