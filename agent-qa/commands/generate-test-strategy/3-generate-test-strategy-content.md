# PHASE 3: Generate Test Strategy Content

Generate comprehensive test strategy content based on requirements and test charter (if available), following expert QA Architect best practices.

## Core Responsibilities

1. **Generate Scope/Context**: Generate based on overall scope being tested (entire release/filter scope)
2. **Cover Test Levels**: Cover integration, system, and UAT levels with detailed approaches
3. **Cover Test Types**: Focus on specific types based on requirements
4. **Describe Test Design Techniques**: Based on requirement characteristics
5. **Generate Automation Approach**: High-level guidance with Playwright for automation
6. **Define Metrics**: Include coverage, defect, test execution, and progress metrics
7. **Risk-Based Testing**: Describe risk-based testing approach

## Workflow

### Step 1: Generate the Test Strategy Content

Apply `@agent-qa/roles/test-strategy.md` to the requirements loaded in Phase 2. Supply: the
requirement set, the detected language, the configured `test_types`, and any sibling deliverables
already present in the selected output folder.

The role owns how the test strategy is shaped. This phase owns what is supplied to it, where the
result lands, and the order of the remaining steps.

### Step 2: Define Metrics

Include comprehensive metrics:

**Coverage Metrics**:
- Requirements coverage percentage
- Acceptance criteria coverage
- Code coverage (if applicable)
- Test case coverage by requirement

**Defect Metrics**:
- Defect density (defects per requirement)
- Defect severity distribution
- Defect detection rate
- Defect resolution time

**Test Execution Metrics**:
- Test execution progress
- Pass/fail rates
- Test execution time
- Test stability (flakiness rate)

**Progress Metrics**:
- Test planning progress
- Test case creation progress
- Test execution progress
- Defect resolution progress

**Example Structure**:
```markdown
## Metrics and Reporting

### Coverage Metrics
- **Requirements Coverage**: Target 100% of requirements covered by test cases
- **Acceptance Criteria Coverage**: Target 100% of AC items validated
- **Test Case Coverage**: Average 3-5 test cases per requirement

### Defect Metrics
- **Defect Density**: Track defects per requirement
- **Severity Distribution**: Monitor critical/high/medium/low distribution
- **Detection Rate**: Track defects found per testing phase
- **Resolution Time**: Average time to resolve defects by severity

### Test Execution Metrics
- **Execution Progress**: Percentage of tests executed
- **Pass Rate**: Target 95%+ pass rate
- **Execution Time**: Track test execution duration
- **Stability**: Monitor flaky test rate (target <5%)

### Progress Metrics
- **Planning**: Test planning completion percentage
- **Test Creation**: Test case creation progress
- **Execution**: Test execution progress
- **Defect Resolution**: Defect resolution progress
```


### Step 3: Risk-Based Testing Approach

Describe risk-based testing strategy:

**Risk Assessment**:
- Identify high-risk areas from requirements
- Assess business impact
- Evaluate technical complexity
- Consider change frequency

**Risk-Based Prioritization**:
- Prioritize high-risk areas for testing
- Allocate more testing effort to critical areas
- Adjust test coverage based on risk

**Example Structure**:
```markdown
## Risk-Based Testing Approach

### Risk Assessment
**High-Risk Areas**:
- Payment processing (High business impact, critical functionality)
- User authentication (Security risk, high user impact)
- Data synchronization (Data integrity risk)

**Medium-Risk Areas**:
- Standard workflows (Moderate business impact)
- UI components (User experience impact)

**Low-Risk Areas**:
- Cosmetic features (Minimal business impact)
- Non-critical workflows

### Testing Focus
- **High-Risk**: Comprehensive testing, multiple test types, extensive coverage
- **Medium-Risk**: Standard testing approach, adequate coverage
- **Low-Risk**: Basic validation, minimal coverage
```


## Important Constraints

- Base strategy on requirements only (independent of test cases, but can reference test charter)
- Consider entire release/filter scope comprehensively
- Include test charter context if available
- Keep structure flexible and simple
- Follow expert QA Architect best practices
- Format as strategic document
- Include comprehensive details for each section

