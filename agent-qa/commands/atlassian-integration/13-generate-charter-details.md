# PHASE 13: Generate Charter Details

Generate test approach (exploratory testing techniques and session-based testing), risks, resource requirements, and time estimates for test charters.

**Context**: This phase takes charter foundation from Phase 12 and generates detailed charter components including test approach, risks, resource requirements, and time estimates. All details are generated in memory and stored for file output in Phase 14.

## Core Responsibilities

1. **Access Charter Foundation**: Access charter foundation data from Phase 12
2. **Generate Test Approach**: Describe exploratory testing techniques and session-based testing
3. **Generate Risks**: Identify risks independently based on requirements
4. **Specify Resource Requirements**: Identify tester roles, skills needed, and tools required
5. **Calculate Time Estimates**: Calculate time estimates based on requirements count and complexity

## Workflow

### Step 1: Access Charter Foundation from Phase 12

Access charter foundation data from Phase 12:
- Mission/goal
- Scope (in/out)
- Areas to explore (complex areas, edge cases, integration points)
- Requirement structures from phases 5-8

Ensure charter foundation data is available before proceeding.

### Step 2: Generate Test Approach Description

Generate test approach description including exploratory testing techniques and session-based testing:

1. **Describe Exploratory Testing Techniques**:
   - Generate appropriate exploratory testing techniques for the scope
   - Include techniques relevant to requirement complexity and type
   - Consider exploration areas identified (complex areas, edge cases, integration points)
   - Ensure techniques are practical and actionable

2. **Include Session-Based Testing Approach**:
   - Describe session-based testing methodology
   - Include time-boxed exploratory sessions guidance
   - Provide charter-based exploration guidance
   - Explain session structure and flow

3. **Provide Session Execution Guidance**:
   - Include session debriefing and reporting guidance
   - Provide note-taking and bug reporting guidance during exploration
   - Include guidance on session documentation
   - Ensure approach is practical and actionable

4. **Structure Test Approach**:
   - Organize test approach clearly
   - Include sections for techniques, session methodology, and execution guidance
   - Ensure readability and clarity

### Step 3: Generate Risks Independently

Generate risks independently based on requirements being analyzed:

1. **Analyze Requirements for Potential Risks**:
   - Identify risks related to requirement complexity
     - High complexity requirements may have hidden issues
     - Complex workflows may have unexpected behaviors
   - Identify risks related to missing or unclear acceptance criteria
     - Missing AC may lead to incomplete testing
     - Unclear AC may lead to misinterpretation
   - Consider requirement quality scores from phase 7
     - Low quality scores indicate potential risks

2. **Identify Integration and Dependency Risks**:
   - Analyze integration points for potential risks
     - Integration failures may cause system-wide issues
     - External service dependencies may introduce risks
   - Consider requirement dependencies for risk identification
     - Dependency failures may cascade
     - Complex dependency chains increase risk
   - Identify risks related to edge cases and boundary conditions
     - Edge cases may reveal unexpected behaviors
     - Boundary conditions may cause system failures

3. **Structure Risks with Descriptions and Impact**:
   - Create clear risk descriptions
   - Identify potential impact of each risk
   - Consider likelihood and severity
   - Ensure risks are actionable and relevant

4. **Risk Structure**:
   ```javascript
   {
     riskId: "R-001",
     description: "Clear risk description",
     category: "Complexity" | "Integration" | "Acceptance Criteria" | "Edge Cases",
     potentialImpact: "Description of potential impact",
     relatedRequirement: "PROJ-123" | null
   }
   ```

### Step 4: Specify Resource Requirements

Specify resource requirements for exploratory testing:

1. **Specify Tester Roles Needed**:
   - Identify tester roles required for exploratory testing
   - Consider requirement complexity when determining roles
   - Consider exploration areas (complex areas may need senior testers)
   - Consider integration points (may need specialized testers)
   - Ensure roles are realistic and actionable

2. **Identify Skills Required**:
   - Determine skills needed for effective exploratory testing
   - Consider requirement domain knowledge needs
   - Consider technical skills needed (APIs, databases, etc.)
   - Consider testing skills (exploratory testing, session-based testing)
   - Ensure skills are specific and relevant

3. **List Tools Required**:
   - Identify browsers, testing tools, monitoring tools needed
   - Consider requirement type and complexity for tool selection
   - Consider integration points (may need API testing tools)
   - Consider edge cases (may need specialized tools)
   - Ensure tools are practical and available

4. **Structure Resource Requirements**:
   ```javascript
   {
     testerRoles: ["QA Analyst", "Senior QA Engineer"],
     skillsRequired: ["Domain knowledge", "API testing", "Exploratory testing"],
     toolsRequired: ["Chrome browser", "Postman", "Monitoring tools"]
   }
   ```

### Step 5: Calculate Time Estimates

Calculate time estimates based on requirements count and complexity:

1. **Calculate Based on Requirements Count**:
   - Count number of requirements to explore
   - Factor in requirements count for time calculation
   - Base calculation: Estimate time per requirement

2. **Factor in Complexity Analysis**:
   - Consider complexity of each requirement
   - Use quality scores from phase 7 for complexity assessment
   - Factor complexity into time estimates
   - High complexity requirements need more time

3. **Consider Exploration Areas and Integration Points**:
   - Factor in number of exploration areas identified
   - Consider integration points and dependencies
   - Adjust time estimates based on exploration scope
   - More exploration areas require more time

4. **Format Time Estimates Appropriately**:
   - Provide time estimates in appropriate units (hours, days, sessions)
   - Consider time-boxed sessions (e.g., 2-hour sessions)
   - Provide ranges when appropriate (e.g., 4-6 hours)
   - Ensure time estimates are realistic and practical

5. **Time Estimate Structure**:
   ```javascript
   {
     totalTime: "8-12 hours",
     timeBreakdown: {
       complexAreas: "4-6 hours",
       edgeCases: "2-3 hours",
       integrationPoints: "2-3 hours"
     },
     sessionEstimate: "4-6 sessions (2 hours each)"
   }
   ```

### Step 6: Combine Charter Details

Combine all charter details into complete charter structure:

1. **Charter Structure**:
   ```javascript
   {
     // From Phase 12
     context: "requirement" | "release",
     missionGoal: "...",
     scopeIn: [...],
     scopeOut: [...],
     areasToExplore: {...},
     
     // From Phase 13
     testApproach: {
       exploratoryTechniques: "...",
       sessionBasedTesting: "...",
       executionGuidance: "..."
     },
     risks: [...],
     resourceRequirements: {...},
     timeEstimates: {...}
   }
   ```

2. **Store Complete Charter**:
   - Store complete charter structure in memory
   - Maintain requirement-to-charter relationships
   - Ensure data is accessible for file generation

### Step 7: Confirm Charter Details Generation

After generating charter details for all charters:

1. **Verify Generation**:
   - Confirm test approach generated for all charters
   - Verify risks identified
   - Check resource requirements specified
   - Verify time estimates calculated

2. **Log Summary**:
   - Log total charters with details generated
   - Log risks identified
   - Log resource requirements
   - Log time estimates

3. **Proceed to Next Phase**:
   - Complete charters ready for file generation in Phase 14
   - Data structures ready for markdown output

## Output

After this phase, you should have:
- Test approach described (exploratory testing techniques and session-based testing)
- Risks generated independently based on requirements
- Resource requirements specified (tester roles, skills, tools)
- Time estimates calculated based on requirements count and complexity
- Complete charter structures stored in memory, ready for file output

## Error Handling

- **Missing Charter Foundation**: Skip charter if foundation not available
- **Incomplete Information**: Continue generation with available data
- **Missing Quality Scores**: Use requirement complexity indicators from description
- **Multiple Requirements**: Process all charters even if some have issues
- **Log Warnings**: Inform about charters that may need manual review

