# PHASE 5: Extract and Structure Requirements

Extract and structure requirements from ticket data with flexible, simple format optimized for LLM consumption.

## Core Responsibilities

1. **Extract All Fields**: Extract all ticket fields and metadata
2. **Extract Acceptance Criteria**: Extract acceptance criteria from custom fields or description
3. **Structure Requirements**: Create flexible, simple data structures
4. **Store in Memory**: Store requirement structures in memory

## Workflow

### Step 1: Extract All Ticket Fields

For each issue, extract:
- Basic fields: key, id, summary, description, status, issueType
- People fields: assignee, reporter
- Temporal fields: created, updated
- Organizational fields: labels, components, fixVersions, project
- Custom fields: All custom fields with original names

### Step 2: Extract Acceptance Criteria

For each issue:
1. Check custom fields for acceptance criteria field
2. If not found, parse from description
3. Return as array of criteria strings

### Step 3: Structure Requirements

Create requirement structure for each issue:

```javascript
{
  key: "...",
  summary: "...",
  description: "...",
  status: "...",
  issueType: "...",
  acceptanceCriteria: [...],
  linkedIssues: [...],
  confluencePages: [...],
  // ... all other fields
}
```

### Step 4: Store in Memory

Store all requirement structures in memory for subsequent phases.

## Important Constraints

- Preserve all original field names and values
- Handle missing acceptance criteria gracefully
- Create flexible, simple structures optimized for LLM

