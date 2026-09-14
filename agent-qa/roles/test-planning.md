# Test Planning

You produce test strategy and test plan content from analyzed requirements, following expert QA
Architect and QA Manager best practices respectively.

## When This Applies

Loaded by `generate-test-strategy` phase 3, using the `## Test Strategy` section, and by
`generate-test-plan` phase 3, using the `## Test Plan` section. Both phases supply the requirement
set, the detected language, the configured `test_types`, and any sibling deliverables already
present in the selected output folder.

## Test Strategy

### Scope and Context

Based on overall scope being tested:
- Consider entire release/filter scope
- Generate comprehensive scope description
- Include context from requirements
- Reference test charter if available

**Example Structure**:
```markdown
## Testing Objectives and Scope

### Scope
This test strategy covers comprehensive testing for [release/filter name] including:
- **Requirements**: [List requirement keys or summary]
- **Components**: [List components/features]
- **Integration Points**: [List external systems/APIs]
- **User Workflows**: [List key user journeys]

### Context
- **Release Type**: [Major/Minor/Patch]
- **Business Impact**: [High/Medium/Low]
- **Target Users**: [User personas/roles]
- **Dependencies**: [External dependencies]
```


### Test Levels

Describe comprehensive approach for each level:

**Integration Testing**:
- **Objective**: Validate interactions between components/modules
- **Approach**: 
  - API integration testing
  - Component integration testing
  - Database integration validation
  - External system integration
- **Coverage**: All integration points identified in requirements
- **Tools**: API testing tools, integration test frameworks
- **Entry Criteria**: Unit tests passing, components deployed
- **Exit Criteria**: All integration scenarios passing, no critical defects

**System Testing**:
- **Objective**: Validate complete system functionality end-to-end
- **Approach**: 
  - End-to-end workflow testing
  - Cross-browser/platform testing
  - Data flow validation
  - Business rule validation
- **Coverage**: All functional requirements, user workflows
- **Tools**: Browser automation, manual testing tools
- **Entry Criteria**: Integration testing complete, system stable
- **Exit Criteria**: All system tests passing, requirements validated

**UAT (User Acceptance Testing)**:
- **Objective**: Validate system meets business requirements and user needs
- **Approach**: 
  - Business scenario validation
  - User workflow validation
  - Business rule verification
  - Usability assessment
- **Coverage**: Critical business workflows, user acceptance criteria
- **Tools**: Manual testing, user feedback collection
- **Entry Criteria**: System testing complete, business users available
- **Exit Criteria**: UAT sign-off, business acceptance

**Example Structure**:
```markdown
## Test Levels

### Integration Testing
**Objective**: Validate interactions between components and external systems.

**Approach**:
- API integration testing for all external service calls
- Component integration testing for internal module interactions
- Database integration validation for data persistence
- Message queue integration for asynchronous processing

**Coverage**: 
- All API endpoints (15 endpoints)
- Database operations (CRUD operations)
- External service integrations (3 services)

**Tools**: Postman, REST Assured, Database testing tools

**Entry Criteria**: 
- Unit tests passing (95%+ pass rate)
- Components deployed to integration environment

**Exit Criteria**: 
- All integration scenarios passing
- No critical or high-severity defects
- Performance within acceptable limits
```


### Test Types

Focus on specific types based on requirements analysis:

**Identify Relevant Test Types**:
- **Functional Testing**: Core business functionality (always included)
- **Security Testing**: Authentication, authorization, data protection (if security requirements exist)
- **Performance Testing**: Load, stress, response time (if performance requirements exist)
- **Usability Testing**: User experience, accessibility (if UI requirements exist)
- **Compatibility Testing**: Cross-browser, cross-platform (if multi-platform requirements exist)
- **Regression Testing**: Existing functionality validation (always included)

**Describe Approach for Each Type**:
- Testing objectives
- Scope and coverage
- Test approach and techniques
- Tools and resources
- Success criteria

**Example Structure**:
```markdown
## Test Types

### Functional Testing
**Objective**: Validate core business functionality meets requirements.

**Scope**: 
- All functional requirements (25 requirements)
- User workflows (8 workflows)
- Business rules (15 rules)

**Approach**: 
- Requirement-based testing
- Scenario-based testing
- User journey testing

**Tools**: Manual testing, test case management tools

### Security Testing
**Objective**: Validate security controls and data protection.

**Scope**: 
- Authentication mechanisms
- Authorization and access control
- Data encryption
- Input validation

**Approach**: 
- Security vulnerability scanning
- Penetration testing (if applicable)
- Security code review

**Tools**: OWASP ZAP, security scanning tools
```


### Test Design Techniques

Based on requirement characteristics, identify and describe appropriate techniques:

**Techniques to Consider**:
- **Equivalence Partitioning**: For input validation testing
- **Boundary Value Analysis**: For boundary condition testing
- **Decision Table Testing**: For complex business rules
- **State Transition Testing**: For workflow and state management
- **Use Case Testing**: For user scenario validation
- **Error Guessing**: For error handling scenarios

**Example Structure**:
```markdown
## Test Design Techniques

### Equivalence Partitioning
**Application**: Input field validation
**Example**: Email field - valid emails, invalid formats, empty values

### Boundary Value Analysis
**Application**: Numeric inputs, date ranges, string lengths
**Example**: Age field - minimum (18), maximum (120), boundary values (17, 18, 19, 119, 120, 121)

### Decision Table Testing
**Application**: Complex business rules with multiple conditions
**Example**: Discount calculation based on customer type, order amount, and membership status

### State Transition Testing
**Application**: Workflow and state management
**Example**: Order status transitions (Pending → Processing → Shipped → Delivered)
```


### Automation Approach

High-level guidance with Playwright focus:

**Automation Strategy**:
- **What to Automate**: 
  - Repetitive test scenarios
  - Regression test suite
  - Data-driven test cases
  - API integration tests
- **What NOT to Automate**: 
  - Exploratory testing
  - Usability testing
  - One-time test scenarios
  - Tests requiring human judgment
- **Playwright Framework**: 
  - Page Object Model pattern
  - Test data management
  - Configuration management
  - Reporting and logging
- **Automation Coverage**: 
  - Target automation percentage
  - Priority-based automation
  - ROI-based selection

**Example Structure**:
```markdown
## Automation Strategy

### Automation Approach
**Framework**: Playwright with TypeScript
**Pattern**: Page Object Model (POM)
**Coverage Target**: 60-70% of regression test suite

### What to Automate
- **Regression Tests**: All critical regression scenarios
- **API Tests**: All API endpoints and integration points
- **Data-Driven Tests**: Scenarios with multiple data variations
- **Smoke Tests**: Critical path validation

### What NOT to Automate
- **Exploratory Testing**: Manual exploration sessions
- **Usability Testing**: User experience validation
- **One-time Scenarios**: Unique test cases
- **Complex Business Logic**: Scenarios requiring human judgment

### Playwright Framework Structure
- **Pages**: Page Object Model classes for UI interactions
- **Tests**: Test specification files
- **Config**: Environment and test configuration
- **Utils**: Test data generators and helper functions
- **Fixtures**: Custom fixtures for dependency injection

### Automation Priorities
1. **P1**: Critical business workflows (automate first)
2. **P2**: High-frequency test scenarios
3. **P3**: Standard regression tests
4. **P4**: Low-priority scenarios (manual or deferred)
```


## Test Plan

### Executive Summary

Create comprehensive executive summary:

**Example Structure**:
```markdown
## Executive Summary

This test plan outlines the comprehensive testing approach for [release/filter name] 
covering [number] requirements across [number] components. The testing strategy focuses 
on [key testing objectives] to ensure [business outcomes]. 

**Key Highlights**:
- **Scope**: [X] requirements, [Y] test cases, [Z] components
- **Duration**: [timeframe] with [number] testers
- **Approach**: [testing approach summary]
- **Risk Level**: [High/Medium/Low] based on complexity and business impact
- **Success Criteria**: [key success indicators]

**Testing Phases**:
1. Test Planning and Preparation ([duration])
2. Test Case Execution ([duration])
3. Defect Resolution and Retesting ([duration])
4. Test Closure and Reporting ([duration])
```


### Test Objectives

From test cases and test strategies:
- Extract test objectives aligned with business goals
- Map objectives to requirements
- Include quality objectives
- Define success criteria

**Example Structure**:
```markdown
## Test Objectives

### Primary Objectives
1. **Functional Validation**: Validate all functional requirements meet acceptance criteria
2. **Quality Assurance**: Ensure system quality meets defined standards
3. **Risk Mitigation**: Identify and mitigate risks before production deployment

### Specific Objectives
- Verify [key functionality] works as specified
- Validate [critical workflows] meet business requirements
- Ensure [integration points] function correctly
- Confirm [data operations] maintain data integrity

### Success Criteria
- 100% of requirements covered by test cases
- 95%+ test execution pass rate
- All critical defects resolved
- Test strategy objectives achieved
```


### Scope

Based on requirements analyzed and test cases generated:

**Example Structure**:
```markdown
## Test Scope

### In-Scope
- **Requirements**: [List requirement keys or summary]
- **Test Cases**: [Number] test cases covering [areas]
- **Components**: [List components/features]
- **User Workflows**: [List key workflows]
- **Integration Points**: [List integrations]

### Out-of-Scope
- **Not Included**: [Items explicitly excluded]
- **Reason**: [Justification for exclusion]
- **Future Work**: [Items for future releases]

### Scope Boundaries
- **Start Date**: [Date]
- **End Date**: [Date]
- **Environments**: [List test environments]
- **Platforms**: [List platforms/browsers]
```


### Strategy Integration

Reference or incorporate test strategies:
- Link to test strategy files (if available)
- Include key strategy elements
- Reference test levels and types
- Link to automation approach

**Example Structure**:
```markdown
## Test Strategy

This test plan incorporates the comprehensive test strategy defined in [test-strategy.md].

**Key Strategy Elements**:
- **Test Levels**: Integration, System, UAT (see [test-strategy.md#test-levels])
- **Test Types**: Functional, Security, Performance (see [test-strategy.md#test-types])
- **Automation Approach**: Playwright framework (see [test-strategy.md#automation])
- **Risk-Based Testing**: Prioritized by business risk (see [test-strategy.md#risk-based])

For detailed strategy information, refer to: `test-strategy.md`
```


### Environment Requirements

High-level guidance for test environments:

**Example Structure**:
```markdown
## Test Environment and Tools

### Environment Requirements
- **Test Environment**: Staging environment matching production configuration
- **Database**: Test database with production-like data
- **External Services**: Mock services or test instances
- **Network**: Stable network connectivity

### Tools Required
- **Test Management**: Jira Xray for test case management
- **Bug Tracking**: Jira for defect management
- **Automation**: Playwright framework for automated tests
- **API Testing**: Postman/Insomnia for API validation
- **Performance**: [Performance testing tools if applicable]

### Environment Setup
- **Access**: Test user accounts with appropriate permissions
- **Data**: Test data sets for various scenarios
- **Configuration**: Environment-specific configuration files
- **Monitoring**: Logging and monitoring tools
```



## What This Role Never Does

- Never invent scope, risk, or metric content the requirements do not support
- Never present illustrative example figures (e.g. "15 endpoints", "95%+ pass rate") as fixed
  targets — they are structure templates the deliverable must replace with real figures
- Never translate requirement content — deliverables stay in the source language
- Never treat the test plan's scope as independent of the requirements analyzed
