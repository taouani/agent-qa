# Specification: Confluence Page Analysis

## Goal

Enhance Phase 6 of the Atlassian integration workflow to use the `getConfluencePage` tool from Atlassian MCP for retrieving requirement documentation from Confluence pages linked in Jira tickets, extracting all content for general analysis, and integrating the extracted content into requirement structures for comprehensive requirement context.

## User Stories

- As a QA Analyst, I want Confluence pages linked in Jira tickets automatically retrieved and analyzed so that I have complete requirement documentation without manual investigation
- As a QA Manager, I want all Confluence content extracted and integrated into requirement structures so that I can ensure comprehensive requirement context for test generation
- As a Release Manager, I want Confluence page content included in requirement analysis so that I have full traceability from documentation to requirements

## Specific Requirements

**Workflow Integration**
- Enhance existing Phase 6 (`6-analyze-linked-content.md`) workflow in the Atlassian integration command
- Use `mcp_Atlassian_getConfluencePage` tool from Atlassian MCP server for retrieving Confluence pages
- Integrate seamlessly into existing Phase 6 workflow without breaking changes
- Process Confluence pages linked from Jira tickets (detected in Phase 6)
- Store extracted content in requirement structures in memory

**MCP Tool Integration**
- Use `mcp_Atlassian_getConfluencePage` tool for retrieving Confluence page content
- Pass `cloudId` (from Phase 1) and `pageId` (extracted from ticket links) to the tool
- Handle tool responses (page content returned as Markdown format)
- Support both enhance Phase 6 and standalone capability (primary focus on Phase 6 enhancement)

**Page Detection**
- Only analyze pages explicitly linked in Jira tickets
- Detect Confluence page references from ticket descriptions (URLs)
- Detect Confluence page references from custom fields
- Extract page IDs from Confluence URLs (pattern: `https://[site].atlassian.net/wiki/spaces/[space]/pages/[pageId]/[title]`)
- Collect unique page references (remove duplicates)

**Content Extraction**
- Extract all content from Confluence pages for general analysis
- Extract raw content only (no advanced parsing or structured extraction)
- Extract all details to add to the context for requirement analysis
- Preserve page content as returned by MCP tool (Markdown format)
- Include page title and metadata when available

**Content Integration**
- Integrate extracted Confluence content into requirement structures (as Phase 6 currently does)
- Add Confluence page content to requirement data objects in memory
- Include page ID, title, and full content in requirement structure
- Maintain link between requirement and Confluence page
- Store content for use in downstream phases (requirements analysis, test generation)

**Error Handling**
- Handle errors for debugging purposes, do not fail the entire process
- Log errors when Confluence pages cannot be retrieved (permissions, deleted pages, invalid references)
- Continue processing other pages even if some fail
- Mark inaccessible pages in requirement structure with error information
- Provide informative error messages for debugging

**Data Processing and Storage**
- Process Confluence pages in memory during Phase 6
- Store extracted content in requirement structures
- Maintain requirement-to-Confluence-page relationships
- Support data access patterns for downstream commands (phases 5-8, 9-11, etc.)
- Do not create separate Confluence page analysis files

**Command Structure Integration**
- Enhance existing Phase 6 instruction file (`6-analyze-linked-content.md`)
- Follow agent-os command patterns and workflow structure
- Comply with agent-os standards and conventions
- Maintain backward compatibility with existing Phase 6 functionality

## Visual Design

No visual assets provided.

## Existing Code to Leverage

**Phase 6 - Analyze Linked Content**
- Enhance existing `agent-qa/commands/atlassian-integration/6-analyze-linked-content.md` workflow
- Leverage existing Confluence page detection logic (Step 4)
- Enhance existing Confluence page retrieval logic (Step 5) to use `getConfluencePage` tool
- Enhance existing Confluence content analysis logic (Step 7) to extract all content
- Follow existing error handling patterns from Phase 6

**Requirements Analysis Engine**
- Leverage requirement structure patterns from phases 5-8
- Use existing data structure patterns for storing Confluence content
- Follow integration patterns for multi-source data combination

**Atlassian MCP Server Integration**
- Use existing MCP connection from Phase 1
- Use `cloudId` from Phase 1 for MCP tool calls
- Follow existing MCP tool usage patterns

**Agent-OS Command Structure Patterns**
- Reference `/Users/taouani/Projects/ai-agents/agent-os` for workflow enhancement patterns
- Follow numbered instruction file structure (enhance existing Phase 6)
- Use workflow integration patterns from existing agent-os commands
- Adopt error handling patterns from agent-os standards
- Follow data processing patterns from agent-os workflows

**Error Handling Standards**
- Follow error handling patterns from `agent-os/standards/global/error-handling.md`
- Use consistent error message formatting from Phase 6
- Apply validation patterns from `agent-os/standards/global/validation.md`
- Follow graceful degradation patterns for missing data

## Out of Scope

- Analyzing pages not linked from Jira tickets (standalone analysis - mentioned as "both" but primary focus is Phase 6 enhancement)
- Advanced content parsing or structured extraction (extract raw content only)
- Quality analysis of Confluence content
- Extracting relationships or dependencies from Confluence pages
- Creating separate Confluence page analysis files
- Analyzing pages by space key, page ID, URL, or search independently
- Identifying requirements, acceptance criteria, or specifications from Confluence content (raw extraction only)
- Linking Confluence content back to Jira tickets (already linked via ticket references)
- Handling large pages with special processing (process as-is)
- Complex formatting or embedded content extraction (use raw Markdown from MCP tool)

