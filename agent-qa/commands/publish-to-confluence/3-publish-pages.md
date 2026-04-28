# Phase 3: Publish Pages

## Core Responsibilities

- Check Confluence publishing configuration
- Publish converted pages via Atlassian MCP (if configured)
- Generate publication report

## Workflow Steps

### Step 1: Check Publishing Configuration

Verify the Confluence publishing settings from Phase 1:

- If `publishing_enabled` is `false` (either `confluence_space_key` or `confluence_parent_page_id` is empty):
  - Skip publishing
  - Inform the user: "Confluence publishing is not configured. Your `.confluence.html` files are ready for manual upload."
  - List all generated `.confluence.html` files with their paths
  - Proceed to Step 4 (report generation)

- If `publishing_enabled` is `true`:
  - Proceed to Step 2

### Step 2: Validate MCP Availability

Check if the Atlassian MCP server supports page creation:

1. Verify `mcp_Atlassian_confluence_create_page` or equivalent tool is available
2. If the tool is NOT available:
   - Inform the user: "Atlassian MCP does not support page creation. Your `.confluence.html` files are ready for manual upload."
   - List all generated files
   - Proceed to Step 4
3. If the tool IS available:
   - Proceed to Step 3

### Step 3: Create/Update Confluence Pages

For each `.confluence.html` file generated in Phase 2:

1. **Determine page title**: Use the deliverable type and context
   - Format: `[Agent-QA] {Deliverable Type} - {Context}`
   - Example: `[Agent-QA] Test Cases - PROJ-123`

2. **Check for existing page**: Search for a page with the same title in the configured space
   - Use `mcp_Atlassian_confluence_search` with CQL: `title = "{page_title}" AND space = "{space_key}"`

3. **Create or update**:
   - If page exists: Update the page content using MCP
   - If page does not exist: Create a new page under `confluence_parent_page_id`

4. **Record result**: Store the page URL, title, and status (created/updated/failed)

5. **Error handling**:
   - If a single page fails, log the error and continue with remaining pages
   - Do NOT stop the entire process due to one failed page

### Step 4: Generate Publication Report

Generate a summary report and present to the user:

```markdown
## Confluence Publication Report

**Output Folder**: agent-qa/YYYY-MM-DD-{context}/
**Space**: {confluence_space_key}
**Parent Page**: {confluence_parent_page_id}

### Published Pages

| Deliverable | Status | URL |
|-------------|--------|-----|
| Test Cases - PROJ-123 | Created | https://... |
| Test Strategy | Updated | https://... |
| Risk Register | Failed (permission denied) | - |

### Local Files

| File | Path |
|------|------|
| PROJ-123-test-cases.confluence.html | test-cases/ |
| test-strategy.confluence.html | test-strategy/ |
```

If publishing was skipped, show only the local files section.

## Constraints

- Only publish if BOTH `confluence_space_key` and `confluence_parent_page_id` are configured
- Never delete existing Confluence pages
- Always generate the publication report regardless of publishing status
- Follow MCP usage patterns from `.claude/rules/mcp-usage.md`
