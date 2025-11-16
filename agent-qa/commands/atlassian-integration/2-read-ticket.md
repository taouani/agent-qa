# PHASE 2: Read Individual Ticket (Requirement)

After MCP connection is established and `agent-qa/requirement/` folder is created, read individual Jira tickets by issue key or ID.

**Context**: This phase processes a single requirement (Jira ticket) and stores outputs in `agent-qa/requirement/` folder.

## Core Responsibilities

1. **Read Ticket by Key/ID**: Retrieve ticket using issue key (e.g., "PROJ-123") or numeric ID
2. **Extract Ticket Data**: Extract all standard fields, metadata, and custom fields
3. **Parse Acceptance Criteria**: Extract acceptance criteria from custom field or description
4. **Transform Data**: Transform MCP response to agent-qa-friendly format
5. **Store in Requirement Folder**: Save all extracted data and outputs to `agent-qa/requirement/` folder
6. **Handle Errors**: Gracefully handle non-existent tickets and other errors

## Workflow

### Step 1: Validate Input

Before calling MCP server, validate the ticket identifier:

- **Issue Key Format**: Validate format like "PROJ-123" (project key + hyphen + number)
- **Issue ID Format**: Validate numeric format
- Provide clear error if format is invalid

### Step 2: Call MCP Server Tool

Use `mcp_Atlassian_getJiraIssue` to retrieve the ticket:

**Parameters:**
- `cloudId`: Atlassian cloud ID (obtained from getAccessibleAtlassianResources)
- `issueIdOrKey`: Ticket key (e.g., "PROJ-123") or numeric ID

**Required Fields:**
- summary, description, status, issuetype
- assignee, reporter
- created, updated
- labels, components, fixVersions
- custom fields (all)

### Step 3: Extract Standard Fields

Extract the following standard fields from the response:

- **Basic Info**: summary, description, status, issue type
- **People**: assignee (accountId, displayName, emailAddress), reporter
- **Dates**: created date, updated date, resolution date (if resolved)
- **Organization**: labels array, components array, fix versions array, project key/name

### Step 4: Extract Custom Fields

- Retrieve all custom fields present in the ticket
- Preserve field names and values exactly as returned
- Handle cases where no custom fields exist

### Step 5: Extract Acceptance Criteria

Extract acceptance criteria using this priority:

1. **Check Custom Field**: Look for common acceptance criteria custom field names
   - Common names: "Acceptance Criteria", "Acceptance", "AC", "Acceptance Criteria (Text)"
   - Extract if found in custom fields

2. **Parse from Description**: If not in custom field, parse from description
   - Look for patterns like "Acceptance Criteria:", "AC:", "Given/When/Then"
   - Handle bullet points (•, -, *)
   - Handle numbered lists (1., 2., etc.)
   - Handle plain text formats

3. **Return Structured Format**: Return as array of criteria strings
   - Each criterion as separate string
   - Preserve formatting where possible

### Step 6: Store Data in Requirement Folder

Before transforming, ensure `agent-qa/requirement/` folder exists (created in Phase 1).

All outputs for this requirement should be stored in `agent-qa/requirement/`:
- Raw ticket data
- Extracted acceptance criteria
- Transformed data structures
- Any generated deliverables

### Step 7: Transform to Agent-QA Format

Transform the MCP server response to agent-qa-friendly format:

```javascript
{
  key: "PROJ-123",
  id: "12345",
  summary: "...",
  description: "...",
  status: "...",
  issueType: "...",
  assignee: { accountId: "...", displayName: "...", emailAddress: "..." },
  reporter: { accountId: "...", displayName: "...", emailAddress: "..." },
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
  resolutionDate: null,
  labels: ["label1", "label2"],
  components: [{ name: "Component1" }],
  fixVersions: [{ name: "v1.0" }],
  project: { key: "PROJ", name: "Project Name" },
  customFields: { ... },
  acceptanceCriteria: ["AC1", "AC2", "AC3"]
}
```

### Step 7: Handle Errors

Handle the following error scenarios:

- **Ticket Not Found**: Return clear error message with ticket key/ID
- **Invalid Format**: Return validation error before MCP call
- **MCP Server Error**: Return connection error with troubleshooting guidance
- **Network/Timeout**: Return timeout error with retry guidance

### Step 8: Store in Memory

Store the transformed ticket data in memory for use by other agent-qa commands:

- Use accessible data structure (object/array)
- Maintain data for downstream processing
- Support data access by other commands

### Step 9: Optional Debug Export

If debug mode is enabled:

- Export ticket data to markdown file
- Use filename format: `ticket-{key}.md` (e.g., `ticket-PROJ-123.md`)
- Follow agent-os markdown standards
- Include all metadata and relationships

## Important Constraints

- Support all Jira issue types (Epic, Story, Task, Bug, Sub-task, etc.)
- Acceptance criteria extraction must handle both custom field and description cases
- Error handling must be graceful and informative
- Data transformation must preserve all metadata
- Debug export is optional and disabled by default

## Output Format

On success, output:

```
✅ Ticket PROJ-123 retrieved successfully
✅ Acceptance criteria extracted: 3 items found
✅ Data stored in memory for processing

[Optional: Debug export created at ticket-PROJ-123.md]
```

On error, output:

```
❌ Error retrieving ticket PROJ-123: [error message]

[Error details and troubleshooting guidance]
```

