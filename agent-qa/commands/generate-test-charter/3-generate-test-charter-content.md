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

### Step 1: Generate Mission/Goal

Based on overall requirements scope:
- Analyze all requirements to understand overall goal and business value
- Generate mission statement that captures the testing objective clearly
- Align mission with requirements being tested
- Include business context and testing purpose
- Format as clear, actionable statement

**Example Structure**:
```markdown
## Mission/Goal

The mission of this test charter is to [primary testing objective] for [feature/component] 
by exploring [key areas] to ensure [business outcomes]. This charter focuses on 
[testing approach] to validate [critical aspects] and identify [potential issues].
```

### Step 2: Define Scope

Based on requirements analyzed:
- **In-Scope**: 
  - List all requirements being tested with their keys
  - Include related components and features
  - Specify testing boundaries clearly
- **Out-of-Scope**: 
  - Identify what is explicitly not being tested
  - Explain why items are out of scope
  - Reference dependencies or future work
- Base scope definition on requirements analyzed only

**Example Structure**:
```markdown
## Scope

### In-Scope
- **Requirements**: PROJ-123, PROJ-124, PROJ-125
- **Components**: User Authentication, Profile Management
- **Features**: Login flow, Password reset, Profile updates
- **Testing Focus**: Core user workflows and critical business logic

### Out-of-Scope
- **Not Included**: Performance testing, Load testing
- **Reason**: Covered by separate performance testing charter
- **Future Work**: Mobile app testing (web only for this charter)
```

### Step 3: Identify Areas to Explore

Analyze requirements comprehensively for:
- **Complex Areas**: 
  - Business logic complexity
  - Multi-step workflows
  - State transitions
  - Data dependencies
- **Edge Cases**: 
  - Boundary conditions
  - Extreme values
  - Unusual user behaviors
  - Error recovery scenarios
- **Integration Points**: 
  - API integrations
  - External system dependencies
  - Data synchronization
  - Cross-component interactions
- **Areas with Unclear Acceptance Criteria**: 
  - Ambiguous requirements
  - Missing specifications
  - Implicit expectations

**Example Structure**:
```markdown
## Areas to Explore

### Complex Areas
1. **Multi-factor Authentication Flow**
   - Token generation and validation
   - Session management across devices
   - Error handling during authentication

2. **Profile Data Synchronization**
   - Real-time updates across components
   - Conflict resolution
   - Data consistency validation

### Edge Cases
1. **Boundary Conditions**
   - Minimum/maximum field lengths
   - Date range validations
   - Numeric input limits

2. **Unusual User Behaviors**
   - Rapid clicking/button mashing
   - Browser back/forward navigation
   - Concurrent session handling

### Integration Points
1. **External API Integration**
   - Third-party authentication services
   - Payment gateway interactions
   - Data synchronization endpoints

### Unclear Requirements
1. **Profile Picture Upload**
   - File size limits not specified
   - Supported formats unclear
   - Error handling undefined
```

### Step 4: Describe Test Approach

Describe comprehensive testing approach:
- **Exploratory Testing Techniques**: 
  - Time-boxed exploration sessions
  - Charter-based exploration
  - Persona-based testing
  - Scenario-based exploration
- **Session-Based Testing**: 
  - Session structure and duration
  - Debriefing process
  - Note-taking approach
  - Bug reporting workflow
- **Testing Heuristics**: 
  - SFDIPOT (Structure, Function, Data, Interface, Platform, Operations, Time)
  - CRUSSPIC STMPL (Capability, Reliability, Usability, Security, Scalability, Performance, Installability, Compatibility, Supportability, Testability, Maintainability, Portability, Localizability)
  - Touring heuristics (Guidebook Tour, Money Tour, etc.)
- **How Testing Will Be Conducted**: 
  - Testing environment setup
  - Test data preparation
  - Execution approach
  - Reporting mechanism

**Example Structure**:
```markdown
## Test Approach

### Exploratory Testing Techniques
- **Time-boxed Sessions**: 90-minute exploration sessions with focused objectives
- **Charter-based Exploration**: Each session follows a specific charter objective
- **Persona-based Testing**: Test from different user perspectives (Admin, Standard User, Guest)
- **Scenario-based Exploration**: Follow realistic user journeys and workflows

### Session-Based Testing
- **Session Structure**: 
  - Preparation (10 min): Review requirements, set up test environment
  - Exploration (60 min): Active testing and exploration
  - Debriefing (20 min): Document findings, report issues, plan next session
- **Debriefing Process**: 
  - Document test notes and observations
  - Report bugs immediately
  - Update charter based on findings
  - Plan follow-up sessions if needed

### Testing Heuristics
- **SFDIPOT**: Structure (UI layout), Function (features), Data (inputs/outputs), 
  Interface (APIs), Platform (browsers/devices), Operations (deployment), Time (performance)
- **CRUSSPIC STMPL**: Focus on Security, Usability, Performance, Compatibility
- **Touring Heuristics**: Guidebook Tour (follow documentation), Money Tour (payment flows), 
  Landmark Tour (key features), Intellectual Tour (complex logic)

### Execution Approach
- **Environment**: Staging environment with test data
- **Test Data**: Use realistic production-like data
- **Tools**: Browser DevTools, API testing tools, Screen recording
- **Reporting**: Real-time bug reporting, session notes, daily summaries
```

### Step 5: Generate Risks

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

### Step 6: Specify Resources

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

### Step 7: Calculate Time Estimates

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

