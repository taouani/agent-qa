# Task Breakdown: Risk Register Generation

## Overview
Total Tasks: 7 task groups

## Task List

### Workflow Integration Layer

#### Task Group 1: Extend Atlassian Integration Command Structure
**Dependencies:** None

- [x] 1.0 Extend existing Atlassian integration command with risk register generation phases
  - [x] 1.1 Update main command file `agent-qa/commands/atlassian-integration/atlassian-integration.md`
    - Add new phases (18-20) for risk register generation
    - Document phase sequence and dependencies
    - Reference numbered instruction files for new phases
  - [x] 1.2 Create phase 18 instruction file `18-identify-risks.md`
    - Risk identification workflow from requirements, test strategies, and test charters
    - Integration with in-memory structures (phases 5-8, 12-14, 15-17)
    - Multi-source risk identification
    - Follow agent-os numbered instruction file pattern
  - [x] 1.3 Create phase 19 instruction file `19-analyze-and-score-risks.md`
    - Risk categorization based on context
    - Risk scoring (probability, impact, risk score calculation)
    - Risk prioritization by risk score
    - Ownership suggestions generation
  - [x] 1.4 Create phase 20 instruction file `20-generate-risk-register-files.md`
    - Risk register file generation grouped by requirement or release
    - Markdown file formatting
    - Summary index generation (if multiple registers)

**Acceptance Criteria:**
- Command structure extended with phases 18-20
- All numbered instruction files created following agent-os patterns
- Phase sequence documented and integrated with existing workflow
- Command maintains backward compatibility with existing phases

### Risk Identification Layer

#### Task Group 2: Multi-Source Risk Identification
**Dependencies:** Task Group 1

- [x] 2.0 Implement risk identification from all sources
  - [x] 2.1 Access in-memory requirement structures
    - Access requirement data from phases 5-8
    - Process both single requirements and multiple requirements (from filters/releases)
    - Access requirement characteristics, dependencies, relationships, quality indicators
    - Ensure requirement data is available before proceeding
  - [x] 2.2 Access in-memory test charter structures
    - Access test charter data from phases 12-14
    - Access charter scope, areas to explore, resource requirements
    - Consider exploratory testing risks
    - Ensure charter data is available before proceeding
  - [x] 2.3 Access in-memory test strategy structures
    - Access test strategy data from phases 15-17
    - Access strategy coverage, automation approach, metrics
    - Consider test execution risks
    - Ensure strategy data is available before proceeding
  - [x] 2.4 Identify risks from requirements
    - Analyze requirements for missing acceptance criteria risks
    - Analyze requirements for dependency risks
    - Analyze requirements for complexity risks
    - Analyze requirements for ambiguity risks
    - Analyze requirements for incomplete information risks
  - [x] 2.5 Identify risks from test strategies
    - Analyze test strategies for test coverage gap risks
    - Analyze test strategies for testability risks
    - Analyze test strategies for automation challenge risks
    - Analyze test strategies for resource constraint risks
  - [x] 2.6 Identify risks from test charters
    - Analyze test charters for complex area risks
    - Analyze test charters for edge case risks
    - Analyze test charters for integration point risks
    - Analyze test charters for resource availability risks
  - [x] 2.7 Combine and deduplicate risks
    - Combine risks from all sources
    - Identify duplicate or similar risks
    - Deduplicate risks while preserving all source information
    - Ensure comprehensive risk coverage

**Acceptance Criteria:**
- Risks identified from requirements (phases 5-8)
- Risks identified from test strategies (phases 15-17)
- Risks identified from test charters (phases 12-14)
- All sources combined and deduplicated
- Comprehensive risk identification covering all aspects

### Risk Analysis Layer

#### Task Group 3: Risk Categorization
**Dependencies:** Task Group 2

- [x] 3.0 Implement risk categorization based on context
  - [x] 3.1 Analyze risk characteristics
    - Analyze risk description and context
    - Identify risk type indicators
    - Consider risk source (requirements, strategies, charters)
    - Consider risk impact area
  - [x] 3.2 Generate context-based categories
    - Generate technical risk categories (architecture, integration, performance, security, compatibility)
    - Generate requirements risk categories (ambiguity, missing information, changes, dependencies)
    - Generate testing risk categories (coverage gaps, testability, environment, automation)
    - Generate schedule risk categories (timeline, dependencies, resource availability)
    - Generate resource risk categories (skills, availability, tools, capacity)
  - [x] 3.3 Assign categories to risks
    - Assign appropriate category to each risk
    - Ensure categories are relevant and meaningful
    - Handle risks that may fit multiple categories
    - Ensure category assignment is consistent

**Acceptance Criteria:**
- Risk categories generated based on context (not predefined)
- Categories are relevant and meaningful for identified risks
- All risks assigned appropriate categories
- Category assignment is consistent

#### Task Group 4: Risk Scoring and Prioritization
**Dependencies:** Task Group 3

- [x] 4.0 Implement risk scoring using predefined scales
  - [x] 4.1 Determine probability for each risk
    - Use predefined probability scale (Low, Medium, High or 1-5)
    - Analyze risk characteristics to determine probability
    - Consider risk source and context
    - Ensure probability assessment is consistent
  - [x] 4.2 Determine impact for each risk
    - Use predefined impact scale (Low, Medium, High or 1-5)
    - Analyze risk characteristics to determine impact
    - Consider requirement importance and scope
    - Ensure impact assessment is consistent
  - [x] 4.3 Calculate risk score
    - Map probability scale to numeric values (Low=1, Medium=2, High=3 or 1-5)
    - Map impact scale to numeric values (Low=1, Medium=2, High=3 or 1-5)
    - Calculate risk score as probability × impact
    - Ensure risk scores are consistent and comparable
  - [x] 4.4 Prioritize risks by risk score
    - Sort risks by risk score (highest first)
    - Identify high-risk items (high risk score)
    - Group risks by category for easier review (optional)
    - Ensure risk register output is ordered by priority

**Acceptance Criteria:**
- Probability determined using predefined scales
- Impact determined using predefined scales
- Risk score calculated as probability × impact
- Risks prioritized by risk score (highest first)
- High-risk items identified for contingency planning

### Risk Response Layer

#### Task Group 5: Mitigation Strategies Generation
**Dependencies:** Task Group 4

- [x] 5.0 Implement automatic mitigation strategy generation
  - [x] 5.1 Generate mitigation strategies for all risks
    - Generate high-level guidance (not detailed implementation steps)
    - Base mitigation strategies on risk type and characteristics
    - Include risk prevention approaches
    - Include risk reduction strategies
    - Include risk monitoring approaches
  - [x] 5.2 Ensure mitigation strategies are actionable
    - Make strategies relevant to risk type
    - Ensure strategies are practical and actionable
    - Keep guidance high-level but specific enough to be useful
    - Ensure strategies address the root cause or impact of the risk

**Acceptance Criteria:**
- Mitigation strategies generated automatically for all risks
- Strategies are high-level guidance (not detailed implementation)
- Strategies are actionable and relevant to risk type
- Strategies address risk prevention, reduction, and monitoring

#### Task Group 6: Contingency Plans and Ownership
**Dependencies:** Task Group 4

- [x] 6.0 Implement contingency plans for high-risk items
  - [x] 6.1 Identify high-risk items
    - Identify risks with high risk score
    - Determine threshold for high-risk classification
    - Ensure high-risk items are clearly identified
  - [x] 6.2 Generate contingency plans for high-risk items
    - Generate necessary details, keep it simple
    - Describe immediate response actions
    - Include escalation procedures (if applicable)
    - Include recovery approaches
    - Ensure contingency plans are practical and actionable
  - [x] 6.3 Generate ownership suggestions
    - Map risk categories to appropriate owner roles
    - Technical risks → Technical Lead, Architect, Development Lead
    - Requirements risks → Product Owner, Business Analyst, Requirements Owner
    - Testing risks → QA Manager, Test Lead, QA Analyst
    - Schedule risks → Project Manager, Release Manager
    - Resource risks → Resource Manager, Team Lead
    - Generate ownership suggestions based on risk type
    - Provide suggestions, not definitive assignments

**Acceptance Criteria:**
- Contingency plans generated only for high-risk items
- Contingency plans include necessary details (keep it simple)
- Contingency plans are practical and actionable
- Ownership suggestions generated based on risk type
- Ownership mapping is appropriate for risk categories

### File Output Layer

#### Task Group 7: Risk Register File Generation
**Dependencies:** Task Groups 2, 3, 4, 5, 6

- [x] 7.0 Implement risk register file generation
  - [x] 7.1 Determine risk register output structure
    - Determine if single requirement or release/filter context
    - Generate one register per requirement OR one register per release/filter
    - Use context-aware output based on input type
  - [x] 7.2 Create risk register file naming logic
    - For single requirements: Generate filename `risk-register-{REQUIREMENT-KEY}.md`
    - For releases/filters: Generate filename `risk-register-release.md` or `risk-register-{CONTEXT}.md`
    - Handle special characters in filenames
  - [x] 7.3 Format risk register files as markdown
    - Follow agent-os markdown standards
    - Include requirement reference section at top (for single requirement registers)
    - Include release/filter reference section at top (for release registers)
    - Structure sections clearly with markdown headings
  - [x] 7.4 Include all risk fields
    - Risk ID section
    - Risk description section
    - Risk category section
    - Probability and impact section
    - Risk score section
    - Mitigation strategies section
    - Contingency plans section (for high-risk items only)
    - Ownership suggestions section
    - Requirement traceability section
  - [x] 7.5 Format risks in priority order
    - Sort risks by risk score (highest first)
    - Use markdown tables for structured risk data
    - Format all risk fields in structured format
    - Use markdown lists and tables for readability
  - [x] 7.6 Write risk register files to context folders
    - Store files in `agent-qa/requirement/` for single tickets
    - Store files in `agent-qa/release/` for filters
    - Ensure folder exists before writing
  - [x] 7.7 Create summary index file (if multiple registers)
    - Generate index file listing all risk register files with links
    - Format index file as markdown following agent-os standards
    - Include summary statistics if applicable (total risks, high-risk count, category distribution)

**Acceptance Criteria:**
- Risk register files created with proper naming (context-aware)
- Files formatted as markdown following agent-os standards
- All risk fields included in structured format
- Risks formatted in priority order (highest risk score first)
- Files stored in correct context folders
- Summary index file created when multiple registers generated

## Execution Order

Recommended implementation sequence:
1. Workflow Integration Layer (Task Group 1)
2. Risk Identification Layer (Task Group 2)
3. Risk Analysis Layer (Task Groups 3, 4 - can be parallel after Task Group 2)
4. Risk Response Layer (Task Groups 5, 6 - can be parallel after Task Group 4)
5. File Output Layer (Task Group 7 - sequential after all previous groups)

## Important Notes

- All phases extend existing `agent-qa/commands/atlassian-integration/` command
- Follow agent-os patterns from `/Users/taouani/Projects/ai-agents/agent-os`
- Work directly with in-memory structures from phases 5-8 (requirements), phases 12-14 (test charters), and phases 15-17 (test strategies) (do not read files from disk)
- Combine all sources (requirements, test strategies, test charters) for comprehensive risk identification
- Generate risk categories based on context (not predefined set)
- Use predefined scales for probability and impact
- Calculate risk score as probability × impact
- Generate mitigation strategies automatically (high-level guidance only)
- Generate contingency plans only for high-risk items (necessary details, keep it simple)
- Generate ownership suggestions based on risk type
- Sort risks by risk score (highest first)
- Link/trace risks back to specific requirements
- Generate one register per requirement OR per release/filter depending on input type

