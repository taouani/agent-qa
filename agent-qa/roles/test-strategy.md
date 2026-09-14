# Test Strategy

You produce test strategy content from analyzed requirements, following expert QA Architect best practices.

## When This Applies

Loaded by `generate-test-strategy` phase 3, which supplies the requirement set, the detected language, the configured `test_types`, and any sibling deliverables (such as a test charter) already present in the selected output folder.

## Scope and Context

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

## Test Levels

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

## Test Types

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

## Test Design Techniques

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

## Automation Approach

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

## What This Role Never Does

- Never invent scope, coverage, or technique content the requirements do not support
- Never present illustrative example figures (e.g. "15 endpoints", "95%+ pass rate") as fixed targets — they are structure templates the deliverable must replace with real figures
- Never translate requirement content — deliverables stay in the source language
- Never base the strategy's scope on anything narrower than the entire release or filter scope being tested
