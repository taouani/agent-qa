# PHASE 15: Generate Test Strategy Foundation

Generate test strategy foundation from analyzed requirement structures, including test levels (Integration, System, UAT) and test types identification.

**Context**: This phase processes in-memory requirement structures from phases 5-8 and generates test strategy foundation (test levels and test types) directly from them. Strategy foundation data is generated in memory and stored for detail generation and file output in subsequent phases.

## Core Responsibilities

1. **Access Requirement Structures**: Access in-memory requirement data from phases 5-8 only
2. **Generate Test Levels Coverage**: Generate Integration, System, and UAT test level approaches
3. **Identify Test Types**: Identify specific test types based on requirement characteristics
4. **Generate Test Type Approaches**: Describe approach for each identified test type
5. **Store Strategy Foundation**: Store generated strategy foundation in memory for detail generation

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

**IMPORTANT**: Do not read requirement files from disk. Work directly with in-memory data structures from phases 5-8 only. Do not use test cases as input. Generate independently based on requirements only.

### Step 2: Determine Strategy Context

Determine the context for strategy generation:
- **Single Requirement Context**: If processing a single Jira ticket, generate one strategy per requirement
- **Release/Filter Context**: If processing a Jira filter, generate one strategy covering the entire release/filter scope
- **Use Context from Phase 1**: Use the context folder type (`agent-qa/requirement/` or `agent-qa/release/`) to determine context
- **Consider Overall Scope**: Generate based on overall scope being tested (entire release/filter scope)

### Step 3: Generate Integration Testing Approach

Generate integration testing approach for requirements:

1. **Analyze Requirements for Integration Points**:
   - Identify integration points between components
   - Identify dependencies between requirements
   - Identify interfaces and APIs
   - Consider linked issues and relationships

2. **Describe Integration Testing Approach**:
   - Describe how integration testing will be performed
   - Base approach on requirement characteristics and scope
   - Consider integration points and dependencies
   - Ensure approach is clear and actionable

3. **For Single Requirements**:
   - Describe integration testing approach for the single requirement
   - Consider how it integrates with other components

4. **For Releases/Filters**:
   - Describe integration testing approach covering entire release/filter scope
   - Consider integration points across all requirements in scope

### Step 4: Generate System Testing Approach

Generate system testing approach for requirements:

1. **Analyze Requirements for System Behavior**:
   - Identify end-to-end workflows
   - Identify system-level functionality
   - Consider complete user journeys
   - Consider system behavior and interactions

2. **Describe System Testing Approach**:
   - Describe how system testing will be performed
   - Base approach on requirement characteristics and scope
   - Consider end-to-end workflows and system behavior
   - Ensure approach is clear and actionable

3. **For Single Requirements**:
   - Describe system testing approach for the single requirement
   - Consider how it fits into overall system behavior

4. **For Releases/Filters**:
   - Describe system testing approach covering entire release/filter scope
   - Consider end-to-end workflows across all requirements

### Step 5: Generate UAT (User Acceptance Testing) Approach

Generate UAT approach for requirements:

1. **Analyze Requirements for User Perspective**:
   - Identify user-facing functionality
   - Identify acceptance criteria
   - Consider user workflows and scenarios
   - Consider user expectations and business value

2. **Describe UAT Approach**:
   - Describe how UAT will be performed
   - Base approach on requirement characteristics and scope
   - Consider user perspectives and acceptance criteria
   - Ensure approach is clear and actionable

3. **For Single Requirements**:
   - Describe UAT approach for the single requirement
   - Consider user perspective and acceptance criteria

4. **For Releases/Filters**:
   - Describe UAT approach covering entire release/filter scope
   - Consider user perspectives across all requirements

### Step 6: Analyze Requirements for Test Type Indicators

Analyze requirements to identify test type indicators:

1. **Functional Testing Indicators**:
   - Requirements describing functional behavior
   - Requirements with clear functional specifications
   - Requirements with user interactions

2. **Performance Testing Indicators**:
   - Requirements mentioning performance, load, or scalability
   - Requirements with performance-related acceptance criteria
   - Requirements involving large data volumes or high traffic

3. **Security Testing Indicators**:
   - Requirements involving security, authentication, or data protection
   - Requirements with security-related acceptance criteria
   - Requirements involving sensitive data or access control

4. **Usability Testing Indicators**:
   - Requirements involving user interfaces or user experience
   - Requirements with UX-related acceptance criteria
   - Requirements involving user interactions and workflows

5. **Compatibility Testing Indicators**:
   - Requirements mentioning platforms, browsers, or devices
   - Requirements with compatibility-related acceptance criteria
   - Requirements involving cross-platform functionality

6. **Other Test Type Indicators**:
   - Identify other test types based on requirement characteristics
   - Consider requirement-specific testing needs

### Step 7: Select Relevant Test Types

Select test types that are relevant to the requirements:

1. **Focus on Specific Types**:
   - Only include test types that are relevant to the requirements
   - Do not include all test types regardless of requirements
   - Ensure test types match requirement characteristics

2. **For Single Requirements**:
   - Select test types relevant to the single requirement
   - Consider requirement-specific testing needs

3. **For Releases/Filters**:
   - Select test types relevant to entire release/filter scope
   - Consider testing needs across all requirements

4. **Ensure Relevance**:
   - Verify each test type is relevant to requirements
   - Remove test types that don't apply

### Step 8: Generate Approach for Each Identified Test Type

For each identified test type, generate approach description:

1. **Functional Testing Approach** (if identified):
   - Describe functional testing approach
   - Explain how functional testing will be performed
   - Base approach on requirement characteristics
   - Ensure approach is clear and actionable

2. **Performance Testing Approach** (if identified):
   - Describe performance testing approach
   - Explain how performance testing will be performed
   - Base approach on performance requirements
   - Ensure approach is clear and actionable

3. **Security Testing Approach** (if identified):
   - Describe security testing approach
   - Explain how security testing will be performed
   - Base approach on security requirements
   - Ensure approach is clear and actionable

4. **Usability Testing Approach** (if identified):
   - Describe usability testing approach
   - Explain how usability testing will be performed
   - Base approach on UX requirements
   - Ensure approach is clear and actionable

5. **Compatibility Testing Approach** (if identified):
   - Describe compatibility testing approach
   - Explain how compatibility testing will be performed
   - Base approach on compatibility requirements
   - Ensure approach is clear and actionable

6. **Other Test Type Approaches** (if identified):
   - Describe approach for other identified test types
   - Ensure each approach is clear and actionable

### Step 9: Structure Test Levels and Test Types Clearly

Organize test levels and test types:

1. **Organize Test Levels**:
   - Integration Testing (with approach)
   - System Testing (with approach)
   - UAT (with approach)
   - Ensure all three levels are covered

2. **Organize Test Types**:
   - List identified test types by relevance and priority
   - Include approach description for each type
   - Ensure each type is specific and actionable

3. **Ensure Clarity**:
   - Make test levels and test types clear and easy to understand
   - Ensure approaches are actionable
   - Structure content for readability

### Step 10: Store Strategy Foundation in Memory

Store generated strategy foundation in memory:

1. **Store Test Levels**:
   - Integration Testing approach
   - System Testing approach
   - UAT approach

2. **Store Test Types**:
   - List of identified test types
   - Approach description for each test type

3. **Store Context Information**:
   - Strategy context (single requirement or release/filter)
   - Requirement references
   - Scope information

4. **Prepare for Detail Generation**:
   - Ensure strategy foundation is available for Phase 16
   - Maintain requirement-to-strategy relationships

## Error Handling

- Handle requirements without sufficient information gracefully
- Continue strategy generation even when some requirements have issues
- Provide informative messages when test levels or test types cannot be determined
- Log warnings for requirements that may need manual strategy review
- Ensure graceful degradation for missing or incomplete data

## Output

- Strategy foundation stored in memory with test levels and test types
- Test levels: Integration, System, UAT (with approaches)
- Test types: Specific types based on requirements (with approaches)
- Ready for detail generation in Phase 16

