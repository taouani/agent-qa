# PHASE 3: Generate Test Plan Content

Generate comprehensive test plan content based on requirements and related deliverables, following expert QA Manager best practices.

## Core Responsibilities

1. **Generate Executive Summary**: Create comprehensive executive summary
2. **Derive Test Objectives**: From test cases/test strategies with clear alignment
3. **Define Scope**: Based on requirements analyzed and test cases generated
4. **Integrate Test Strategy**: Reference or incorporate generated test strategies (link to files)
5. **Generate Environment Requirements**: High-level guidance for test environments
6. **Generate Schedules**: Provide time estimates/ranges, include milestones, phases
7. **Generate Entry/Exit Criteria**: Prerequisites for starting testing and completion conditions
8. **List Deliverables**: All deliverables, referencing generated deliverables
9. **Risk Management**: Include risk management approach
10. **Approval Process**: Define approval and sign-off process

## Workflow

### Step 1: Generate the Test Plan Content

Apply `@agent-qa/roles/test-planning.md`, using its `## Test Plan` section, to the requirements
loaded in Phase 2. Supply: the requirement set, the detected language, the configured `test_types`,
and any sibling deliverables already present in the selected output folder.

The role owns how the test plan is shaped. This phase owns what is supplied to it, where the
result lands, and the order of the remaining steps.

### Step 2: Generate Schedules

Provide comprehensive schedules:

**Example Structure**:
```markdown
## Schedule and Milestones

### Overall Timeline
- **Start Date**: [Date]
- **End Date**: [Date]
- **Total Duration**: [X] weeks/days

### Testing Phases

#### Phase 1: Test Planning and Preparation ([Duration])
- **Activities**: Test case review, environment setup, test data preparation
- **Deliverables**: Test cases ready, environment configured
- **Milestone**: Test planning complete

#### Phase 2: Test Case Execution ([Duration])
- **Activities**: Execute test cases, report defects, track progress
- **Deliverables**: Test execution results, defect reports
- **Milestone**: Test execution complete

#### Phase 3: Defect Resolution and Retesting ([Duration])
- **Activities**: Defect verification, retesting, regression testing
- **Deliverables**: Defect resolution status, retest results
- **Milestone**: All critical defects resolved

#### Phase 4: Test Closure and Reporting ([Duration])
- **Activities**: Test summary, metrics collection, final reporting
- **Deliverables**: Test summary report, metrics dashboard
- **Milestone**: Test closure complete

### Time Estimates
- **Test Planning**: [X] hours/days
- **Test Execution**: [X] hours/days
- **Defect Resolution**: [X] hours/days
- **Test Closure**: [X] hours/days
- **Buffer**: [X] hours/days (20% buffer recommended)

### Resource Allocation
- **Testers**: [Number] testers allocated
- **Hours per Tester**: [X] hours per tester
- **Total Effort**: [X] person-hours
```


### Step 3: Generate Entry/Exit Criteria

Define comprehensive criteria:

**Example Structure**:
```markdown
## Entry and Exit Criteria

### Entry Criteria (Prerequisites for Starting Testing)
- **Requirements**: All requirements analyzed and documented
- **Test Cases**: Test cases created and reviewed
- **Environment**: Test environment configured and accessible
- **Test Data**: Test data prepared and available
- **Access**: Test user accounts created with proper permissions
- **Tools**: Testing tools installed and configured
- **Team**: Testing team assigned and available

### Exit Criteria (Completion Conditions)
- **Test Execution**: All planned test cases executed
- **Pass Rate**: 95%+ test execution pass rate achieved
- **Defect Resolution**: All critical and high-severity defects resolved
- **Coverage**: 100% requirements coverage achieved
- **Documentation**: All test deliverables completed
- **Sign-off**: Test plan approved by stakeholders
- **Metrics**: All defined metrics collected and reported
```


### Step 4: List Deliverables

List all deliverables comprehensively:

**Example Structure**:
```markdown
## Deliverables

### Test Planning Deliverables
- **Test Plan**: This document (`test-plan.md`)
- **Test Strategy**: Comprehensive test strategy (`test-strategy.md`)
- **Test Cases**: [Number] test cases (`test-cases/` folder)
- **Test Charter**: Exploratory test charter (`test-charter.md`)

### Test Execution Deliverables
- **Test Execution Results**: Test execution reports
- **Defect Reports**: Defect tracking and status
- **Test Metrics**: Coverage, progress, quality metrics
- **Daily Status Reports**: Daily testing progress updates

### Test Closure Deliverables
- **Test Summary Report**: Comprehensive test summary
- **Metrics Dashboard**: Final metrics and analysis
- **Lessons Learned**: Testing insights and improvements
- **Recommendations**: Recommendations for future releases

### Traceability Deliverables
- **Traceability Matrix**: Requirements to test cases mapping
- **Coverage Report**: Requirements and acceptance criteria coverage
- **Risk Register**: Risk assessment and mitigation status (`risk-register.md`)
```


### Step 5: Risk Management

Include risk management approach:

**Example Structure**:
```markdown
## Risk Management

### Risk Identification
Risks identified from requirements analysis, test strategy, and test charter:
- See detailed risk register: `risk-register.md`

### Risk Mitigation
- **High Risks**: [Mitigation strategies]
- **Medium Risks**: [Mitigation strategies]
- **Low Risks**: [Monitoring approach]

### Contingency Plans
- **Environment Failures**: Backup environment available
- **Resource Unavailability**: Cross-training and backup resources
- **Schedule Delays**: Buffer time included, priority-based execution
```


### Step 6: Approval Process

Define approval and sign-off process:

**Example Structure**:
```markdown
## Approval Process

### Reviewers
- **QA Manager**: [Name] - Test plan review and approval
- **Project Manager**: [Name] - Scope and schedule approval
- **Business Analyst**: [Name] - Requirements alignment review

### Sign-off Criteria
- Test plan reviewed and approved
- Resources allocated and confirmed
- Schedule agreed upon
- Entry criteria met

### Approval Status
- [ ] QA Manager Approval
- [ ] Project Manager Approval
- [ ] Business Analyst Approval
- [ ] Final Sign-off
```


## Important Constraints

- Base plan on overall scope being tested
- Consider entire release/filter scope comprehensively
- Reference generated deliverables with file links
- Keep structure flexible and simple
- Follow expert QA Manager best practices
- Format professionally and comprehensively
- Include all standard test plan sections

