# Phase 2: Classify and Load Conventions

## Core Responsibilities

- Classify each selected file by type
- Load the conventions the review will be measured against

## Workflow Steps

### Step 1: Classify Each File

| Type | Recognised by |
|------|---------------|
| Spec | Contains `test(` or `test.describe(` |
| Page object | Exports a class holding `Locator` properties |
| Fixture | Extends `test` via `test.extend` or exports a fixture object |
| Service or API client | Performs HTTP calls, no browser interaction |
| Utility | None of the above |

A file that mixes types is itself a finding — record it as Medium severity, "mixed
responsibilities", in Phase 3.

### Step 2: Load Conventions

Read `@agent-qa/rules/automation-conventions.md` — specifically `## Locator Priority`,
`## Never-Apply Fixes`, and `## Severity Levels`.

Then read the framework profile's `## Layout`, `## Locator Priority`, and `## Archetype Notes`.
Where the profile and the rule disagree on locator priority, the profile wins.

### Step 3: Load Comparable Examples

For each file type present, read up to two existing files of the same type that the profile
identifies as representative. Review against what this repository actually does, not against a
generic ideal.

## Data Storage

- `file_types`: map of path to classification
- `conventions`: merged rule and profile conventions
- `examples`: representative files per type

## Constraints

- Do NOT modify any file in this phase
- Do NOT report findings yet
