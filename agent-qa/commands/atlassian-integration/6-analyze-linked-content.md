# PHASE 6: Analyze Linked Content

Retrieve and analyze linked issues and Confluence pages referenced in tickets to gather complete requirement context from multiple sources.

**Context**: This phase enhances requirements with data from linked issues and Confluence pages, combining multi-source information into unified requirement structures.

## Core Responsibilities

1. **Detect Linked Content**: Identify linked issues and Confluence page references in ticket data
2. **Retrieve Linked Issues**: Use Atlassian MCP to retrieve linked issue details
3. **Retrieve Confluence Pages**: Use Atlassian MCP to retrieve Confluence page content
4. **Analyze Linked Content**: Extract relevant information from linked sources
5. **Combine Multi-Source Data**: Integrate linked content into requirement structures
6. **Handle Errors Gracefully**: Continue processing even when linked content is inaccessible

## Workflow

### Step 1: Access Requirement Data

Access requirement structures from Phase 5:
- Requirements already extracted and structured
- Ticket data available for analysis
- Ready to enhance with linked content

### Step 2: Detect Linked Issues

For each requirement, detect linked issues:

1. **Check Issue Links Field**: Look for `issuelinks` or `issueLinks` field in ticket data
   - Identify outward links (outwardIssue)
   - Identify inward links (inwardIssue)
   - Extract issue keys/IDs from links

2. **Check Description for References**: Parse description for ticket key patterns
   - Look for patterns like "PROJ-123", "PROJ-456"
   - Extract referenced ticket keys
   - Handle multiple references

3. **Check Custom Fields**: Look for custom fields containing issue references
   - Some custom fields may contain linked issue keys
   - Extract references from custom field values

4. **Collect All Linked Issue Keys**: Create list of unique linked issue keys
   - Remove duplicates
   - Validate format (PROJ-123 or numeric ID)

### Step 3: Retrieve Linked Issue Details

For each linked issue key found:

1. **Call MCP Server**: Use `mcp_Atlassian_getJiraIssue` to retrieve linked issue
   - Parameters: `cloudId` (from Phase 1), `issueIdOrKey` (linked issue key)
   - Request all fields needed for requirement context

2. **Handle Retrieval Success**: If linked issue retrieved successfully
   - Extract relevant information (summary, description, status, type)
   - Store linked issue data
   - Continue to next linked issue

3. **Handle Retrieval Failure**: If linked issue cannot be retrieved
   - Log error: "Could not retrieve linked issue [key]: [error]"
   - Continue processing - do not fail entire process
   - Mark linked issue as inaccessible in requirement structure

4. **Process in Batch**: If multiple linked issues, process efficiently
   - Retrieve all accessible linked issues
   - Continue even if some fail

### Step 4: Detect Confluence Page References

For each requirement, detect Confluence page references:

1. **Check Description**: Look for Confluence page URLs or links
   - Pattern: `https://[site].atlassian.net/wiki/spaces/[space]/pages/[pageId]/[title]`
   - Extract page IDs from URLs
   - Extract space keys if available

2. **Check Custom Fields**: Look for custom fields containing Confluence links
   - Some fields may contain Confluence page references
   - Extract page IDs or URLs

3. **Check Issue Links**: Some issue links may point to Confluence pages
   - Identify Confluence page links
   - Extract page identifiers

4. **Collect All Page References**: Create list of unique Confluence page references
   - Remove duplicates
   - Extract page IDs for MCP calls

### Step 5: Retrieve Confluence Page Content

For each Confluence page reference found:

1. **Call MCP Server**: Use `mcp_Atlassian_getConfluencePage` tool to retrieve page
   - **Tool**: `mcp_Atlassian_getConfluencePage`
   - **Parameters**: 
     - `cloudId`: Use cloudId from Phase 1 (MCP connection initialization)
     - `pageId`: Use pageId extracted from Confluence URL in Step 4
   - **Response**: Page content will be returned as Markdown format
   - **Purpose**: Retrieve requirement documentation from Confluence pages linked in Jira tickets

2. **Handle Retrieval Success**: If page retrieved successfully
   - Extract page content (already in Markdown format from MCP tool)
   - Extract page title from tool response (when available)
   - Extract page metadata from tool response (when available)
   - Store Confluence content with full page content
   - Continue to next page

3. **Handle Retrieval Failure**: If page cannot be retrieved
   - **Log detailed error for debugging**:
     - Error message: "Could not retrieve Confluence page [pageId]: [error]"
     - Include context: pageId, cloudId, error type (permissions, deleted, invalid reference)
     - Include error details from MCP tool response
   - **Continue processing** - do not fail entire process
   - **Mark Confluence page as inaccessible** in requirement structure with error information:
     - Set `accessible: false`
     - Include `error` field with detailed error message
     - Include `pageId` for reference
   - **Process next page** - continue with remaining pages

4. **Process in Batch**: If multiple pages, process efficiently
   - Retrieve all accessible pages
   - Continue even if some fail
   - Track success/failure counts for debugging

### Step 6: Analyze Linked Issues

For each successfully retrieved linked issue:

1. **Extract Relevant Information**:
   - Summary and description
   - Status and issue type
   - Key relationships or dependencies
   - Any relevant custom fields

2. **Determine Relationship Context**:
   - How does this linked issue relate to the requirement?
   - Is it a dependency, related issue, or reference?
   - Store relationship context

3. **Include in Requirement Structure**:
   - Add `linkedIssues` array to requirement
   - Include linked issue key, summary, status, and relevant data
   - Preserve relationship context

### Step 7: Analyze Confluence Content

For each successfully retrieved Confluence page:

1. **Extract All Content (Raw Content Only)**:
   - Extract all content from Confluence page for general analysis
   - Extract all details to add to the context for requirement analysis
   - Preserve page content as returned by MCP tool (Markdown format)
   - Do not perform advanced parsing or structured extraction
   - Do not extract specific sections or parse for requirement details
   - Include full raw content for comprehensive context

2. **Include Page Metadata**:
   - Extract page ID from tool response
   - Extract page title from tool response (when available)
   - Include any additional metadata from tool response (when available)
   - Store metadata with page content

3. **Include in Requirement Structure**:
   - Add `confluencePages` array to requirement
   - Include page ID, title (when available), and full content
   - Store complete raw page content for context
   - Maintain link between requirement and Confluence page
   - Ensure content is accessible for downstream phases (requirements analysis, test generation)

### Step 8: Extract Dependencies and Relationships

For each requirement, extract dependency and relationship information:

1. **Extract Explicit Dependencies**:
   - Check `issuelinks` field for "depends on" relationships
   - Check `issuelinks` field for "blocks" relationships
   - Extract dependency information from link fields
   - Store with clear relationship type

2. **Extract Standard Relationships**:
   - Parent-child relationships: Check `parent` field or epic hierarchy
   - Link relationships: Check "relates to" links
   - Extract from ticket hierarchy and link fields

3. **Extract Custom Relationships**:
   - Check custom fields for relationship data
   - Identify custom fields containing relationship information
   - Extract relationship information from custom field values
   - Preserve custom relationship type names

4. **Structure Relationship Data**:
   - Store relationships with source and target ticket references
   - Include relationship type (standard or custom)
   - Maintain relationship context

5. **Combine All Relationship Types**:
   - Merge standard and custom relationships
   - Create unified relationship structure
   - Include in requirement data objects

### Step 9: Combine Multi-Source Data

Enhance requirement structure with linked content, dependencies, and relationships:

```javascript
{
  // ... existing requirement fields from Phase 5 ...
  
  // Dependencies (explicit links only)
  dependencies: [
    {
      type: "depends on",
      targetKey: "PROJ-456",
      targetSummary: "Dependency issue summary",
      accessible: true
    },
    {
      type: "blocks",
      targetKey: "PROJ-789",
      accessible: false,
      error: "Could not retrieve dependency"
    }
  ],
  
  // Relationships (standard and custom)
  relationships: [
    {
      type: "parent-child",
      direction: "child",
      relatedKey: "PROJ-100",
      relatedSummary: "Parent epic",
      accessible: true
    },
    {
      type: "relates to",
      relatedKey: "PROJ-200",
      accessible: true
    },
    {
      type: "custom-relationship-type",  // From custom field
      relatedKey: "PROJ-300",
      accessible: true
    }
  ],
  
  // Linked issues
  linkedIssues: [
    {
      key: "PROJ-456",
      summary: "Related issue summary",
      status: "In Progress",
      issueType: "Task",
      relationship: "relates to",
      accessible: true
    },
    {
      key: "PROJ-789",
      accessible: false,
      error: "Could not retrieve linked issue"
    }
  ],
  
  // Confluence pages (all raw content extracted)
  confluencePages: [
    {
      pageId: "123456789",
      title: "Requirements Document",  // From MCP tool response when available
      content: "# Requirements\n\n[Full raw Markdown content from MCP tool]\n\n...",  // All content, raw format
      accessible: true
    },
    {
      pageId: "987654321",
      accessible: false,
      error: "Could not retrieve Confluence page [pageId]: [detailed error message with context]",
      errorType: "permissions|deleted|invalid_reference"  // Error type for debugging
    }
  ]
}
```

### Step 10: Output Confirmation

Output confirmation of linked content and relationship analysis:

```
✅ Dependencies detected: [count] dependency/dependencies
✅ Relationships detected: [count] relationship(s)
✅ Linked issues detected: [count] issue(s)
✅ Linked issues retrieved: [successful] of [total]
⚠️ Inaccessible linked issues: [failed] issue(s)
✅ Confluence pages detected: [count] page(s)
✅ Confluence pages retrieved: [successful] of [total]
⚠️ Inaccessible Confluence pages: [failed] page(s)
✅ Multi-source data combined into requirement structures
✅ Dependencies and relationships extracted and stored
```

## Important Constraints

- Extract dependencies from explicit links only - do not infer from fix versions, components, or labels
- Extract both standard and custom relationship types
- Continue processing even when linked content is inaccessible
- **Error Handling**: Log detailed errors for debugging purposes, but do not fail entire process
  - Include error context (pageId, cloudId, error type) in error messages
  - Mark inaccessible pages/issues in requirement structure with error information
  - Continue processing remaining pages/issues even when some fail
- Process linked issues and Confluence pages efficiently
- Preserve relationship context from linked issues
- **Confluence Content**: Extract all raw content from Confluence pages (no parsing or structured extraction)
  - Use `mcp_Atlassian_getConfluencePage` tool for retrieval
  - Preserve page content as returned by MCP tool (Markdown format)
  - Include full raw content for comprehensive requirement context
  - Extract all details to add to context for requirement analysis
- Handle missing or invalid references gracefully
- Store relationships with source and target references
- Do not handle circular dependencies (out of scope)

