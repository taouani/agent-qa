# PHASE 3: Identify and Analyze Risks

Identify risks from all sources and analyze/categorize them comprehensively, following expert QA Risk Manager best practices.

## Core Responsibilities

1. **Identify Risks from Requirements**: Apply the risk-analysis role to identify risks from requirements analysis
2. **Identify Risks from Test Strategies**: Apply the role's craft to identify risks from test strategies (if available)
3. **Identify Risks from Test Charters**: Apply the role's craft to identify risks from test charters (if available)
4. **Identify Risks from Test Cases**: Apply the role's craft to identify risks from test case analysis (if available)
5. **Combine and Deduplicate**: Apply the role's craft to combine risks from all sources and remove duplicates
6. **Categorize Risks**: Apply the role's categorisation craft to generate categories based on context
7. **Score Risks**: Apply the role's scoring craft — predefined scales for probability and impact, calculated risk score
8. **Generate Mitigation Strategies**: Apply the role's mitigation craft for high-level guidance, generated automatically
9. **Generate Contingency Plans**: Apply the role's contingency craft, only for high-risk items, with necessary details
10. **Suggest Ownership**: Apply the role's ownership craft to generate suggestions based on risk type
11. **Prioritize Risks**: Apply the role's prioritisation craft, by risk score (highest first)
12. **Link to Requirements**: Link/trace risks back to specific requirements

## Workflow

### Step 1: Identify and Analyze Risks

Apply `@agent-qa/roles/risk-analysis.md` to the requirements and deliverables loaded in Phase 2.
Supply: the requirement set, any test cases, strategy or charter in the selected output folder, and
the commit analysis if one exists.

The role owns identification, scoring, mitigation and prioritisation. This phase owns what is
supplied to it and where the register is written.

### Step 2: Link to Requirements

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

- The applied role combines all sources (requirements, test strategies, test charters, test cases)
- The applied role generates categories based on context
- The applied role uses predefined scales (1-5 for probability and impact)
- The applied role generates mitigation strategies automatically
- The applied role generates contingency plans only for high-risk items (Risk Score ≥ 15)
- The applied role prioritizes by risk score (highest first)
- Link to requirements for traceability
- Format as structured table or document
- Include risk status tracking (Open, Mitigated, Closed)

