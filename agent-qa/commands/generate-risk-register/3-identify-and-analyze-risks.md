# PHASE 3: Identify and Analyze Risks

Identify risks from all sources and analyze/categorize them comprehensively, following expert QA Risk Manager best practices.

## Core Responsibilities

1. **Identify Risks from Requirements**: Identify risks from requirements analysis
2. **Identify Risks from Test Strategies**: Identify risks from test strategies (if available)
3. **Identify Risks from Test Charters**: Identify risks from test charters (if available)
4. **Identify Risks from Test Cases**: Identify risks from test case analysis (if available)
5. **Combine and Deduplicate**: Combine risks from all sources, remove duplicates
6. **Categorize Risks**: Generate categories based on context
7. **Score Risks**: Use predefined scales for probability and impact, calculate risk score
8. **Generate Mitigation Strategies**: High-level guidance, generated automatically
9. **Generate Contingency Plans**: Only for high-risk items, necessary details
10. **Suggest Ownership**: Generate suggestions based on risk type
11. **Prioritize Risks**: By risk score (highest first)
12. **Link to Requirements**: Link/trace risks back to specific requirements

## Workflow

### Step 1: Identify Risks from All Sources

Identify risks comprehensively from:
- **Requirements** (required):
  - Complex business logic
  - Unclear acceptance criteria
  - Missing specifications
  - Dependencies and integration points
  - Data integrity concerns
- **Test Strategies** (if available):
  - Testing approach risks
  - Tool and resource limitations
  - Coverage gaps
  - Automation challenges
- **Test Charters** (if available):
  - Exploration risks
  - Time constraints
  - Skill gaps
  - Tool availability
- **Test Cases** (if available):
  - Coverage gaps identified
  - High-risk test areas
  - Areas with many edge cases
  - Complex test scenarios

### Step 2: Combine and Deduplicate

Combine risks from all sources:
- Merge similar risks
- Remove exact duplicates
- Consolidate related risks
- Maintain risk source information for traceability

### Step 3: Categorize Risks

Generate categories based on context:

**Common Categories**:
- **Technical Risks**: Technology, architecture, integration, performance
- **Requirements Risks**: Ambiguity, incompleteness, changes, dependencies
- **Process Risks**: Testing process, communication, coordination
- **Resource Risks**: Availability, skills, tools, time
- **Schedule Risks**: Timeline, delays, dependencies
- **Quality Risks**: Test coverage, defect detection, quality standards
- **Business Risks**: Business impact, user experience, compliance

**Example Risk Categories**:
```markdown
### Technical Risks
- API integration failures
- Performance degradation
- Data synchronization issues
- Security vulnerabilities

### Requirements Risks
- Unclear acceptance criteria
- Missing specifications
- Requirement changes
- Dependency on external systems

### Resource Risks
- Tester availability
- Skill gaps
- Tool limitations
- Time constraints
```

### Step 4: Score Risks

For each risk, use predefined scales:

**Probability Scale (1-5)**:
- **1 (Very Low)**: Unlikely to occur (<10%)
- **2 (Low)**: Possible but unlikely (10-30%)
- **3 (Medium)**: Moderate likelihood (30-50%)
- **4 (High)**: Likely to occur (50-70%)
- **5 (Very High)**: Very likely to occur (>70%)

**Impact Scale (1-5)**:
- **1 (Very Low)**: Minimal impact, easily recoverable
- **2 (Low)**: Minor impact, manageable
- **3 (Medium)**: Moderate impact, requires attention
- **4 (High)**: Significant impact, affects project success
- **5 (Very High)**: Critical impact, project failure risk

**Risk Score Calculation**:
- Risk Score = Probability × Impact
- Range: 1-25
- **High Risk**: Score 15-25 (requires immediate attention)
- **Medium Risk**: Score 8-14 (monitor closely)
- **Low Risk**: Score 1-7 (monitor periodically)

**Example Risk Scoring**:
```markdown
| Risk ID | Description | Category | Probability | Impact | Risk Score | Level |
|---------|-------------|----------|-------------|--------|------------|-------|
| R-001 | API integration failures | Technical | 4 | 5 | 20 | High |
| R-002 | Unclear acceptance criteria | Requirements | 3 | 4 | 12 | Medium |
| R-003 | Tester availability | Resource | 2 | 3 | 6 | Low |
```

### Step 5: Generate Mitigation Strategies

For each risk, generate high-level mitigation guidance automatically:

**Mitigation Strategy Types**:
- **Avoid**: Eliminate the risk by changing approach
- **Mitigate**: Reduce probability or impact
- **Transfer**: Shift risk to another party
- **Accept**: Acknowledge and monitor the risk

**Example Mitigation Strategies**:
```markdown
### Risk R-001: API Integration Failures
**Mitigation Strategies**:
- Early integration testing with mock services
- Establish API contracts and validation
- Implement retry mechanisms and error handling
- Monitor API health and performance
- Maintain fallback mechanisms

### Risk R-002: Unclear Acceptance Criteria
**Mitigation Strategies**:
- Schedule requirement clarification sessions
- Document assumptions and decisions
- Use exploratory testing to discover implicit requirements
- Regular stakeholder communication
- Create requirement traceability matrix
```

### Step 6: Generate Contingency Plans

For high-risk items only (Risk Score ≥ 15):
- Generate contingency plans
- Keep details necessary but simple
- Focus on actionable steps

**Example Contingency Plans**:
```markdown
### Risk R-001: API Integration Failures (High Risk)
**Contingency Plan**:
- **Trigger**: API failures occur during testing
- **Actions**:
  1. Immediately notify development team
  2. Switch to mock services for continued testing
  3. Document all API failures with details
  4. Escalate to project management if critical
  5. Plan retesting once API issues resolved
- **Owner**: QA Lead
- **Timeline**: Immediate response required
```

### Step 7: Suggest Ownership

For each risk, generate ownership suggestions based on risk type:

**Ownership Guidelines**:
- **Technical Risks**: Development Lead, Technical Architect
- **Requirements Risks**: Business Analyst, Product Owner
- **Process Risks**: QA Manager, Project Manager
- **Resource Risks**: Project Manager, Resource Manager
- **Schedule Risks**: Project Manager, Release Manager
- **Quality Risks**: QA Manager, QA Lead
- **Business Risks**: Product Owner, Business Stakeholder

**Example Ownership**:
```markdown
| Risk ID | Risk Description | Suggested Owner | Rationale |
|---------|------------------|-----------------|-----------|
| R-001 | API integration failures | Development Lead | Technical risk requiring technical expertise |
| R-002 | Unclear acceptance criteria | Business Analyst | Requirements risk requiring business clarification |
| R-003 | Tester availability | Project Manager | Resource risk requiring resource management |
```

### Step 8: Prioritize Risks

Sort risks by risk score (highest first):
- **Critical Priority**: Risk Score 20-25
- **High Priority**: Risk Score 15-19
- **Medium Priority**: Risk Score 8-14
- **Low Priority**: Risk Score 1-7

Within same score, prioritize by:
1. Business impact
2. Probability of occurrence
3. Urgency

### Step 9: Link to Requirements

Link each risk to specific requirements:
- **Direct Links**: Risks directly related to specific requirements
- **Indirect Links**: Risks affecting multiple requirements
- **Traceability**: Maintain requirement-to-risk mapping

**Example Traceability**:
```markdown
### Risk R-001: API Integration Failures
**Linked Requirements**:
- PROJ-123: User authentication (depends on auth API)
- PROJ-124: Payment processing (depends on payment API)
- PROJ-125: Data synchronization (depends on sync API)

**Impact**: Affects 3 requirements, all critical for release
```

## Important Constraints

- Combination of all sources (requirements, test strategies, test charters, test cases)
- Generate categories based on context
- Use predefined scales (1-5 for probability and impact)
- Generate mitigation strategies automatically
- Only contingency plans for high-risk items (Risk Score ≥ 15)
- Prioritize by risk score (highest first)
- Link to requirements for traceability
- Format as structured table or document
- Include risk status tracking (Open, Mitigated, Closed)

