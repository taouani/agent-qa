# PHASE 22: Generate Test Plan Details

Generate test strategy integration (reference/link), environment requirements (high-level guidance), schedules (time estimates/ranges with milestones and phases), and entry/exit criteria.

**Context**: This phase takes test plan foundation from Phase 21 and generates detailed test plan components including test strategy integration, environment requirements, schedules, and entry/exit criteria. All details are generated in memory and stored for file output in Phase 23.

## Core Responsibilities

1. **Access Test Plan Foundation**: Access test plan foundation data from Phase 21
2. **Integrate Test Strategy**: Identify test strategy files and create links
3. **Generate Environment Requirements**: Provide high-level guidance for environment requirements
4. **Generate Schedules**: Generate time estimates/ranges with milestones and phases
5. **Generate Entry Criteria**: Specify prerequisites for starting testing
6. **Generate Exit Criteria**: Specify completion conditions for testing

## Workflow

### Step 1: Access Test Plan Foundation from Phase 21

Access test plan foundation data from Phase 21:
- Executive summary
- Test objectives (derived from test cases and test strategies)
- Scope definition (requirements and test cases, in-scope and out-of-scope)
- File references from folders
- In-memory structures from phases 5-8, 9-11, 15-17, 12-14

Ensure test plan foundation data is available before proceeding.

### Step 2: Identify Test Strategy Files

Identify test strategy files in context folder:

1. **Determine Context Folder**:
   - If single ticket: Use `agent-qa/requirement/` (created in Phase 1)
   - If filter/release: Use `agent-qa/release/` (created in Phase 1)
   - Use context folder from Phase 1

2. **Locate Test Strategy Files**:
   - Identify test strategy files (from phases 15-17)
   - Look for files matching pattern `test-strategy-*.md`
   - For single requirements: Look for `test-strategy-{REQUIREMENT-KEY}.md`
   - For releases/filters: Look for `test-strategy-release.md` or `test-strategy-{CONTEXT}.md`

3. **Handle Missing Files**:
   - Handle missing test strategy files gracefully
   - Provide informative messages when files are not found
   - Continue test plan generation even if strategy files are missing

4. **Store File References**:
   - Store test strategy file paths and names
   - Prepare for linking in test plan

### Step 3: Create Links to Test Strategy Files

Create markdown links to test strategy files in test plan:

1. **Generate Markdown Links**:
   - Create markdown links to test strategy files
   - Use relative paths from test plan file location
   - Format links as `[Test Strategy: {Name}](./test-strategy-{KEY}.md)`
   - Ensure links are correct and accessible

2. **Reference Test Strategies Appropriately**:
   - Reference test strategies in test plan
   - Do not include test strategy content directly (link only)
   - Ensure test plan references test strategies appropriately

3. **Store Strategy Links**:
   - Store test strategy links
   - Prepare for use in phase 23

### Step 4: Generate Environment Requirements Guidance

Provide high-level guidance for environment requirements:

1. **Generate Test Environment Needs Guidance**:
   - Provide high-level guidance for test environment needs
   - Consider requirements and test cases for environment needs
   - Keep guidance high-level (not detailed specifications)
   - Ensure guidance is actionable but not prescriptive

2. **Generate Test Data Requirements Guidance**:
   - Provide high-level guidance for test data requirements
   - Consider test cases for test data needs
   - Keep guidance high-level
   - Ensure guidance is actionable but not prescriptive

3. **Generate Tools and Infrastructure Guidance**:
   - Provide high-level guidance for tools and infrastructure
   - Consider test strategies and test cases for tool needs
   - Keep guidance high-level
   - Ensure guidance is actionable but not prescriptive

4. **Generate Environment Setup Considerations**:
   - Provide high-level guidance for environment setup considerations
   - Consider requirements and test strategies for setup needs
   - Keep guidance high-level
   - Ensure guidance is actionable but not prescriptive

5. **Store Environment Requirements**:
   - Store environment requirements guidance
   - Prepare for use in phase 23

### Step 5: Generate Time Estimates/Ranges

Generate time estimates/ranges for testing activities:

1. **Base Estimates on Requirements**:
   - Consider number of requirements (from phases 5-8)
   - Estimate time based on requirement count
   - Consider requirement complexity for time estimates

2. **Base Estimates on Test Cases**:
   - Consider number of test cases generated (from phases 9-11)
   - Estimate time based on test case count
   - Consider test case types (positive, negative, edge cases) for time estimates

3. **Consider Complexity Analysis**:
   - Consider requirement complexity scores (from phase 7)
   - Consider test case complexity
   - Adjust time estimates based on complexity

4. **Consider Test Strategy and Charter Time Estimates**:
   - Consider test strategy time estimates (if available)
   - Consider test charter time estimates (from phases 12-14)
   - Use charter time estimates as reference for schedule planning

5. **Provide Time Estimates/Ranges**:
   - Provide time estimates as ranges (e.g., "2-3 weeks", "10-15 days")
   - Ensure estimates are realistic and practical
   - Consider overall testing scope

6. **Store Time Estimates**:
   - Store time estimates/ranges
   - Prepare for schedule structuring

### Step 6: Generate Milestones

Generate milestones for testing schedule:

1. **Identify Key Milestones**:
   - Identify key milestones in testing schedule
   - Base milestones on test phases and activities
   - Consider test levels (Integration, System, UAT) for milestones
   - Consider test types for milestones

2. **Structure Milestones**:
   - Structure milestones clearly
   - Include milestone names and descriptions
   - Include milestone target dates or timeframes
   - Format milestones for readability

3. **Store Milestones**:
   - Store milestones
   - Prepare for schedule structuring

### Step 7: Generate Phases

Generate phases for testing schedule:

1. **Identify Testing Phases**:
   - Identify testing phases in schedule
   - Base phases on test levels (Integration, System, UAT)
   - Base phases on test types
   - Consider test strategy phases

2. **Structure Phases**:
   - Structure phases clearly
   - Include phase names and descriptions
   - Include phase timeframes
   - Format phases for readability

3. **Store Phases**:
   - Store phases
   - Prepare for schedule structuring

### Step 8: Structure Schedules with Milestones and Phases

Structure schedules with milestones and phases:

1. **Combine Time Estimates, Milestones, and Phases**:
   - Combine time estimates, milestones, and phases
   - Create structured schedule
   - Ensure schedules are realistic and practical

2. **Structure Schedules Clearly**:
   - Structure schedules with clear organization
   - Include phases with milestones
   - Include time estimates/ranges
   - Format schedules for readability

3. **Store Schedules**:
   - Store structured schedules
   - Prepare for use in phase 23

### Step 9: Generate Entry Criteria

Generate entry criteria (prerequisites for starting testing):

1. **Specify Prerequisites**:
   - Specify prerequisites for starting testing
   - Base entry criteria on test cases and test strategies

2. **Include Standard Entry Criteria**:
   - Code complete/ready for testing
   - Environment ready and available
   - Test cases prepared
   - Test data available
   - Access and permissions granted

3. **Customize Entry Criteria**:
   - Customize entry criteria based on test cases
   - Customize entry criteria based on test strategies
   - Consider requirement dependencies for entry criteria
   - Ensure entry criteria are clear and actionable

4. **Structure Entry Criteria**:
   - Structure entry criteria clearly
   - Format entry criteria for readability
   - Ensure criteria are actionable

5. **Store Entry Criteria**:
   - Store entry criteria
   - Prepare for use in phase 23

### Step 10: Generate Exit Criteria

Generate exit criteria (completion conditions for testing):

1. **Specify Completion Conditions**:
   - Specify completion conditions for testing
   - Base exit criteria on test cases and test strategies

2. **Include Standard Exit Criteria**:
   - All test cases executed
   - Defect thresholds met
   - Test coverage achieved
   - Critical defects resolved
   - Sign-off obtained

3. **Customize Exit Criteria**:
   - Customize exit criteria based on test cases
   - Customize exit criteria based on test strategies
   - Consider test coverage requirements for exit criteria
   - Ensure exit criteria are clear and measurable

4. **Structure Exit Criteria**:
   - Structure exit criteria clearly
   - Format exit criteria for readability
   - Ensure criteria are measurable

5. **Store Exit Criteria**:
   - Store exit criteria
   - Prepare for use in phase 23

### Step 11: Store Test Plan Details Data

Store all test plan details data in memory:

1. **Store Details Components**:
   - Store test strategy links
   - Store environment requirements guidance
   - Store schedules (time estimates, milestones, phases)
   - Store entry criteria
   - Store exit criteria

2. **Maintain Data Relationships**:
   - Maintain test plan-to-source relationships
   - Ensure data is accessible for phase 23
   - Prepare for file output in phase 23

3. **Confirm Details Complete**:
   - Verify all details components are stored
   - Ensure data is ready for phase 23
   - Proceed to phase 23 when details are complete

## Output Confirmation

After completing this phase, you should have:

- ✅ Test strategy files identified in context folder
- ✅ Links created to test strategy files in test plan
- ✅ Environment requirements guidance generated (high-level)
- ✅ Time estimates/ranges generated
- ✅ Milestones generated and included in schedule
- ✅ Phases generated and included in schedule
- ✅ Schedules structured with milestones and phases
- ✅ Entry criteria generated (prerequisites for starting testing)
- ✅ Exit criteria generated (completion conditions)
- ✅ Criteria are clear, actionable, and measurable
- ✅ Test plan details stored in memory for phase 23

## Error Handling

- Handle missing or incomplete data gracefully
- Continue test plan generation even when some sources have issues
- Provide informative messages when data cannot be determined
- Log warnings for test plans that may need manual review
- Handle missing test strategy files gracefully (provide informative messages)
- Ensure graceful degradation for missing or incomplete data

