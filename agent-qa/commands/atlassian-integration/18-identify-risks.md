# PHASE 18: Identify Risks

Identify risks from analyzed requirements, test strategies, and test charters, combining all sources for comprehensive risk identification.

**Context**: This phase processes in-memory structures from phases 5-8 (requirements), phases 12-14 (test charters), and phases 15-17 (test strategies) and identifies risks directly from them. Risk data is generated in memory and stored for analysis, scoring, and file output in subsequent phases.

## Core Responsibilities

1. **Access In-Memory Structures**: Access requirement, test charter, and test strategy data from previous phases
2. **Identify Risks from Requirements**: Analyze requirements for potential risks
3. **Identify Risks from Test Strategies**: Analyze test strategies for execution risks
4. **Identify Risks from Test Charters**: Analyze test charters for exploratory testing risks
5. **Combine and Deduplicate Risks**: Combine risks from all sources and deduplicate
6. **Store Risk Data**: Store identified risks in memory for analysis and scoring

## Workflow

### Step 1: Access In-Memory Requirement Structures

Access requirement data from phases 5-8:
- **From Phase 8**: Requirements with completeness and quality analysis
- **Requirement Data Available**: 
  - Summary, description, acceptance criteria
  - Linked issues and Confluence content
  - Quality scores and completeness indicators
  - Dependencies and relationships
- **Context**: Both single requirements and multiple requirements (from filters/releases)

**IMPORTANT**: Do not read requirement files from disk. Work directly with in-memory data structures from phases 5-8 only.

### Step 2: Access In-Memory Test Charter Structures

Access test charter data from phases 12-14:
- **From Phase 14**: Complete test charters with all details
- **Charter Data Available**:
  - Mission/goal, scope (in/out)
  - Areas to explore (complex areas, edge cases, integration points)
  - Test approach, risks, resource requirements, time estimates
- **Context**: Both single requirement charters and release/filter charters

**IMPORTANT**: Do not read charter files from disk. Work directly with in-memory data structures from phases 12-14 only.

### Step 3: Access In-Memory Test Strategy Structures

Access test strategy data from phases 15-17:
- **From Phase 17**: Complete test strategies with all details
- **Strategy Data Available**:
  - Test levels (Integration, System, UAT with approaches)
  - Test types (specific types with approaches)
  - Test design techniques, automation approach, metrics
- **Context**: Both single requirement strategies and release/filter strategies

**IMPORTANT**: Do not read strategy files from disk. Work directly with in-memory data structures from phases 15-17 only.

### Step 4: Identify Risks from Requirements

Analyze requirements to identify potential risks:

1. **Missing Acceptance Criteria Risks**:
   - Identify requirements without acceptance criteria
   - Flag missing acceptance criteria as a risk
   - Consider impact of missing acceptance criteria on testing and delivery

2. **Dependency Risks**:
   - Identify requirements with dependencies
   - Flag dependency-related risks (blocking dependencies, circular dependencies, unresolved dependencies)
   - Consider impact of dependencies on delivery timeline

3. **Complexity Risks**:
   - Identify requirements with high complexity indicators
   - Flag complexity-related risks (technical complexity, integration complexity, business logic complexity)
   - Consider impact of complexity on testing and implementation

4. **Ambiguity Risks**:
   - Identify requirements with ambiguous descriptions
   - Flag ambiguity-related risks (unclear requirements, conflicting information, vague acceptance criteria)
   - Consider impact of ambiguity on development and testing

5. **Incomplete Information Risks**:
   - Identify requirements with incomplete information
   - Flag incomplete information risks (missing details, incomplete specifications, unclear scope)
   - Consider impact of incomplete information on delivery

6. **Quality Indicator Risks**:
   - Consider requirement quality scores from Phase 7
   - Flag low-quality requirements as risks
   - Consider impact of quality issues on delivery

### Step 5: Identify Risks from Test Strategies

Analyze test strategies to identify execution risks:

1. **Test Coverage Gap Risks**:
   - Identify gaps in test coverage (test levels, test types)
   - Flag coverage gap risks (insufficient integration testing, missing test types, incomplete coverage)
   - Consider impact of coverage gaps on quality assurance

2. **Testability Risks**:
   - Identify testability issues from test strategies
   - Flag testability risks (difficult to test, unclear test approach, test environment challenges)
   - Consider impact of testability issues on testing execution

3. **Automation Challenge Risks**:
   - Identify automation challenges from test strategies
   - Flag automation risks (complex automation, automation scope gaps, automation resource constraints)
   - Consider impact of automation challenges on test execution

4. **Resource Constraint Risks**:
   - Identify resource constraints from test strategies
   - Flag resource risks (insufficient testing resources, skill gaps, tool limitations)
   - Consider impact of resource constraints on test execution

### Step 6: Identify Risks from Test Charters

Analyze test charters to identify exploratory testing risks:

1. **Complex Area Risks**:
   - Identify complex areas identified in test charters
   - Flag complex area risks (high complexity, difficult to explore, unclear boundaries)
   - Consider impact of complex areas on exploratory testing

2. **Edge Case Risks**:
   - Identify edge cases identified in test charters
   - Flag edge case risks (boundary conditions, extreme scenarios, unusual inputs)
   - Consider impact of edge cases on testing coverage

3. **Integration Point Risks**:
   - Identify integration points identified in test charters
   - Flag integration risks (complex integrations, integration dependencies, integration testing challenges)
   - Consider impact of integration points on testing

4. **Resource Availability Risks**:
   - Identify resource requirements from test charters
   - Flag resource availability risks (tester availability, skill requirements, tool availability)
   - Consider impact of resource availability on exploratory testing

### Step 7: Combine and Deduplicate Risks

Combine risks from all sources and deduplicate:

1. **Combine All Risks**:
   - Combine risks identified from requirements
   - Combine risks identified from test strategies
   - Combine risks identified from test charters
   - Create unified risk list

2. **Identify Duplicate or Similar Risks**:
   - Compare risk descriptions across sources
   - Identify duplicate risks (same risk from multiple sources)
   - Identify similar risks (related risks that can be combined)

3. **Deduplicate Risks**:
   - Merge duplicate risks while preserving all source information
   - Combine similar risks into single risk with comprehensive description
   - Ensure all source information is preserved (requirements, strategies, charters)

4. **Ensure Comprehensive Coverage**:
   - Verify all risk sources are represented
   - Ensure no critical risks are lost during deduplication
   - Maintain risk-to-source relationships

### Step 8: Generate Risk IDs

Generate unique risk IDs for each identified risk:

1. **Risk ID Format**:
   - Format: `RISK-{NUMBER}` (e.g., RISK-001, RISK-002)
   - Use sequential numbering starting from 001
   - Ensure unique IDs for all risks

2. **Assign Risk IDs**:
   - Assign unique ID to each identified risk
   - Maintain ID-to-risk mapping
   - Ensure IDs are consistent and traceable

### Step 9: Store Risk Data in Memory

Store identified risks in memory:

1. **Store Risk Structures**:
   - Risk ID
   - Risk description (from identification)
   - Risk sources (requirements, test strategies, test charters)
   - Requirement traceability (which requirements contributed to the risk)

2. **Store Source Information**:
   - Maintain risk-to-source relationships
   - Store requirement references for each risk
   - Store strategy/charter references if applicable

3. **Prepare for Analysis**:
   - Ensure risk data is available for Phase 19
   - Maintain risk-to-source relationships
   - Store risk identification context

## Error Handling

- Handle missing or incomplete data gracefully
- Continue risk identification even when some sources have issues
- Provide informative messages when risks cannot be determined
- Log warnings for risks that may need manual review
- Ensure graceful degradation for missing or incomplete data

## Output

- Risks identified from all sources (requirements, test strategies, test charters)
- Risks combined and deduplicated
- Risk IDs assigned
- Risk data stored in memory with source information
- Requirement traceability maintained
- Ready for analysis and scoring in Phase 19

