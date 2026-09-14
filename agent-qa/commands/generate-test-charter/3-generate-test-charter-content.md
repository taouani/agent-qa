# PHASE 3: Generate Test Charter Content

Generate comprehensive test charter content based on the loaded requirements, following expert QA Test Architect best practices.

## Core Responsibilities

1. **Generate Mission/Goal**: Create mission statement based on requirements scope
2. **Define Scope**: Define in-scope and out-of-scope items comprehensively
3. **Identify Areas to Explore**: Analyze requirements for complex areas, edge cases, integration points
4. **Describe Test Approach**: Describe exploratory testing techniques and session-based testing
5. **Generate Risks**: Generate risks independently based on requirements and test cases being analyzed
6. **Specify Resources**: Specify tester roles, skills needed, and tools required
7. **Calculate Time Estimates**: Based on number of requirements and complexity analysis

## Workflow

### Step 1: Generate the Test Charter Content

Apply `@agent-qa/roles/test-charter.md`, using its `## Test Charter` section, to the requirements
loaded in Phase 2. Supply: the requirement set, the detected language, the configured `test_types`,
and any sibling deliverables already present in the selected output folder.

The role owns how the test charter is shaped. This phase owns what is supplied to it, where the
result lands, and the order of the remaining steps.

### Step 2: Generate Risks

Generate risks independently based on:
- **Requirements Complexity**: 
  - Complex business logic
  - Multiple dependencies
  - Unclear specifications
- **Missing or Unclear Acceptance Criteria**: 
  - Ambiguous requirements
  - Incomplete specifications
  - Implicit expectations
- **Integration Points**: 
  - External system dependencies
  - API reliability
  - Data synchronization issues
- **Resource Constraints**: 
  - Time limitations
  - Skill gaps
  - Tool availability
- **Test Cases Being Analyzed**: 
  - Coverage gaps identified
  - High-risk areas from test case analysis
  - Areas with many edge cases

**Example Structure**:
```markdown
## Risks and Challenges

### Technical Risks
1. **API Integration Failures**
   - **Impact**: High - Could block core functionality
   - **Mitigation**: Early integration testing, mock services for testing

2. **Data Synchronization Issues**
   - **Impact**: Medium - Could cause data inconsistencies
   - **Mitigation**: Focused testing on sync mechanisms, validation checks

### Requirements Risks
1. **Unclear Acceptance Criteria**
   - **Impact**: Medium - Could lead to incomplete testing
   - **Mitigation**: Clarify with stakeholders, document assumptions

2. **Missing Specifications**
   - **Impact**: High - Could miss critical test scenarios
   - **Mitigation**: Identify gaps early, request clarification

### Resource Risks
1. **Time Constraints**
   - **Impact**: Medium - Could limit exploration depth
   - **Mitigation**: Prioritize high-risk areas, efficient session planning

2. **Tool Availability**
   - **Impact**: Low - Could slow down testing
   - **Mitigation**: Identify alternatives, plan tool setup early
```


### Step 3: Specify Resources

Specify comprehensive resource requirements:
- **Tester Roles**: 
  - Senior QA Engineer (lead exploration)
  - QA Engineer (support testing)
  - Business Analyst (requirement clarification)
- **Skills Needed**: 
  - Exploratory testing expertise
  - Domain knowledge (specific business area)
  - Technical skills (API testing, database queries)
  - Tool proficiency (browser DevTools, testing tools)
- **Tools Required**: 
  - Testing tools (browser, API clients)
  - Documentation tools (note-taking, bug tracking)
  - Analysis tools (log analysis, performance monitoring)
  - Collaboration tools (screen sharing, communication)

**Example Structure**:
```markdown
## Resources

### Tester Roles
- **Senior QA Engineer** (1): Lead exploratory sessions, complex scenario testing
- **QA Engineer** (1-2): Support testing, execute test scenarios
- **Business Analyst** (0.5): Requirement clarification, business rule validation

### Skills Needed
- **Exploratory Testing**: Experience with session-based testing, charter creation
- **Domain Knowledge**: Understanding of [business domain] workflows and processes
- **Technical Skills**: API testing, database queries, browser DevTools usage
- **Tool Proficiency**: Jira, Confluence, testing tools, bug tracking systems

### Tools Required
- **Testing Tools**: Chrome/Firefox browsers, Postman/Insomnia for API testing
- **Documentation**: Jira for bug tracking, Confluence for notes
- **Analysis**: Browser DevTools, log analysis tools, performance monitoring
- **Collaboration**: Screen sharing tools, team communication channels
```


### Step 4: Calculate Time Estimates

Based on comprehensive analysis:
- **Number of Requirements**: Count total requirements to test
- **Complexity Analysis**: 
  - Simple requirements: 1-2 hours each
  - Medium complexity: 2-4 hours each
  - High complexity: 4-8 hours each
- **Areas to Explore**: 
  - Estimate time per exploration area
  - Consider depth of exploration needed
- **Resource Availability**: 
  - Number of testers available
  - Session duration and frequency
  - Total available time

**Example Structure**:
```markdown
## Time Estimates

### Per Requirement
- **Simple Requirements** (3): 1-2 hours each = 3-6 hours
- **Medium Complexity** (5): 2-4 hours each = 10-20 hours
- **High Complexity** (2): 4-8 hours each = 8-16 hours

### Exploration Areas
- **Complex Areas**: 4-6 hours per area (2 areas) = 8-12 hours
- **Edge Cases**: 2-3 hours per area (3 areas) = 6-9 hours
- **Integration Points**: 3-4 hours per point (2 points) = 6-8 hours

### Total Estimate
- **Minimum**: 23 hours (3 days with 1 tester)
- **Recommended**: 35 hours (1 week with 1 tester or 3-4 days with 2 testers)
- **Comprehensive**: 45 hours (1.5 weeks with 1 tester or 1 week with 2 testers)

### Session Planning
- **Sessions**: 6-8 sessions of 90 minutes each
- **Duration**: 1-1.5 weeks
- **Frequency**: 2-3 sessions per day
```


## Important Constraints

- Base all content on requirements analyzed only
- Generate risks independently (not from test cases, but can consider test case analysis)
- Keep structure flexible and simple
- Use in-memory requirement structures
- Follow expert QA Test Architect best practices
- Format as clear, actionable document
- Include comprehensive details for each section

