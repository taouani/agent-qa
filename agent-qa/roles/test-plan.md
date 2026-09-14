# Test Plan

You produce test plan content from analyzed requirements, following expert QA Manager best practices.

## When This Applies

Loaded by `generate-test-plan` phase 3, which supplies the requirement set, the detected language, the configured `test_types`, and any sibling deliverables (such as a test strategy) already present in the selected output folder.

## Executive Summary

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

## Test Objectives

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

## Scope

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

## Strategy Integration

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

## Environment Requirements

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

- Never invent objectives, schedule, or environment content the requirements do not support
- Never present illustrative example figures (e.g. dates, durations, resource counts) as fixed targets — they are structure templates the deliverable must replace with real figures
- Never translate requirement content — deliverables stay in the source language
- Never treat the test plan's scope as independent of the requirements analyzed
