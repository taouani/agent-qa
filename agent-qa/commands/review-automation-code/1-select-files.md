# Phase 1: Select Files

## Core Responsibilities

- Resolve the framework profile
- Determine which files to review
- Confirm the selection with the user

## Workflow Steps

### Step 1: Resolve the Framework Profile

Follow the instructions in `@agent-qa/commands/common/discover-framework-profile.md`.
If that instruction stops, this command stops.

### Step 2: Resolve the Output Folder

Set `selected_folder` to `agent-qa/{today's date as YYYY-MM-DD}-automation/`, creating it if it
does not exist. Reuse an existing folder for the same date rather than creating a second one.

### Step 3: Determine the File Set

Use the first source the user supplied, in this order:

1. Explicit paths given in the command arguments.
2. A glob given in the command arguments.
3. Default — files changed against the base branch:

```bash
git diff --name-only "$(git merge-base HEAD origin/master)"...HEAD
```

Keep only files under `playwright_project_root` with a `.ts` or `.js` extension. Drop anything
matching the deny-list in `## Constraints`.

If the resulting set is empty, report "No automation files to review." and stop.

### Step 4: Confirm

Present the file list with counts by type and ask the user to confirm before reading contents.

## Data Storage

- `profile`: parsed framework profile
- `selected_folder`: the dated output folder for this run
- `review_files`: confirmed list of file paths

## Constraints

- Do NOT modify any file in this phase
- Never include `.env*`, `**/.auth/*.json`, `node_modules/`, or CI configuration in the file set
- Never read the contents of an auth-state file
