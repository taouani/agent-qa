# Phase 2: Build Traceability Matrix

## Core Responsibilities

Read all deliverables in the selected output folder and build a cross-deliverable traceability matrix.

## Workflow

### Step 1: Extract Requirement Keys

Read all files in `requirements/`:
- Extract requirement keys from filenames and YAML front matter
- Note the requirement summary/title
- Build a master list of all requirement keys

### Step 2: Build Traceability Matrix

Apply `@agent-qa/roles/release-reporting.md`, section `## Traceability Matrix`, to the requirement
keys extracted in Step 1 and the deliverables present in the selected output folder.

The role owns mapping test cases, Gherkin scenarios, Playwright specs, and other deliverables to
requirements, building the cross-deliverable coverage matrix, and identifying gaps. This phase owns
what is supplied to it and where the matrix is stored.

## Data Storage

Store the complete traceability matrix and gap analysis in memory.

## Constraints

- Do NOT modify any files
- Handle missing deliverable types gracefully (only flag gaps for deliverable types that exist in the output folder)
- Parse files carefully — don't assume format, validate as you go
