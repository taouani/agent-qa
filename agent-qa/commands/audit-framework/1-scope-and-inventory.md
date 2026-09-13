# Phase 1: Scope and Inventory

## Core Responsibilities

- Resolve the framework profile
- Build a structural inventory of the test framework
- Establish the sampling strategy for Phase 2

## Workflow Steps

### Step 1: Resolve the Framework Profile

Follow `@agent-qa/commands/common/discover-framework-profile.md`. If it stops, this command stops.

### Step 2: Inventory

Under `playwright_project_root`, excluding `node_modules/`, count and list:

- Spec files, page objects, fixtures, services, utilities, and test data files
- Directory depth and the top-level layout
- Entry points: `playwright.config.ts`, global setup and teardown, `package.json` scripts
- Total lines per category, and the ten largest files by line count

### Step 3: Define the Sample

A full read is not feasible on a large suite and not necessary. Select:

- Every entry point and fixture — always read in full
- The ten largest files
- A random sample of ten specs and ten page objects beyond those

Record the sample size and total population. Every finding in Phase 2 must state the sample it
came from, so the report never implies more coverage than was actually achieved.

## Data Storage

- `profile`, `selected_folder`
- `inventory`: counts and layout
- `sample`: the file list to analyse, with population sizes

## Constraints

- Do NOT modify any file
- Do NOT read `node_modules/` or any auth-state file
- Do NOT claim repository-wide certainty from a sample
