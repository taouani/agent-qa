# PHASE 3: Regenerate Deliverables

Re-run the relevant portions of generation commands for affected deliverables only.

## Core Responsibilities

1. **Back Up Affected Files**: Create safety copies before any modification
2. **Regenerate Requirements**: Re-analyze changed requirements from Jira
3. **Regenerate Test Cases**: Re-generate test cases for affected requirements
4. **Regenerate Downstream Deliverables**: Re-generate gherkin, playwright, and other downstream files
5. **Apply Priority Updates**: Update priority fields without full regeneration
6. **Update Metadata**: Refresh timestamps, versions, and index files

## Workflow

### Step 1: Back Up Affected Files

Create a backup of all files that will be modified:

1. Create `{output_folder}/.backup/{YYYY-MM-DD-HHMMSS}/` directory
2. Copy each affected file to the backup directory, preserving subfolder structure
3. Log the backup location for the change report

### Step 2: Regenerate Requirement Files

For each requirement flagged for full regeneration:

1. Re-fetch requirement content from Jira using `mcp_Atlassian_jira_get_issue`
2. Re-analyze the requirement using the analysis logic from `@agent-qa/commands/analyze-requirements/` phases 2-7
3. Overwrite the requirement file (`requirements/{KEY}.md`)
4. Detect language following `@.claude/rules/language-handling.md`

### Step 3: Regenerate Test Cases

For each requirement whose test cases need regeneration:

1. Read the existing test case file to identify current test case IDs and numbering
2. Re-generate test cases using the logic from `@agent-qa/commands/generate-test-cases/` phases 3-4
3. Preserve test case ID continuity:
   - Existing acceptance criteria that are unchanged: keep the same test case IDs
   - Modified acceptance criteria: regenerate with the same test case IDs
   - New acceptance criteria: append new test cases with next sequential IDs
   - Removed acceptance criteria: remove corresponding test cases
4. Update CSV/JSON export files (`xray-bulk-import.csv`, `xray-import.json`, `testrail-import.csv`) if they exist

### Step 4: Regenerate Downstream Deliverables

For each affected requirement key, regenerate downstream files only if they exist in the output folder:

1. **Gherkin features** (`gherkin/{KEY}.feature`): Re-generate using `@agent-qa/commands/generate-gherkin/` logic
2. **Playwright specs** (`playwright/{KEY}.spec.ts`): Re-generate using `@agent-qa/commands/generate-playwright-tests/` logic
3. **API tests** (`api-tests/*-api-tests.md`): Re-generate for affected requirements
4. **Accessibility tests** (`accessibility-tests/*-accessibility-tests.md`): Re-generate for affected requirements
5. **Test data** (`test-data/*-data.md`): Re-generate for affected requirements

Keep files for unaffected requirements unchanged.

### Step 5: Apply Priority-Only Updates

For deliverables flagged as "update priority only":

1. Read the file and update the priority field in YAML front matter
2. Update priority references in the document body
3. Update priority in CSV/JSON export files
4. Do NOT regenerate content

### Step 6: Regenerate Cross-Reference Files

Regenerate all index and cross-reference files:

1. `test-cases/test-cases-index.md` — if it exists
2. `test-cases/test-cases-traceability-matrix.md` — if it exists
3. Any traceability reports in the output folder

### Step 7: Update Metadata on All Regenerated Files

For every file that was modified:

1. Update `generated` timestamp in YAML front matter to current date/time
2. Add `regenerated: YYYY-MM-DD HH:MM` field to YAML front matter
3. Add `previous_version` field with the old version value
4. Increment `version` to next minor version (e.g., "1.0" to "1.1", "1.1" to "1.2")

## Constraints

- ALWAYS create backups before overwriting any file
- Preserve test case ID continuity — do NOT reset numbering
- Only regenerate deliverables identified in Phase 2
- Keep the same output folder — do NOT create a new dated folder
- Follow language handling rules from `@.claude/rules/language-handling.md`
- Follow output standards from `@.claude/rules/output-standards.md`
- Match the quality and format of the original generation
