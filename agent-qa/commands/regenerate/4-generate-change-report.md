# PHASE 4: Generate Change Report

Generate a change report documenting what was regenerated and why.

## Core Responsibilities

1. **Create Change Log**: Document all changes detected and actions taken
2. **Update Output Index**: Refresh the README.md with regeneration metadata
3. **Execute Post-Hooks**: Run configured post-generation hooks

## Workflow

### Step 1: Create or Append Change Log

Create (or append to) `{output_folder}/change-log.md`:

1. If the file does not exist, create it with YAML front matter:
   ```yaml
   ---
   type: change-log
   generated: YYYY-MM-DD HH:MM
   regeneration_trigger: requirement-changes
   version: "1.1"
   ---
   ```
2. If the file already exists, append a new entry section with a horizontal rule separator (`---`)
3. Increment the version in YAML front matter

### Step 2: Document Change Details

Write the following sections in the change log entry:

#### Regeneration Summary

- Date and time of regeneration
- Number of changed requirements detected
- Number of deliverables regenerated
- Number of deliverables unchanged

#### Changed Requirements

| Requirement | Change Type | Details |
|-------------|-------------|---------|
| {KEY} | {content/priority/scope} | {description of what changed} |

#### Affected Deliverables

| Deliverable | Action | Previous Version | New Version |
|-------------|--------|-----------------|-------------|
| {file path} | {regenerated/updated/skipped} | {old version} | {new version} |

#### Preserved Deliverables

| Deliverable | Reason |
|-------------|--------|
| {file path} | No source changes |

#### Backup Location

- Backup path: `{output_folder}/.backup/{timestamp}/`
- Files backed up: {count}

#### Diff Summary

- Test cases added: {count}
- Test cases modified: {count}
- Test cases removed: {count}
- Total test cases: {count}

### Step 3: Update Output Index

Follow `@agent-qa/commands/common/generate-output-index.md` to regenerate the output folder's `README.md` with updated metadata reflecting the regeneration.

### Step 4: Execute Post-Hooks

Follow `@agent-qa/commands/common/execute-post-hooks.md` to run any configured post-generation hooks with:

- `{output_folder}` — the output folder path
- `{command_name}` — `regenerate`
- `{context}` — the context from the output folder name

## Constraints

- The change log MUST be append-only if it already exists — add a new entry, do not overwrite previous entries
- Include enough detail for audit trail and traceability
- Follow output standards from `@.claude/rules/output-standards.md` for formatting
- Follow language rules from `@.claude/rules/language-handling.md` — write the change log in the majority language of the deliverables
