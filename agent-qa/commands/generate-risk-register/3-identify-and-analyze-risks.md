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

- Combination of all sources (requirements, test strategies, test charters, test cases)
- Generate categories based on context
- Use predefined scales (1-5 for probability and impact)
- Generate mitigation strategies automatically
- Only contingency plans for high-risk items (Risk Score ≥ 15)
- Prioritize by risk score (highest first)
- Link to requirements for traceability
- Format as structured table or document
- Include risk status tracking (Open, Mitigated, Closed)

