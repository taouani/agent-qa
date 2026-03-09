# Generate Output Index (README.md)

## Purpose

Generate or update a `README.md` index file in the output folder (`agent-qa/YYYY-MM-DD-{context}/`) that summarizes all generated deliverables.

This instruction should be referenced at the END of every command's final phase to keep the index up to date.

## Workflow

### Step 1: Scan the output folder

List all subdirectories in the current output folder (`agent-qa/YYYY-MM-DD-{context}/`):

| Subfolder | Deliverable Type | Status |
|-----------|-----------------|--------|
| `requirements/` | Requirements Analysis | Check if exists |
| `test-cases/` | Test Cases | Check if exists |
| `test-strategy/` | Test Strategy | Check if exists |
| `test-charter/` | Test Charter | Check if exists |
| `test-plan/` | Test Plan | Check if exists |
| `risk-register/` | Risk Register | Check if exists |
| `release-notes/` | Release Notes | Check if exists |
| `commits/` | Commit Analysis | Check if exists |
| `gherkin/` | Gherkin Features | Check if exists |
| `playwright/` | Playwright Tests | Check if exists |

### Step 2: Count files per deliverable

For each existing subfolder, count the number of files (`.md`, `.csv`, `.feature`, `.ts`, `.html`).

### Step 3: Extract metadata

For each deliverable subfolder that exists, read the YAML front matter from the first markdown file to extract:
- `generated` timestamp
- `source_requirements` list
- `language` code

### Step 4: Generate README.md

Write `agent-qa/YYYY-MM-DD-{context}/README.md` with the following structure:

```markdown
---
type: output-index
generated: YYYY-MM-DD HH:MM
context: {context}
---

# Agent-QA Output: {context}

Generated on {date}.

## Deliverables

| Deliverable | Files | Source Requirements | Language | Generated |
|------------|-------|---------------------|----------|-----------|
| Requirements | {count} | — | {lang} | {timestamp} |
| Test Cases | {count} | {keys} | {lang} | {timestamp} |
| ... | ... | ... | ... | ... |

## Coverage

- **Requirements analyzed**: {count}
- **Test cases generated**: {count}
- **Gherkin features**: {count} (if exists)
- **Playwright specs**: {count} (if exists)
- **Confluence exports**: {count} (if exists)

## File Listing

### requirements/
- {file1.md}
- {file2.md}

### test-cases/
- {file1.md}
- {file1.csv}

(repeat for each existing subfolder)
```

### Step 5: Confirm index generation

Report to user: "Updated output index: `agent-qa/YYYY-MM-DD-{context}/README.md`"

## Constraints

- Only list deliverable subfolders that actually exist
- Skip empty subfolders
- If README.md already exists, overwrite it with fresh data
- Do not include the README.md itself in file counts
