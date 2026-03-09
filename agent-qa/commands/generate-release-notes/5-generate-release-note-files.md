# PHASE 5: Generate Release Note Files

Generate release note markdown files with all content, traceability links, and proper formatting.

## Core Responsibilities

1. **Create Release Note File**: Create main release note markdown file
2. **Include All Sections**: Include executive summary, requirements, code changes, test coverage, traceability matrix
3. **Use Proper Markdown Formatting**: Use tables, lists, code blocks, links
4. **Include Traceability Links**: Include all traceability links between artifacts
5. **Create Summary Index**: Create summary index file
6. **Generate One Release Note Per Folder**: Generate one release note per requirement analysis folder

## Workflow

### Step 1: Determine File Structure

Create file structure:
- Main release note file: `release-notes.md`
- Summary index file: `release-notes-index.md`
- Store in: `agent-qa/YYYY-MM-DD-{folder-name}/release-notes/`

### Step 2: Create Main Release Note File

Create `release-notes.md`:

**File Structure:**
```markdown
# Technical Release Notes

**Release Date**: {date}
**Requirements Analysis**: {folder name}
**Repository Platform**: {platform}
**Repository Project ID**: {project ID}

---

## Executive Summary

{Executive summary from Phase 3}

---

## Requirements Summary

{Requirements summary from Phase 3}

---

## Code Changes Summary

{Code changes summary from Phase 3}

---

## Test Coverage

{Test coverage from Phase 3}

---

## Affected Components

{Affected components from Phase 3}

---

## Impact Analysis

{Impact analysis from Phase 3}

---

## Traceability Matrix

### Code Changes to Requirements Traceability

{Traceability matrix from Phase 4}

### Test Cases to Requirements Traceability

{Traceability matrix from Phase 4}

### Code Changes to Test Cases Traceability

{Traceability matrix from Phase 4}

### Full Requirement Traceability Matrix

{Full traceability matrix from Phase 4}

---

## Related Deliverables

{Related deliverables from Phase 3}

---

## Artifact Links

{Artifact links from Phase 4}
```

### Step 3: Include Executive Summary Section

Include executive summary section:
- High-level overview
- Key highlights
- Scope summary

### Step 4: Include Requirements Section

Include requirements section:
- Requirements overview statistics
- Individual requirement details
- Links to code changes and test cases

### Step 5: Include Code Changes Section

Include code changes section:
- Code changes overview statistics
- Code changes grouped by requirement
- Links to detailed commit analysis files

### Step 6: Include Test Coverage Section

Include test coverage section (if test cases available):
- Test coverage overview statistics
- Test cases grouped by requirement
- Links to test case files

### Step 7: Include Affected Components Section

Include affected components section:
- List of affected components/modules
- Files changed per component
- Related requirements per component

### Step 8: Include Impact Analysis Section

Include impact analysis section:
- Overall impact assessment
- Impact analysis per requirement
- Affected areas and dependencies

### Step 9: Include Traceability Matrix Sections

Include all traceability matrix sections:
- Code changes to requirements traceability
- Test cases to requirements traceability
- Code changes to test cases traceability
- Full requirement traceability matrix

### Step 10: Include Related Deliverables Section

Include related deliverables section:
- Links to all generated deliverables
- Brief description of each deliverable
- Organization by type

### Step 11: Include Artifact Links Section

Include artifact links section:
- Links to all requirements files
- Links to all commit analysis files
- Links to all test case files
- Links to test plans, strategies, charters, risk registers

### Step 12: Use Proper Markdown Formatting

Use proper markdown formatting throughout:
- **Tables**: Use markdown table syntax for traceability matrices
- **Lists**: Use bullet points and numbered lists appropriately
- **Code Blocks**: Use code blocks for code snippets (if any)
- **Links**: Use markdown link syntax for all artifact links
- **Headers**: Use proper header hierarchy (H1, H2, H3)
- **Emphasis**: Use bold and italic for emphasis

### Step 13: Create Summary Index File

Create `release-notes-index.md`:

**File Structure:**
```markdown
# Release Notes Index

**Analysis Date**: {date}
**Requirements Analysis**: {folder name}
**Release Notes Generated**: {date}

## Summary
- **Total Requirements**: {count}
- **Requirements with Code Changes**: {count}
- **Requirements with Test Cases**: {count}
- **Total Commits**: {count}
- **Total PRs/MRs**: {count}
- **Total Test Cases**: {count}

## Release Notes
- [Main Release Notes](release-notes.md)

## Related Deliverables
- [Requirements Analysis](../requirements/requirements-index.md)
- [Commit Analysis](../commits/commits-index.md)
- [Test Cases](../test-cases/test-cases-index.md)
- [Test Plans](../test-plan/test-plan-index.md)
- [Test Strategies](../test-strategy/test-strategy-index.md)
- [Test Charters](../test-charter/test-charter-index.md)
- [Risk Registers](../risk-register/risk-register-index.md)
```

### Step 14: Write Files to Output Folder

Write all generated files to:
`agent-qa/YYYY-MM-DD-{folder-name}/release-notes/`

Ensure folder exists before writing files.

### Step 15: Output Confirmation

If file generation is successful, output:

```
✅ Release notes generated:
   - release-notes.md
   - release-notes-index.md
   - Location: agent-qa/YYYY-MM-DD-{folder-name}/release-notes/
```

### Step 16: Generate Output Index

Follow the instructions in `@agent-qa/commands/common/generate-output-index.md` to generate or update the `README.md` index file in the output folder.

### Step 17: Execute Post-Generation Hooks

Follow the instructions in `@agent-qa/commands/common/execute-post-hooks.md` to run any configured post-generation hooks.

## Important Constraints

- Follow markdown formatting standards
- Include all sections from Phase 3 and Phase 4
- Use proper markdown formatting (tables, lists, code blocks, links)
- Include all traceability links between artifacts
- Create summary index file
- Generate one release note per requirement analysis folder

## Error Handling

If file writing fails:
- Log error with context
- Continue writing other files
- Document failed files in output

Continue processing despite individual failures.

