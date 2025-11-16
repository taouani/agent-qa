# Atlassian MCP Server Integration Command

You are helping to integrate agent-qa with the Atlassian MCP server to enable read-only access to Jira tickets, filters, and related data for requirements analysis and test deliverable generation.

This command follows a multi-phase process to integrate with Atlassian MCP server and provide Jira data access capabilities.

**IMPORTANT: Context-Aware Folder Creation**
- If invoked with a **single Jira issue ID/key**: Create `agent-qa/requirement/` folder
- If invoked with a **Jira filter**: Create `agent-qa/release/` folder
- Use context-aware terminology: "requirement" for single tickets, "release" for filters

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

# PHASE 1: Initialize MCP Connection and Create Context Folder

The FIRST STEP is to initialize the MCP server connection, validate availability, and create the appropriate context folder based on input type.

Follow the instructions in: `1-initialize-mcp-connection.md`

# PHASE 2: Read Individual Ticket (Requirement)

After MCP connection is established and requirement folder created, read individual Jira tickets.

Follow the instructions in: `2-read-ticket.md`

# PHASE 3: Process Jira Filter (Release)

Process Jira filters to retrieve multiple tickets matching a filter or JQL query. Creates release folder.

Follow the instructions in: `3-process-filter.md`

# PHASE 4: Process Epic and Child Stories

Process epic tickets and retrieve their linked child stories for hierarchical analysis.

Follow the instructions in: `4-process-epic.md`

# PHASE 5: Analyze Requirements

After tickets are retrieved, extract and structure requirements from ticket data with flexible, simple format optimized for LLM consumption.

Follow the instructions in: `5-analyze-requirements.md`

# PHASE 6: Analyze Linked Content

Retrieve and analyze linked issues and Confluence pages referenced in tickets to gather complete requirement context.

Follow the instructions in: `6-analyze-linked-content.md`

# PHASE 7: Perform Quality Analysis

Perform requirement completeness checks, missing acceptance criteria detection, and quality scoring.

Follow the instructions in: `7-perform-quality-analysis.md`

# PHASE 8: Generate Requirement Files

Generate individual requirement markdown files and summary index file in the appropriate context folder.

Follow the instructions in: `8-generate-requirement-files.md`

# PHASE 9: Generate Test Cases

After requirements are analyzed and structured, generate comprehensive test cases from requirement structures including positive, negative, and edge cases.

Follow the instructions in: `9-generate-test-cases.md`

# PHASE 10: Generate Test Case Files

Generate markdown files for test cases grouped by requirement with proper formatting and structure.

Follow the instructions in: `10-generate-test-case-files.md`

# PHASE 11: Generate Traceability Matrix

Generate CSV export for Xray import and create traceability matrix showing requirement-to-test-case mapping.

Follow the instructions in: `11-generate-traceability-matrix.md`

# PHASE 12: Generate Test Charters

After requirements are analyzed and structured, generate exploratory test charters including mission/goal, scope (in/out), and areas to explore from requirement structures.

Follow the instructions in: `12-generate-test-charters.md`

# PHASE 13: Generate Charter Details

Generate test approach (exploratory testing techniques and session-based testing), risks, resource requirements, and time estimates for test charters.

Follow the instructions in: `13-generate-charter-details.md`

# PHASE 14: Generate Charter Files

Generate markdown files for test charters grouped by requirement or release with proper formatting and structure.

Follow the instructions in: `14-generate-charter-files.md`

# PHASE 15: Generate Test Strategy Foundation

After requirements are analyzed and structured, generate test strategy foundation including test levels (Integration, System, UAT) and test types identification from requirement structures.

Follow the instructions in: `15-generate-test-strategy-foundation.md`

# PHASE 16: Generate Strategy Details

Generate test design techniques, automation approach (high-level guidance with Playwright), and metrics definition for test strategies.

Follow the instructions in: `16-generate-strategy-details.md`

# PHASE 17: Generate Strategy Files

Generate markdown files for test strategies grouped by requirement or release with proper formatting and structure.

Follow the instructions in: `17-generate-strategy-files.md`

# PHASE 18: Identify Risks

After requirements, test strategies, and test charters are generated, identify risks from all sources including requirements, test strategies, and test charters.

Follow the instructions in: `18-identify-risks.md`

# PHASE 19: Analyze and Score Risks

Categorize risks based on context, score risks using predefined scales (probability and impact), prioritize risks by risk score, and generate ownership suggestions.

Follow the instructions in: `19-analyze-and-score-risks.md`

# PHASE 20: Generate Risk Register Files

Generate markdown files for risk registers grouped by requirement or release with proper formatting and structure, prioritized by risk score.

Follow the instructions in: `20-generate-risk-register-files.md`

# PHASE 21: Generate Test Plan Foundation

After requirements, test cases, test strategies, and test charters are generated, generate test plan foundation including executive summary, test objectives (derived from test cases/test strategies), and scope (based on requirements analyzed and test cases generated).

Follow the instructions in: `21-generate-test-plan-foundation.md`

# PHASE 22: Generate Test Plan Details

Generate test strategy integration (reference/link), environment requirements (high-level guidance), schedules (time estimates/ranges with milestones and phases), and entry/exit criteria.

Follow the instructions in: `22-generate-test-plan-details.md`

# PHASE 23: Generate Test Plan Files

Generate markdown files for test plans grouped by requirement or release with proper formatting and structure, including deliverables listing and referencing.

Follow the instructions in: `23-generate-test-plan-files.md`

## User Standards & Preferences Compliance

IMPORTANT: Ensure that all implementation follows agent-qa standards and preferences as documented in:

@agent-os/standards/global/coding-style.md
@agent-os/standards/global/commenting.md
@agent-os/standards/global/conventions.md
@agent-os/standards/global/error-handling.md
@agent-os/standards/global/tech-stack.md
@agent-os/standards/global/validation.md

