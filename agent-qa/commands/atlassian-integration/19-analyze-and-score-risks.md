# PHASE 19: Analyze and Score Risks

Categorize risks based on context, score risks using predefined scales (probability and impact), prioritize risks by risk score, and generate ownership suggestions.

**Context**: This phase takes identified risks from Phase 18 and performs risk analysis including categorization, scoring, prioritization, and ownership suggestions. All analysis is performed in memory and stored for file output in Phase 20.

## Core Responsibilities

1. **Access Identified Risks**: Access risk data from Phase 18
2. **Categorize Risks**: Generate context-based categories for each risk
3. **Score Risks**: Determine probability and impact using predefined scales, calculate risk score
4. **Prioritize Risks**: Sort risks by risk score (highest first)
5. **Generate Ownership Suggestions**: Generate ownership suggestions based on risk type
6. **Store Complete Risk Data**: Store complete risk structures in memory for file output

## Workflow

### Step 1: Access Identified Risks from Phase 18

Access risk data from Phase 18:
- Risk IDs and descriptions
- Risk sources (requirements, test strategies, test charters)
- Requirement traceability
- Risk identification context

Ensure risk data is available before proceeding.

### Step 2: Analyze Risk Characteristics

Analyze each risk to determine characteristics:

1. **Analyze Risk Description**:
   - Review risk description and context
   - Identify risk type indicators
   - Understand risk impact area

2. **Consider Risk Source**:
   - Consider whether risk came from requirements, test strategies, or test charters
   - Consider source-specific characteristics
   - Consider risk context from source

3. **Consider Risk Impact Area**:
   - Identify what area the risk affects (technical, requirements, testing, schedule, resources)
   - Consider scope of impact
   - Consider severity of potential impact

### Step 3: Generate Context-Based Categories

Generate appropriate category for each risk based on context:

1. **Technical Risk Categories** (if applicable):
   - Architecture risks (system design, component design)
   - Integration risks (component integration, system integration, API integration)
   - Performance risks (performance, scalability, load)
   - Security risks (authentication, authorization, data protection)
   - Compatibility risks (platforms, browsers, devices)

2. **Requirements Risk Categories** (if applicable):
   - Ambiguity risks (unclear requirements, vague descriptions)
   - Missing information risks (incomplete specifications, missing details)
   - Change risks (requirement changes, scope creep)
   - Dependency risks (blocking dependencies, circular dependencies)

3. **Testing Risk Categories** (if applicable):
   - Coverage gap risks (insufficient test coverage, missing test types)
   - Testability risks (difficult to test, unclear test approach)
   - Environment risks (test environment issues, environment availability)
   - Automation risks (automation challenges, automation scope gaps)

4. **Schedule Risk Categories** (if applicable):
   - Timeline risks (schedule delays, timeline constraints)
   - Dependency risks (dependency delays, blocking dependencies)
   - Resource availability risks (resource unavailability, resource constraints)

5. **Resource Risk Categories** (if applicable):
   - Skills risks (skill gaps, insufficient expertise)
   - Availability risks (resource unavailability, resource allocation)
   - Tools risks (tool limitations, tool availability)
   - Capacity risks (insufficient capacity, capacity constraints)

6. **Assign Categories**:
   - Assign appropriate category to each risk
   - Ensure categories are relevant and meaningful
   - Handle risks that may fit multiple categories (assign primary category)
   - Ensure category assignment is consistent

### Step 4: Determine Probability for Each Risk

Determine probability using predefined scales:

1. **Use Predefined Probability Scale**:
   - Scale: Low, Medium, High (or 1-5 numeric scale)
   - Map to numeric values: Low=1, Medium=2, High=3 (or 1-5)

2. **Analyze Risk Characteristics**:
   - Consider likelihood of risk occurrence
   - Consider risk source and context
   - Consider historical patterns (if available)
   - Consider current project state

3. **Assign Probability**:
   - Assign probability value to each risk
   - Ensure probability assessment is consistent
   - Use risk characteristics to guide assessment

### Step 5: Determine Impact for Each Risk

Determine impact using predefined scales:

1. **Use Predefined Impact Scale**:
   - Scale: Low, Medium, High (or 1-5 numeric scale)
   - Map to numeric values: Low=1, Medium=2, High=3 (or 1-5)

2. **Analyze Risk Characteristics**:
   - Consider potential impact on project
   - Consider requirement importance and scope
   - Consider impact on testing, delivery, quality
   - Consider business impact

3. **Assign Impact**:
   - Assign impact value to each risk
   - Ensure impact assessment is consistent
   - Use risk characteristics to guide assessment

### Step 6: Calculate Risk Score

Calculate risk score for each risk:

1. **Map Scales to Numeric Values**:
   - Map probability scale: Low=1, Medium=2, High=3 (or 1-5)
   - Map impact scale: Low=1, Medium=2, High=3 (or 1-5)

2. **Calculate Risk Score**:
   - Formula: Risk Score = Probability × Impact
   - Calculate for each risk
   - Ensure risk scores are consistent and comparable

3. **Risk Score Examples**:
   - Low probability (1) × Low impact (1) = Risk Score 1
   - Medium probability (2) × Medium impact (2) = Risk Score 4
   - High probability (3) × High impact (3) = Risk Score 9

### Step 7: Prioritize Risks by Risk Score

Prioritize risks by risk score:

1. **Sort Risks by Risk Score**:
   - Sort risks by risk score (highest first)
   - Ensure risk register output is ordered by priority

2. **Identify High-Risk Items**:
   - Identify risks with high risk score (e.g., score >= 6 or High probability × High impact)
   - Mark high-risk items for contingency planning
   - Ensure high-risk items are clearly identified

3. **Group Risks by Category** (optional):
   - Group risks by category for easier review
   - Maintain priority order within each category
   - Ensure grouping doesn't disrupt priority order

### Step 8: Generate Ownership Suggestions

Generate ownership suggestions based on risk type:

1. **Map Risk Categories to Owner Roles**:
   - **Technical risks** → Technical Lead, Architect, Development Lead
   - **Requirements risks** → Product Owner, Business Analyst, Requirements Owner
   - **Testing risks** → QA Manager, Test Lead, QA Analyst
   - **Schedule risks** → Project Manager, Release Manager
   - **Resource risks** → Resource Manager, Team Lead

2. **Generate Ownership Suggestions**:
   - Generate ownership suggestion based on risk category
   - Provide primary owner suggestion
   - Provide alternative owner suggestions if applicable
   - Ensure suggestions are appropriate for risk type

3. **Provide Suggestions, Not Assignments**:
   - Provide ownership suggestions, not definitive assignments
   - Allow for manual override/adjustment
   - Ensure suggestions are clear and actionable

### Step 9: Store Complete Risk Data in Memory

Store complete risk structures in memory:

1. **Store Risk Fields**:
   - Risk ID
   - Risk description
   - Risk category
   - Probability (scale value)
   - Impact (scale value)
   - Risk score (calculated)
   - Ownership suggestions
   - Requirement traceability

2. **Store Analysis Data**:
   - Risk categorization rationale
   - Probability assessment rationale
   - Impact assessment rationale
   - Ownership suggestion rationale

3. **Prepare for File Output**:
   - Ensure complete risk data is available for Phase 20
   - Maintain risk-to-source relationships
   - Store risk prioritization order

## Error Handling

- Handle missing or incomplete risk data gracefully
- Continue risk analysis even when some risks have issues
- Provide informative messages when analysis cannot be determined
- Log warnings for risks that may need manual review
- Ensure graceful degradation for missing or incomplete data

## Output

- Risks categorized based on context
- Risks scored using predefined scales (probability, impact, risk score)
- Risks prioritized by risk score (highest first)
- High-risk items identified for contingency planning
- Ownership suggestions generated based on risk type
- Complete risk data stored in memory
- Ready for file output in Phase 20

