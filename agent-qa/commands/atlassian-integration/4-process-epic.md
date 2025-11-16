# PHASE 4: Process Epic and Child Stories

Process epic tickets and retrieve all linked child stories for hierarchical analysis.

**Context**: This phase can be used for both requirements and releases:
- If processing a single epic ticket: Store outputs in `agent-qa/requirement/` folder
- If processing epics within a filter/release: Store outputs in `agent-qa/release/` folder

## Core Responsibilities

1. **Identify Epic Tickets**: Detect epic tickets from issue type or custom fields
2. **Retrieve Child Stories**: Find and retrieve all stories linked to epic
3. **Process Nested Structures**: Handle epic → story → sub-task hierarchies
4. **Maintain Relationships**: Preserve parent-child relationships in data structure
5. **Handle Multiple Epics**: Process multiple epics in filter results

## Workflow

### Step 1: Identify Epic Ticket

Determine if a ticket is an epic:

- **Check Issue Type**: Issue type is "Epic"
- **Check Custom Field**: Look for epic link custom field (if needed)
- Handle epic identification reliably

### Step 2: Retrieve Child Stories (Dual Detection Method)

For each epic, find linked child stories using **both detection methods** to ensure complete coverage:

1. **Use Epic Link JQL Query**: Query for stories linked via Epic Link field
   - JQL: `"Epic Link" = PROJ-123`
   - Use `mcp_Atlassian_searchJiraIssuesUsingJql` with Epic Link JQL
   - Handle pagination for large result sets
   - Extract child story keys from query results
   - Store relationship type as "epic-link" for each child story
   - **Purpose**: Find stories linked to epic via Epic Link custom field (classic Jira projects)

2. **Use Parent-Child Relationship Query**: Query for child tickets via parent field
   - JQL: `parent = PROJ-123`
   - Use `mcp_Atlassian_searchJiraIssuesUsingJql` with parent JQL
   - Handle pagination for large result sets
   - Extract child story keys from query results
   - Store relationship type as "parent-child" for each child story
   - **Purpose**: Find child tickets linked via parent-child relationships (next-gen Jira projects)

3. **Combine Results from Both Methods**:
   - Merge results from Epic Link queries and parent-child queries
   - Remove duplicate child story keys (same ticket found by both methods)
   - Preserve relationship type information for each child story
   - If a child story is found by both methods, keep both relationship types
   - Ensure complete coverage from both methods
   - Handle cases where one method finds children the other doesn't

4. **Retrieve All Child Story Details**: Get complete details for all discovered child stories
   - For each unique child story key, use `mcp_Atlassian_getJiraIssue` to retrieve full ticket details
   - Handle pagination if needed
   - Process each story using ticket reading logic
   - Store child story data with relationship type information

### Step 3: Process Nested Structures (Recursive Hierarchy Processing)

For each child story, **recursively** discover and process all nested child tickets at multiple hierarchy levels:

1. **Recursive Child Discovery Function**:
   - Create recursive function to discover child tickets at any hierarchy level
   - Process epic → story relationships (level 1)
   - Process story → sub-task relationships (level 2)
   - Support deeper nesting levels automatically (level 3, 4, etc.)
   - Track hierarchy depth during recursion (epic=0, story=1, sub-task=2, deeper=3+)
   - Track visited tickets to prevent infinite recursion and circular references

2. **Recursive Processing Logic**:
   - For each child story found in Step 2:
     - Use **both detection methods** to find its children:
       - Epic Link query: `"Epic Link" = PROJ-124` (if story can have epic link)
       - Parent-child query: `parent = PROJ-124`
     - Combine results from both methods
     - For each discovered child ticket, recursively call the discovery function
     - Continue until no more children are found at any level
     - Track hierarchy depth: increment depth for each recursive level

3. **Build Complete Hierarchical Data Structure**: Create nested structure preserving all hierarchy levels:
   ```javascript
   {
     epic: {
       key: "PROJ-123",
       hierarchyLevel: 0,
       // ... epic ticket data
       children: [
         {
           story: {
             key: "PROJ-124",
             hierarchyLevel: 1,
             relationshipTypes: ["epic-link", "parent-child"], // Can have both
             // ... story ticket data
             children: [
               {
                 subTask: {
                   key: "PROJ-125",
                   hierarchyLevel: 2,
                   relationshipTypes: ["parent-child"],
                   // ... sub-task ticket data
                   children: [
                     // Deeper nesting levels automatically discovered
                     {
                       deeperLevel: {
                         key: "PROJ-126",
                         hierarchyLevel: 3,
                         relationshipTypes: ["parent-child"],
                         // ... deeper level ticket data
                         children: [] // Continue until no more children
                       }
                     }
                   ]
                 }
               }
             ]
           }
         }
       ]
     }
   }
   ```

4. **Prevent Infinite Recursion**:
   - Track visited ticket keys in a set
   - Skip tickets already visited to prevent circular references
   - Set maximum depth limit if needed (e.g., max depth 10) to prevent excessive recursion
   - Log warnings if maximum depth is reached

### Step 4: Handle Epics with No Children

If epic has no linked stories:

- Return epic with empty children array
- Log informative message: "Epic PROJ-123 has no linked stories"
- Allow downstream processing to handle empty children

### Step 5: Process Multiple Epics

When processing filter results containing multiple epics:

1. Identify all epic tickets in results
2. Process each epic independently
3. Retrieve child stories for each epic
4. Maintain epic context in final results

### Step 6: Maintain Relationship Metadata

Include comprehensive relationship information in data structure, supporting **both relationship types**:

- **Epic-Link Relationships**: 
  - Store Epic Link custom field values
  - Include relationship type "epic-link" in metadata
  - Maintain links between epic and child stories via Epic Link field
  - Preserve Epic Link field value in relationship metadata

- **Parent-Child Relationships**:
  - Store parent field values
  - Include relationship type "parent-child" in metadata
  - Maintain explicit parent/child references
  - Preserve parent field value in relationship metadata

- **Hierarchy Level**: Track depth in hierarchy
  - Epic = 0
  - Story = 1
  - Sub-task = 2
  - Deeper nesting = 3, 4, etc.
  - Store hierarchy level in each ticket's metadata

- **Relationship Type**: Support both types simultaneously
  - A ticket can have both "epic-link" and "parent-child" relationship types
  - Store relationship types as array: `relationshipTypes: ["epic-link", "parent-child"]`
  - Preserve all relationship information for complete traceability

- **Parent/Child References**: Maintain explicit links
  - Store parent ticket key reference
  - Store child ticket key references
  - Include bidirectional relationship information

### Step 7: Process Child Stories Through Requirements Analysis Workflow

After retrieving all child stories recursively, process each child story through the **full requirements analysis workflow (phases 5-8)**:

1. **Process Child Stories Through Phase 5 (Analyze Requirements)**:
   - For each child story at all hierarchy levels:
     - Extract child story details (summary, description, acceptance criteria)
     - Perform requirements extraction and structuring for child stories
     - Create requirement structures for each child story
     - Store child story requirements in memory
   - Follow Phase 5 instructions: `5-analyze-requirements.md`
   - Ensure child stories are included in requirement structures

2. **Process Child Stories Through Phase 6 (Analyze Linked Content)**:
   - For each child story:
     - Analyze linked content (linked issues, Confluence pages)
     - Retrieve and analyze linked issues referenced in child stories
     - Retrieve and analyze linked Confluence pages referenced in child stories
     - Integrate linked content into child story requirement structures
   - Follow Phase 6 instructions: `6-analyze-linked-content.md`
   - Ensure linked content is included in child story requirement structures

3. **Process Child Stories Through Phase 7 (Perform Quality Analysis)**:
   - For each child story:
     - Perform requirement completeness checks
     - Detect missing acceptance criteria
     - Generate completeness scores
     - Perform requirement quality scoring
   - Follow Phase 7 instructions: `7-perform-quality-analysis.md`
   - Ensure quality analysis is performed for child stories

4. **Process Child Stories Through Phase 8 (Generate Requirement Files)**:
   - For each child story:
     - Generate individual requirement markdown files
     - Format files according to agent-os standards
     - Include completeness and quality indicators
     - Write files to context folders (`agent-qa/requirement/` or `agent-qa/release/`)
   - Create summary index file including child stories
   - Follow Phase 8 instructions: `8-generate-requirement-files.md`
   - Ensure child story requirement files are generated

5. **Include Child Stories in Epic's Requirement Structure**:
   - Add child stories to epic's requirement structure
   - Maintain parent-child relationships in requirement structures
   - Preserve hierarchy in requirement data structures
   - Ensure child stories are accessible for downstream phases (9-23)
   - Store child story requirements with epic requirement structure

**Note**: Child stories are automatically processed through phases 5-8 as part of Phase 4 workflow. This ensures complete requirement analysis for all hierarchical tickets.

### Step 8: Store Hierarchical Data

Store epic with complete hierarchy in the appropriate folder:
- If processing single epic: Store in `agent-qa/requirement/` folder
- If processing epics in release: Store in `agent-qa/release/` folder

Store:
- Epic ticket data at root
- Child stories in children array (with all hierarchy levels)
- Sub-tasks nested within stories (and deeper nesting levels)
- All relationships preserved (both epic-link and parent-child)
- Child story requirement structures included in epic structure

### Step 9: Handle Errors

Handle the following error scenarios with **enhanced error handling for debugging**:

- **Epic Not Found**: 
  - Return error if epic ticket doesn't exist
  - Log detailed error: "Epic [key] not found: [error details]"
  - Include context: epic key, cloudId, error type

- **Epic with No Linked Stories** (NOT an error):
  - Do not consider this as an error
  - Log informative message: "Epic [key] has no linked stories"
  - Return epic with empty children array
  - Allow downstream processing to handle empty children
  - Continue processing normally

- **Inaccessible Child Stories**:
  - Detect when child stories cannot be retrieved (permissions, deleted, invalid)
  - Log detailed error information for debugging:
    - Error message: "Could not retrieve child story [key]: [error]"
    - Include context: child story key, parent epic key, error type (permissions, deleted, invalid)
    - Include error details from MCP tool response
  - Continue processing other child stories - do not fail entire process
  - Mark inaccessible child stories in data structures with error information:
    - Set `accessible: false`
    - Include `error` field with detailed error message
    - Include `childStoryKey` for reference

- **Missing or Invalid Epic Links**:
  - Detect missing or invalid epic links
  - Log validation errors for debugging:
    - Error message: "Invalid epic link detected: [link details]"
    - Include context: epic key, link type (epic-link or parent-child), error details
  - Continue processing with available links
  - Mark invalid links in data structures with error information

- **Large Hierarchy Processing Issues**:
  - Detect processing issues with large hierarchies
  - Log errors for debugging purposes:
    - Error message: "Processing issue with large hierarchy: [error]"
    - Include context: hierarchy size, processing step, error details
  - Continue processing despite errors
  - Provide informative error messages for debugging

- **MCP Server Error**: 
  - Return connection error
  - Log detailed error: "MCP server error: [error details]"
  - Include context: cloudId, tool name, error type

- **Circular References**: 
  - Detect circular relationships (handled by visited tickets tracking in Step 3)
  - Log warning: "Circular reference detected: [ticket keys involved]"
  - Skip circular references to prevent infinite recursion
  - Continue processing other tickets

- **Process Continuation**:
  - Verify process continues when individual child stories fail
  - Verify process continues when queries fail
  - Verify all accessible child stories are processed
  - Ensure epic structures are updated even with partial failures
  - Ensure requirement structures are updated even with partial failures

### Step 10: Optional Debug Export

If debug mode is enabled:

- Export epic with hierarchy to markdown file
- Use filename format: `epic-{key}.md` (e.g., `epic-PROJ-123.md`)
- Show hierarchy structure clearly
- Include all child tickets
- Follow agent-os markdown standards

## Important Constraints

- **Dual Detection Method**: Use both Epic Link JQL queries and parent-child relationships for detection
- **Recursive Processing**: Support nested structures (epic → story → sub-task → deeper nesting) with recursive search
- **Multiple Hierarchy Levels**: Handle multiple hierarchy levels automatically, search recursively if possible
- **Relationship Types**: Support both epic-link and parent-child relationship types simultaneously
- **Requirements Analysis**: Process child stories through full requirements analysis workflow (phases 5-8)
- **Relationship Preservation**: Maintain relationship context in all data structures with both relationship types
- **Hierarchy Tracking**: Track hierarchy depth (epic=0, story=1, sub-task=2, etc.) in all data structures
- **Error Handling**: Epic with no linked stories is not an error; log errors for debugging without failing process
- **Process Continuation**: Continue processing accessible child stories despite errors
- **Context-Aware**: Store child story data in context-aware folders (`agent-qa/requirement/` or `agent-qa/release/`)
- **Context-Aware Terminology**: Use context-aware terminology ("requirement" vs "release") for child stories
- **Handle Epics with No Children**: Handle epics with no children gracefully (not an error)
- **Process Multiple Epics**: Process multiple epics independently
- **Preserve All Relationship Metadata**: Preserve all relationship metadata including both relationship types
- **Backward Compatibility**: Maintain backward compatibility with existing Phase 4 functionality

## Output Format

On success, output:

```
✅ Epic PROJ-123 processed successfully
✅ Retrieved 5 child stories (via Epic Link: 4, via parent-child: 3, duplicates: 2)
✅ Retrieved 12 sub-tasks across stories (recursive search completed)
✅ Processed child stories through requirements analysis workflow (phases 5-8)
✅ Generated requirement files for all child stories
✅ Hierarchical structure stored in memory (max depth: 3)
✅ Relationship metadata preserved (epic-link and parent-child)

[Optional: Debug export created at epic-PROJ-123.md]
```

On epic with no children, output:

```
ℹ️ Epic PROJ-123 has no linked stories (not an error)
✅ Epic data stored (children array empty)
✅ Epic will proceed through requirements analysis workflow
```

On partial success (some child stories inaccessible), output:

```
✅ Epic PROJ-123 processed with partial success
✅ Retrieved 4 child stories successfully
⚠️ 1 child story inaccessible: PROJ-125 (permissions error - logged for debugging)
✅ Retrieved 10 sub-tasks across accessible stories
✅ Processed accessible child stories through requirements analysis workflow (phases 5-8)
✅ Hierarchical structure stored in memory
✅ Process continued despite errors

[Error details logged for debugging: child story PROJ-125 - permissions error]
```

On error, output:

```
❌ Error processing epic PROJ-123: [error message]

[Error details and troubleshooting guidance]
[Context: epic key, cloudId, error type, processing step]
```

