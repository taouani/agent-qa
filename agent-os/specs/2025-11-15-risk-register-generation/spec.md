# Specification: Risk Register Generation

## Goal

Automatically identify and document risks from analyzed requirements, test strategies, and test charters, including risk ID, description, category (context-based), probability and impact (predefined scales), risk score (calculated), mitigation strategies (high-level guidance), contingency plans (for high-risk items only), and ownership suggestions (based on risk type). Risk registers are generated directly from in-memory structures, with context-aware output (one register per requirement OR per release/filter) stored as markdown files, prioritized by risk score.

## User Stories

- As a QA Manager, I want risks automatically identified and documented from requirements, test strategies, and test charters so that I can proactively manage testing risks without manual risk identification
- As a Release Manager, I want comprehensive risk registers with prioritized risks (by risk score) so that I can focus mitigation efforts on the highest-risk items
- As a QA Manager, I want risk registers with automatic mitigation strategies and contingency plans so that I can quickly develop risk response plans
- As a Project Manager, I want risk registers with ownership suggestions based on risk type so that I can assign risk owners appropriately
- As a QA Analyst, I want risk registers with traceability to specific requirements so that I can understand the context and source of each risk

## Specific Requirements

**Workflow Integration**
- Integrate as additional phases into existing `agent-qa/commands/atlassian-integration/` workflow
- Extend the Atlassian integration command with new risk register generation phases following existing phase numbering (phases 18+)
- Process in-memory structures from Requirements Analysis Engine (phases 5-8), Test Charter Generation (phases 12-14), and Test Strategy Generation (phases 15-17)
- Store generated risk registers in context folders (`agent-qa/requirement/` or `agent-qa/release/`)
- Follow agent-os multi-phase command patterns with numbered instruction files

**Input Processing**
- Work directly with in-memory requirement structures from phases 5-8
- Work directly with in-memory test charter structures from phases 12-14
- Work directly with in-memory test strategy structures from phases 15-17
- Process both single requirements and multiple requirements (from filters/releases)
- Do not read files from disk - use in-memory data structures
- Combine all sources (requirements, test strategies, test charters) for comprehensive risk identification

**Risk Identification**
- Identify risks from combination of all sources:
  - **From Requirements (phases 5-8)**: Analyze requirements for potential risks (missing acceptance criteria, dependencies, complexity, ambiguity, incomplete information)
  - **From Test Strategies (phases 15-17)**: Analyze test strategies for execution risks (test coverage gaps, testability issues, automation challenges, resource constraints)
  - **From Test Charters (phases 12-14)**: Analyze test charters for exploratory testing risks (complex areas, edge cases, integration points, resource availability)
- Consider requirement characteristics, dependencies, relationships, and quality indicators
- Consider test strategy coverage, automation approach, and metrics
- Consider test charter scope, exploration areas, and resource requirements
- Generate comprehensive risk identification covering all aspects

**Risk Structure**
- Use flexible, simple structure optimized for LLM consumption and readability
- Include essential fields: risk ID, description, category, probability, impact, risk score, mitigation strategies, contingency plans (for high-risk items), ownership suggestions, requirement traceability
- Avoid rigid templates - maintain flexibility for different risk types
- Structure risks as simple objects/arrays for agent-qa workflows
- Ensure structure is clear and easy to follow

**Risk Fields**
- **Risk ID**: Unique identifier for each risk (e.g., RISK-001, RISK-002)
- **Description**: Clear description of the risk, its potential impact, and context
- **Category**: Context-based category generated from risk analysis (e.g., "Technical Risk", "Requirements Risk", "Testing Risk", "Schedule Risk", "Resource Risk")
- **Probability**: Predefined scale value (Low, Medium, High or 1-5 scale)
- **Impact**: Predefined scale value (Low, Medium, High or 1-5 scale)
- **Risk Score**: Calculated value (probability × impact or similar formula)
- **Mitigation Strategies**: High-level guidance for risk mitigation (automatically generated)
- **Contingency Plans**: Necessary details for high-risk items only (keep it simple)
- **Ownership Suggestions**: Suggested owner based on risk type (e.g., "Technical Lead" for technical risks, "QA Manager" for testing risks)
- **Requirement Traceability**: Link/trace back to specific requirements that contributed to the risk

**Risk Categorization**
- Generate categories based on context (not predefined set)
- Analyze risk characteristics to determine appropriate category
- Common category types (generated based on context):
  - **Technical Risks**: Architecture, integration, performance, security, compatibility
  - **Requirements Risks**: Ambiguity, missing information, changes, dependencies
  - **Testing Risks**: Coverage gaps, testability, environment, automation
  - **Schedule Risks**: Timeline, dependencies, resource availability
  - **Resource Risks**: Skills, availability, tools, capacity
- Ensure categories are relevant and meaningful for the identified risks

**Risk Scoring**
- Use predefined scales for probability and impact
- **Probability Scale**: Low, Medium, High (or 1-5 numeric scale)
- **Impact Scale**: Low, Medium, High (or 1-5 numeric scale)
- **Risk Score Calculation**: Calculate risk score as probability × impact
- For Low/Medium/High scales: Map to numeric values (e.g., Low=1, Medium=2, High=3) for calculation
- Ensure risk scores are consistent and comparable

**Mitigation Strategies**
- Generate mitigation strategies automatically
- Provide high-level guidance only (not detailed implementation steps)
- Base mitigation strategies on risk type and characteristics
- Include guidance on:
  - Risk prevention approaches
  - Risk reduction strategies
  - Risk monitoring approaches
- Ensure mitigation strategies are actionable and relevant

**Contingency Plans**
- Generate contingency plans only for high-risk items (high risk score)
- Include necessary details, keep it simple
- Describe what to do if the risk materializes
- Include:
  - Immediate response actions
  - Escalation procedures (if applicable)
  - Recovery approaches
- Ensure contingency plans are practical and actionable

**Ownership Assignment**
- Generate ownership suggestions based on risk type
- Map risk categories to appropriate owner roles:
  - Technical risks → Technical Lead, Architect, Development Lead
  - Requirements risks → Product Owner, Business Analyst, Requirements Owner
  - Testing risks → QA Manager, Test Lead, QA Analyst
  - Schedule risks → Project Manager, Release Manager
  - Resource risks → Resource Manager, Team Lead
- Provide ownership suggestions, not definitive assignments
- Allow for manual override/adjustment

**Risk Prioritization**
- Sort risks by risk score (highest first)
- Prioritize high-risk items for immediate attention
- Group risks by category for easier review (optional)
- Ensure risk register output is ordered by priority

**Risk Traceability**
- Link/trace risks back to specific requirements
- Include requirement key and summary for each risk
- Show which requirements contributed to each risk
- Enable traceability from risk to source requirement
- Include traceability information in risk register output

**File Output Structure**
- Generate one register per requirement OR one register per release/filter depending on input type
- For single requirements: Use filename format `risk-register-{REQUIREMENT-KEY}.md` (e.g., `risk-register-PROJ-123.md`)
- For releases/filters: Use filename format `risk-register-release.md` or `risk-register-{CONTEXT}.md`
- Store risk register files in appropriate context folder (`agent-qa/requirement/` or `agent-qa/release/`)
- Create summary index file listing all risk register files (if multiple registers generated)
- Format index file as markdown with links to individual risk register files

**Risk Register File Format**
- Format risk register files as markdown following agent-os standards
- Include requirement reference section at top of file (for single requirement registers)
- Include release/filter reference section at top of file (for release registers)
- Structure sections clearly with markdown headings
- Use markdown tables for structured risk data
- Format risks in priority order (highest risk score first)
- Include all risk fields in structured format
- Use markdown lists and tables for readability

**Error Handling**
- Handle missing or incomplete data gracefully
- Continue risk identification even when some sources have issues
- Provide informative messages when risks cannot be determined
- Log warnings for risks that may need manual review
- Ensure graceful degradation for missing or incomplete data

**Data Processing and Storage**
- Process risks in memory during generation
- Transform requirement, test strategy, and test charter structures into risk structures
- Maintain risk-to-source relationships (requirements, strategies, charters)
- Store generated risks for file output
- Support data access patterns for downstream commands (if needed)

**Command Structure Integration**
- Follow agent-os command patterns with multi-phase processes
- Use numbered instruction files for workflow steps (extend existing phase numbers)
- Integrate seamlessly with existing Atlassian integration phases
- Comply with agent-os standards and conventions
- Create reusable risk identification patterns for future extensions

## Visual Design

No visual assets provided.

## Existing Code to Leverage

**Requirements Analysis Engine**
- Leverage in-memory requirement structures from phases 5-8
- Use requirement data including summary, description, acceptance criteria, quality scores, dependencies, relationships
- Access linked issues and Confluence content for comprehensive risk context
- Follow data structure patterns from Requirements Analysis Engine

**Test Charter Generation**
- Leverage in-memory test charter structures from phases 12-14
- Use charter data including mission/goal, scope, areas to explore, risks, resource requirements, time estimates
- Note: Test charters already include risk generation, but Risk Register Generation provides comprehensive, structured risk management

**Test Strategy Generation**
- Leverage in-memory test strategy structures from phases 15-17
- Use strategy data including test levels, test types, test design techniques, automation approach, metrics
- Consider test strategy risks (coverage gaps, automation challenges, resource constraints)

**Atlassian Integration Command**
- Extend existing `agent-qa/commands/atlassian-integration/` command with new phases
- Follow existing phase structure and numbering conventions (phases 18+)
- Use existing context folder creation logic
- Reuse workflow integration patterns

**Agent-OS Command Structure Patterns**
- Reference `/Users/taouani/Projects/ai-agents/agent-os` for multi-phase command implementation patterns
- Follow numbered instruction file structure (extend existing phases)
- Use workflow integration patterns from existing agent-os commands
- Adopt error handling patterns from agent-os standards
- Follow data processing patterns from agent-os workflows

**File Generation Patterns**
- Follow markdown file generation patterns from Phase 8 (requirement file generation)
- Follow markdown file generation patterns from Phase 10 (test case file generation)
- Follow markdown file generation patterns from Phase 14 (charter file generation)
- Follow markdown file generation patterns from Phase 17 (strategy file generation)
- Use similar file naming and organization patterns
- Apply markdown formatting standards from agent-os
- Follow index file generation patterns

**Error Handling Standards**
- Follow error handling patterns from `agent-os/standards/global/error-handling.md`
- Use consistent error message formatting from Atlassian integration
- Apply validation patterns from `agent-os/standards/global/validation.md`
- Follow graceful degradation patterns for missing data

## Out of Scope

- Reading requirement, test strategy, or test charter files from disk (must use in-memory structures)
- Predefined risk categories (must generate based on context)
- Detailed mitigation strategies (high-level guidance only)
- Contingency plans for all risks (only high-risk items)
- Manual ownership assignment (suggestions only)
- Risk tracking or monitoring tools (generation only)
- Risk approval workflows
- Risk versioning or change tracking
- Risk status tracking (open, mitigated, closed)
- Risk review and update workflows
- Integration with external risk management tools
- Risk reporting dashboards or analytics
- Automated risk monitoring or alerting

