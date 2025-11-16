# PHASE 5: Analyze Requirements

After tickets are retrieved via previous phases, extract and structure requirements from ticket data with flexible, simple format optimized for LLM consumption.

**Context**: This phase processes ticket data already retrieved and transforms it into requirement structures stored in memory for downstream phases.

## Core Responsibilities

1. **Extract Requirements**: Extract all ticket fields and metadata into requirement structure
2. **Structure Requirements**: Create flexible, simple data structures optimized for LLM
3. **Extract Acceptance Criteria**: Extract acceptance criteria from custom fields or description
4. **Transform Data**: Transform ticket data to requirement structure while preserving all information
5. **Store in Memory**: Store requirement structures in memory for downstream processing

## Workflow

### Step 1: Access Ticket Data

Access ticket data from previous phases:
- For single tickets: Use data from Phase 2 (Read Individual Ticket)
- For filters: Use data from Phase 3 (Process Jira Filter)
- For epics: Use data from Phase 4 (Process Epic and Child Stories)

Ensure ticket data is available before proceeding.

### Step 2: Extract All Ticket Fields

Extract all available ticket fields and metadata:
- **Basic Fields**: key, id, summary, description, status, issueType
- **People Fields**: assignee, reporter (with accountId, displayName, emailAddress)
- **Temporal Fields**: created, updated, resolutionDate
- **Organizational Fields**: labels, components, fixVersions, project
- **Custom Fields**: All custom fields with original names and values preserved
- **Metadata**: Any additional metadata from ticket

Preserve original field names and values exactly as returned from MCP server.

### Step 3: Extract Acceptance Criteria

Extract acceptance criteria using this priority:

1. **Check Custom Fields**: Look for common acceptance criteria custom field names
   - Common names: "Acceptance Criteria", "Acceptance", "AC", "Acceptance Criteria (Text)"
   - Extract if found in custom fields
   - Preserve original formatting

2. **Parse from Description**: If not in custom field, parse from description
   - Look for patterns like "Acceptance Criteria:", "AC:", "Given/When/Then"
   - Handle bullet points (•, -, *)
   - Handle numbered lists (1., 2., etc.)
   - Handle plain text formats
   - Extract all criteria found

3. **Flag Missing AC**: If no acceptance criteria found
   - Set flag: `missingAcceptanceCriteria: true`
   - Do not fail - continue processing gracefully
   - Include flag in requirement structure

4. **Return Structured Format**: Return as array of criteria strings
   - Each criterion as separate string
   - Preserve formatting where possible

### Step 4: Structure Requirement Data Objects

Create flexible, simple requirement structure optimized for LLM consumption:

```javascript
{
  // Basic identification
  key: "PROJ-123",
  id: "12345",
  
  // Core requirement data
  summary: "...",
  description: "...",
  status: "...",
  issueType: "...",
  
  // People
  assignee: { accountId: "...", displayName: "...", emailAddress: "..." },
  reporter: { accountId: "...", displayName: "...", emailAddress: "..." },
  
  // Temporal
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
  resolutionDate: null,
  
  // Organizational
  labels: ["label1", "label2"],
  components: [{ name: "Component1" }],
  fixVersions: [{ name: "v1.0" }],
  project: { key: "PROJ", name: "Project Name" },
  
  // Acceptance criteria
  acceptanceCriteria: ["AC1", "AC2", "AC3"],
  missingAcceptanceCriteria: false,
  
  // Custom fields (preserve all)
  customFields: {
    "Custom Field Name": "value",
    // ... all custom fields
  },
  
  // All original fields preserved
  originalData: { /* full ticket data */ }
}
```

**Key Principles:**
- Simple, flat structure where possible
- Preserve all original data
- Use clear, descriptive field names
- Optimize for LLM readability and analysis
- Avoid nested complexity unless necessary

### Step 5: Handle Multiple Tickets

If processing multiple tickets (from filter or epic):
- Process each ticket individually
- Create requirement structure for each ticket
- Store in array: `requirements: [requirement1, requirement2, ...]`
- Maintain ticket relationships (will be enhanced in Phase 6)

### Step 6: Store Requirements in Memory

Store requirement structures in memory:
- For single tickets: Store single requirement object
- For filters/releases: Store array of requirement objects
- Make accessible to downstream phases
- Preserve all data for relationship tracking (Phase 6)

### Step 7: Output Confirmation

Output confirmation of requirements extracted:

```
✅ Requirements extracted: [count] requirement(s)
✅ Acceptance criteria extracted: [count] criteria found
⚠️ Missing AC flagged: [count] requirement(s) without acceptance criteria
✅ Requirement structures created and stored in memory
```

## Important Constraints

- Preserve all original ticket data - do not lose information
- Use flexible structure - avoid rigid templates
- Optimize for LLM consumption - simple, clear, readable
- Handle missing acceptance criteria gracefully - flag, don't fail
- Support both single tickets and multiple tickets
- Maintain data integrity during transformation

