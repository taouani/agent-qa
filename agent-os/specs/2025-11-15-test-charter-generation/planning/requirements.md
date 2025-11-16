# Spec Requirements: Test Charter Generation

## Initial Description

Create exploratory test charters with mission/goal, scope (in/out), areas to explore, test approach, risks, resource requirements, and time estimates.

## Requirements Discussion

### First Round Questions

**Q1:** Input Source: I assume test charters should be generated from analyzed requirements and/or generated test cases. Should it work directly with in-memory requirement structures from phases 5-8 and test cases from phases 9-11, or read files from `agent-qa/requirement/` or `agent-qa/release/` folders?

**Answer:** Use in-memory requirement structures from phases 5-8 only.

**Q2:** Charter Structure: Test charters typically include mission/goal, scope (in/out), areas to explore, test approach, risks, resource requirements, and time estimates. Should we use a specific charter template format, or keep it flexible and simple like other deliverables?

**Answer:** Flexible and simple.

**Q3:** Scope Definition: How should the system determine what's "in scope" vs "out of scope" for a test charter? Should it be based on the requirements analyzed, test cases generated, or both? Should it explicitly list what's excluded?

**Answer:** Base it on requirements analyzed only.

**Q4:** Areas to Explore: How should the system identify "areas to explore" for exploratory testing? Should it analyze requirements to identify complex areas, edge cases, integration points, or derive from test cases generated?

**Answer:** Analyze requirements for complex areas, edge cases and integration points.

**Q5:** Test Approach: What level of detail should be included in the test approach section? Should it describe exploratory testing techniques, session-based testing, or provide high-level guidance?

**Answer:** Describe exploratory testing techniques and session-based testing.

**Q6:** Risks Integration: Should test charter generation integrate with the Risk Register Generation feature (roadmap item #7) to pull in identified risks, or should it generate risks independently based on the requirements/test cases being analyzed?

**Answer:** Generate risks independently based on the requirements/test cases being analyzed.

**Q7:** Resource Requirements: What information should be included in resource requirements? Should it specify tester roles, skills needed, tools required, or provide estimates for team size?

**Answer:** Specify tester roles, skills needed and tools required.

**Q8:** Time Estimates: How should time estimates be calculated? Should it be based on number of requirements, test cases generated, complexity analysis, or provide time ranges (e.g., 2-4 hours, 1-2 days)?

**Answer:** Based on number of requirements and complexity analysis.

**Q9:** Integration Point: Should test charter generation integrate into the existing Atlassian integration workflow as additional phases (12+), or should it be a separate command that can be invoked independently?

**Answer:** Integrate it into the existing Atlassian integration workflow as additional phases.

**Q10:** Output Format: Should test charters be generated as:
- One charter per requirement (e.g., `test-charter-PROJ-123.md`)?
- One charter per release/filter (e.g., `test-charter-release.md`)?
- Or both options depending on input type?

**Answer:** Both options depending on input type.

**Q11:** Mission/Goal: How should the mission/goal be derived? Should it be extracted from requirement summaries, test case objectives, or generated based on the overall scope being tested?

**Answer:** Generate based on the overall scope being tested.

### Visual Assets

**Files Provided:**
No visual assets provided.

**Visual Insights:**
No visual assets provided.

### Existing Code to Reference

**Similar Features Identified:**
- Feature: Test Case Generation - Path: `agent-qa/commands/atlassian-integration/` (phases 9-11)
- Feature: Requirements Analysis Engine - Path: `agent-qa/commands/atlassian-integration/` (phases 5-8)
- Command structure patterns: Reference agent-os under `/Users/taouani/Projects/ai-agents/agent-os` for multi-phase command implementation patterns
- File generation patterns: Follow patterns from Phase 8 (requirement file generation) and Phase 10 (test case file generation)
- Data processing patterns: Follow agent-os patterns for data transformation and storage
- Workflow integration: Integrate into existing Atlassian integration workflow following agent-os command patterns

## Requirements Summary

### Functional Requirements

- **Input Processing**: Work directly with in-memory requirement structures from Requirements Analysis Engine (phases 5-8 only)
- **Charter Generation**: Generate exploratory test charters with flexible, simple structure
- **Charter Structure**: Include mission/goal, scope (in/out), areas to explore, test approach, risks, resource requirements, and time estimates
- **Scope Definition**: Base scope on requirements analyzed only (in scope and out of scope)
- **Areas to Explore**: Analyze requirements for complex areas, edge cases, and integration points
- **Test Approach**: Describe exploratory testing techniques and session-based testing
- **Risk Generation**: Generate risks independently based on requirements being analyzed
- **Resource Requirements**: Specify tester roles, skills needed, and tools required
- **Time Estimates**: Calculate based on number of requirements and complexity analysis
- **Workflow Integration**: Integrate as additional phases into existing Atlassian integration workflow
- **Output Format**: Generate one charter per requirement OR one charter per release/filter depending on input type

### Reusability Opportunities

- **Command Structure**: Follow agent-os multi-phase command patterns from `/Users/taouani/Projects/ai-agents/agent-os`
- **Data Processing**: Leverage existing requirement structures from Requirements Analysis Engine (phases 5-8)
- **Workflow Integration**: Extend existing `agent-qa/commands/atlassian-integration/` command with new test charter generation phases
- **File Generation**: Follow patterns from Phase 8 (requirement file generation) and Phase 10 (test case file generation) for markdown output
- **Standards Compliance**: Follow agent-os standards and conventions for markdown output and data structures

### Scope Boundaries

**In Scope:**
- Test charter generation from in-memory requirement structures (phases 5-8)
- Mission/goal generation based on overall scope being tested
- Scope definition (in/out) based on requirements analyzed
- Areas to explore identification from requirement analysis (complex areas, edge cases, integration points)
- Exploratory testing techniques and session-based testing approach description
- Independent risk generation based on requirements
- Resource requirements specification (tester roles, skills, tools)
- Time estimates based on requirements count and complexity
- Context-aware output (one charter per requirement OR per release/filter)
- Integration into existing Atlassian integration workflow as additional phases

**Out of Scope:**
- Reading requirement files from disk (must use in-memory structures)
- Using test cases as input (requirements only)
- Integration with Risk Register Generation feature (independent risk generation)
- Rigid charter templates (must use flexible, simple structure)
- Separate command (must integrate into existing workflow)
- Test case generation integration (requirements analysis only)

### Technical Considerations

- **Integration Points**: Must integrate into existing `agent-qa/commands/atlassian-integration/` workflow as additional phases (12+)
- **Input Source**: Work directly with in-memory requirement structures from phases 5-8 only
- **Data Format**: Flexible, simple charter structure (not rigid templates)
- **Output Location**: Store charter files in context folders (`agent-qa/requirement/` or `agent-qa/release/`)
- **File Structure**: One charter per requirement OR one charter per release/filter depending on input type
- **Pattern Reference**: Follow agent-os patterns from `/Users/taouani/Projects/ai-agents/agent-os` for command structure, data processing, and workflow integration
- **Scope Analysis**: Base scope definition on requirements analyzed only
- **Exploration Areas**: Identify from requirement analysis (complex areas, edge cases, integration points)
- **Risk Generation**: Generate independently based on requirements (not integrated with Risk Register feature)
- **Time Calculation**: Based on requirements count and complexity analysis

