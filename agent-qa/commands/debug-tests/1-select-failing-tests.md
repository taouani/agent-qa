# Phase 1: Select Failing Tests

## Core Responsibilities

- Resolve the framework profile
- Identify which failing tests to work on

## Workflow Steps

### Step 1: Resolve the Framework Profile

Follow `@agent-qa/commands/common/discover-framework-profile.md`. If it stops, this command stops.

### Step 2: Find the Failures

Use the first available source, in this order:

1. An explicit spec path or test title given in the command arguments
2. A tag given in the command arguments
3. The most recent JSON or HTML report under `playwright_project_root`, if the profile records a
   reporter output path

If none resolves, ask the user for a spec path. Do not run the whole suite to discover failures —
that is expensive and the user may already know which test is failing.

### Step 3: Present and Confirm

List the failing tests with their file, title, and the first line of the error. Ask which to
debug. Default to one. Debugging several at once mixes evidence.

## Data Storage

- `profile`, `selected_folder`
- `targets`: confirmed list of {spec_path, test_title, reported_error}

## Constraints

- Do NOT modify any file in this phase
- Do NOT run the full suite
