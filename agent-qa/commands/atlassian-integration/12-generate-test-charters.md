# PHASE 12: Generate Test Charters

Generate exploratory test charters from analyzed requirement structures, including mission/goal, scope (in/out), and areas to explore.

**Context**: This phase processes in-memory requirement structures from phases 5-8 and generates test charter foundation (mission/goal, scope, areas to explore) directly from them. Charter data is generated in memory and stored for detail generation and file output in subsequent phases.

## Core Responsibilities

1. **Access Requirement Structures**: Access in-memory requirement data from phases 5-8 only
2. **Generate Mission/Goal**: Create mission/goal based on overall scope being tested
3. **Define Scope**: Determine in-scope and out-of-scope requirements
4. **Identify Areas to Explore**: Analyze requirements for complex areas, edge cases, and integration points
5. **Store Charter Foundation**: Store generated charter foundation in memory for detail generation

## Workflow

### Step 1: Access In-Memory Requirement Structures

Access requirement data from previous phases:
- **From Phase 8**: Requirements with completeness and quality analysis
- **Requirement Data Available**: 
  - Summary, description, acceptance criteria
  - Linked issues and Confluence content
  - Quality scores and completeness indicators
  - Dependencies and relationships
- **Context**: Both single requirements and multiple requirements (from filters/releases)

**IMPORTANT**: Do not read requirement files from disk. Work directly with in-memory data structures from phases 5-8 only. Do not use test cases as input.

### Step 2: Determine Charter Context

Determine the context for charter generation:
- **Single Requirement Context**: If processing a single Jira ticket, generate one charter per requirement
- **Release/Filter Context**: If processing a Jira filter, generate one charter covering the entire release/filter scope
- **Use Context from Phase 1**: Use the context folder type (`agent-qa/requirement/` or `agent-qa/release/`) to determine context

### Step 3: Generate Mission/Goal Based on Overall Scope

Generate mission/goal based on the overall scope being tested:

1. **For Single Requirements**:
   - Analyze the single requirement to derive mission statement
   - Generate mission/goal specific to that requirement
   - Ensure mission/goal clearly articulates what will be explored and tested for this requirement

2. **For Releases/Filters**:
   - Analyze all requirements in scope to derive comprehensive mission statement
   - Generate mission/goal covering the entire release/filter scope
   - Consider the overall theme and purpose of the release/filter

3. **Mission/Goal Structure**:
   - Clear statement of what will be explored and tested
   - Articulate the purpose and objectives of exploratory testing
   - Ensure mission/goal is actionable and specific

### Step 4: Define Scope (In Scope)

Define what's included in scope based on requirements analyzed:

1. **List Requirements Included**:
   - List all requirements included in the analysis
   - Base on requirements analyzed only (from phases 5-8)
   - Explicitly list what's included in scope

2. **For Single Requirements**:
   - Include the single requirement in scope
   - List requirement key and summary

3. **For Releases/Filters**:
   - List all requirements from the filter/release
   - Include requirement keys and summaries
   - Ensure comprehensive scope listing

4. **Ensure Clarity**:
   - Make scope clear and unambiguous
   - Use requirement keys and summaries for clarity

### Step 5: Define Scope (Out of Scope)

Define what's explicitly excluded from scope:

1. **Identify Excluded Requirements**:
   - Identify requirements explicitly excluded or not part of current analysis
   - Consider requirements that are related but not included in current scope
   - Consider requirements that are dependencies but not part of testing scope

2. **Explicitly List Exclusions**:
   - List what's excluded from scope (if applicable)
   - Use requirement keys and summaries for clarity
   - Ensure out-of-scope items are clearly identified

3. **Handle Cases with No Exclusions**:
   - If no explicit exclusions, note that all analyzed requirements are in scope
   - Do not create empty out-of-scope sections

### Step 6: Analyze Requirements for Complex Areas

Identify complex areas that need exploratory testing:

1. **Consider Requirement Complexity**:
   - Use quality scores from phase 7 for complexity assessment
   - Identify requirements with high complexity scores
   - Consider requirements with multiple acceptance criteria
   - Consider requirements with extensive descriptions

2. **Identify Complex Requirement Areas**:
   - Analyze requirement descriptions for complex functionality
   - Identify areas with multiple workflows or processes
   - Consider requirements with many dependencies
   - Prioritize complex areas for exploration

3. **Structure Complex Areas**:
   - List complex areas clearly
   - Include requirement context for each complex area
   - Ensure areas are specific and actionable

### Step 7: Identify Edge Cases and Boundary Conditions

Identify edge cases and boundary conditions from requirement analysis:

1. **Analyze Requirements for Edge Cases**:
   - Review acceptance criteria for edge case indicators
   - Analyze requirement descriptions for boundary conditions
   - Consider requirements that mention limits, ranges, or constraints

2. **Identify Boundary Conditions**:
   - Identify boundary values and limits mentioned in requirements
   - Consider edge scenarios from requirement context
   - Include edge cases from linked issues and Confluence content

3. **Structure Edge Cases**:
   - List edge cases and boundary conditions clearly
   - Include requirement context for each edge case
   - Ensure edge cases are specific and testable

### Step 8: Identify Integration Points

Identify integration points between requirements and systems:

1. **Analyze Requirement Dependencies**:
   - Review requirement dependencies from phase 6
   - Identify requirements with dependencies on other systems
   - Consider requirements that integrate with external services

2. **Consider Requirement Relationships**:
   - Analyze requirement relationships for integration context
   - Consider linked issues for integration points
   - Analyze Confluence content for integration information

3. **Identify System Integration Points**:
   - Identify points where requirements interact with other systems
   - Consider API integrations, database interactions, external services
   - Include integration points from requirement context

4. **Structure Integration Points**:
   - List integration points clearly
   - Include requirement context and system information
   - Ensure integration points are specific and actionable

### Step 9: Prioritize and Structure Exploration Areas

Prioritize and structure all exploration areas:

1. **Prioritize Areas**:
   - Prioritize areas based on complexity, risk, and integration points
   - Consider quality scores and completeness indicators
   - Order areas by importance and testing priority

2. **Generate Specific, Actionable Areas**:
   - Ensure each exploration area is specific and actionable
   - Include clear descriptions of what to explore
   - Provide context for each exploration area

3. **Structure Exploration Areas**:
   - Group exploration areas by type (complex areas, edge cases, integration points)
   - Use clear headings and organization
   - Ensure readability and clarity

### Step 10: Store Charter Foundation in Memory

Store generated charter foundation in memory for detail generation:

1. **Charter Foundation Structure**:
   ```javascript
   {
     // Context
     context: "requirement" | "release",
     requirementKey: "PROJ-123" | null,
     
     // Mission/Goal
     missionGoal: "...",
     
     // Scope
     scopeIn: [
       { key: "PROJ-123", summary: "..." }
     ],
     scopeOut: [
       { key: "PROJ-124", summary: "..." }
     ],
     
     // Areas to Explore
     areasToExplore: {
       complexAreas: [...],
       edgeCases: [...],
       integrationPoints: [...]
     }
   }
   ```

2. **Store for Next Phase**:
   - Store charter foundation for phase 13 (charter details generation)
   - Maintain requirement-to-charter relationships
   - Ensure data is accessible for detail generation

### Step 11: Confirm Charter Foundation Generation

After generating charter foundation for all requirements:

1. **Verify Generation**:
   - Confirm mission/goal generated for all contexts
   - Verify scope defined clearly
   - Check exploration areas identified

2. **Log Summary**:
   - Log total charters to be generated
   - Log exploration areas identified
   - Log any warnings (e.g., missing data)

3. **Proceed to Next Phase**:
   - Charter foundation ready for detail generation in Phase 13
   - Data structures ready for file output in Phase 14

## Output

After this phase, you should have:
- Mission/goal generated based on overall scope
- Scope (in) clearly defined based on requirements analyzed
- Scope (out) defined when applicable
- Areas to explore identified (complex areas, edge cases, integration points)
- Charter foundation stored in memory, ready for detail generation

## Error Handling

- **Missing Requirements**: Skip requirement if no data available
- **Incomplete Information**: Continue generation with available data
- **Missing Quality Scores**: Use requirement complexity indicators from description
- **Multiple Requirements**: Process all requirements even if some have issues
- **Log Warnings**: Inform about requirements that may need manual charter review

