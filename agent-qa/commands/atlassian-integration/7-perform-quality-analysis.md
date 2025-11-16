# PHASE 7: Perform Quality Analysis

Perform requirement completeness checks, missing acceptance criteria detection, and quality scoring to assess requirement quality and identify gaps.

**Context**: This phase analyzes requirements for completeness and quality, generating scores and indicators to help identify gaps and prioritize requirements.

## Core Responsibilities

1. **Check Completeness**: Identify missing critical information in requirements
2. **Generate Completeness Scores**: Calculate completeness percentages and indicators
3. **Detect Missing AC**: Flag requirements without acceptance criteria
4. **Calculate Quality Scores**: Score requirements based on data quality factors
5. **Include Analysis Results**: Add completeness and quality indicators to requirement structures

## Workflow

### Step 1: Access Enhanced Requirement Data

Access requirement structures from Phase 6:
- Requirements with linked issues and Confluence content
- All requirement fields available
- Ready for quality analysis

### Step 2: Check Requirement Completeness

For each requirement, check for critical information:

1. **Check Summary**: Verify summary field exists and is not empty
   - Required: Yes
   - Weight: High

2. **Check Description**: Verify description field exists and has content
   - Required: Yes
   - Weight: High
   - Check minimum length (e.g., > 10 characters)

3. **Check Acceptance Criteria**: Verify acceptance criteria present
   - Required: Recommended (not blocking)
   - Weight: High
   - Use `missingAcceptanceCriteria` flag from Phase 5

4. **Check Status**: Verify status field exists
   - Required: Yes
   - Weight: Medium

5. **Check Issue Type**: Verify issue type field exists
   - Required: Yes
   - Weight: Medium

6. **Check Assignee**: Verify assignee information available
   - Required: Recommended
   - Weight: Low

7. **Check Linked Content**: Verify linked issues or Confluence pages if referenced
   - Required: Conditional (if references exist)
   - Weight: Medium

### Step 3: Calculate Completeness Score

For each requirement, calculate completeness percentage:

```javascript
// Define field weights
const fieldWeights = {
  summary: 20,
  description: 20,
  acceptanceCriteria: 25,
  status: 10,
  issueType: 10,
  assignee: 5,
  linkedContent: 10  // If referenced
};

// Calculate completeness
let completenessScore = 0;
let totalWeight = 0;

// Check each field
if (requirement.summary && requirement.summary.length > 0) {
  completenessScore += fieldWeights.summary;
}
totalWeight += fieldWeights.summary;

if (requirement.description && requirement.description.length > 10) {
  completenessScore += fieldWeights.description;
}
totalWeight += fieldWeights.description;

if (requirement.acceptanceCriteria && requirement.acceptanceCriteria.length > 0) {
  completenessScore += fieldWeights.acceptanceCriteria;
}
totalWeight += fieldWeights.acceptanceCriteria;

// ... continue for all fields ...

// Calculate percentage
const completenessPercentage = (completenessScore / totalWeight) * 100;
```

### Step 4: Generate Completeness Indicators

Create completeness indicators:

```javascript
{
  completenessScore: 85,  // Percentage
  completenessLevel: "High",  // High (80-100%), Medium (50-79%), Low (<50%)
  missingFields: ["acceptanceCriteria", "assignee"],
  hasCriticalFields: true,
  hasRecommendedFields: false
}
```

### Step 5: Detect Missing Acceptance Criteria

For each requirement, check acceptance criteria:

1. **Check if AC Present**: Use `missingAcceptanceCriteria` flag from Phase 5
   - If flag is true, requirement has no acceptance criteria
   - If flag is false, check if array has items

2. **Flag Missing AC**: If no acceptance criteria found
   - Set `missingAcceptanceCriteria: true`
   - Set `acceptanceCriteriaQuality: "Missing"`
   - Do not block processing - flag only

3. **Assess AC Quality**: If acceptance criteria present
   - Count number of criteria
   - Assess clarity and specificity
   - Set `acceptanceCriteriaQuality: "Good" | "Fair" | "Poor"`

### Step 6: Calculate Quality Score

For each requirement, calculate overall quality score:

Consider factors:
1. **Completeness** (40% weight)
   - Use completeness score from Step 3
   - Higher completeness = higher quality

2. **Clarity** (20% weight)
   - Assess description clarity
   - Check for vague language
   - Evaluate summary quality

3. **Acceptance Criteria Presence** (25% weight)
   - Presence of acceptance criteria
   - Number of criteria
   - Quality of criteria

4. **Relationship Coverage** (15% weight)
   - Presence of dependencies
   - Linked issues available
   - Confluence content available

```javascript
const qualityFactors = {
  completeness: completenessScore,  // 0-100
  clarity: calculateClarityScore(requirement),  // 0-100
  acceptanceCriteria: calculateACScore(requirement),  // 0-100
  relationshipCoverage: calculateRelationshipScore(requirement)  // 0-100
};

const qualityScore = (
  qualityFactors.completeness * 0.40 +
  qualityFactors.clarity * 0.20 +
  qualityFactors.acceptanceCriteria * 0.25 +
  qualityFactors.relationshipCoverage * 0.15
);
```

### Step 7: Generate Quality Indicators

Create quality indicators:

```javascript
{
  qualityScore: 78,  // 0-100
  qualityLevel: "Good",  // Excellent (90-100), Good (70-89), Fair (50-69), Poor (<50)
  qualityFactors: {
    completeness: 85,
    clarity: 75,
    acceptanceCriteria: 80,
    relationshipCoverage: 70
  },
  recommendations: [
    "Add more acceptance criteria",
    "Enhance description clarity"
  ]
}
```

### Step 8: Include Analysis Results in Requirement Structure

Add completeness and quality analysis to each requirement:

```javascript
{
  // ... existing requirement fields ...
  
  // Completeness analysis
  completeness: {
    score: 85,
    level: "High",
    missingFields: ["acceptanceCriteria"],
    hasCriticalFields: true,
    hasRecommendedFields: false
  },
  
  // Missing AC flag
  missingAcceptanceCriteria: true,
  acceptanceCriteriaQuality: "Missing",
  
  // Quality analysis
  quality: {
    score: 78,
    level: "Good",
    factors: {
      completeness: 85,
      clarity: 75,
      acceptanceCriteria: 80,
      relationshipCoverage: 70
    },
    recommendations: [
      "Add acceptance criteria",
      "Enhance description"
    ]
  }
}
```

### Step 9: Output Confirmation

Output confirmation of quality analysis:

```
✅ Completeness analysis completed: [count] requirement(s)
✅ Completeness scores generated
✅ Missing AC detection completed
⚠️ Requirements without AC: [count] requirement(s)
✅ Quality scores calculated: [count] requirement(s)
✅ Quality indicators added to requirement structures
```

## Important Constraints

- Do not block processing for missing acceptance criteria - flag only
- Generate meaningful scores based on available data
- Provide clear indicators for prioritization
- Include recommendations for improvement
- Handle edge cases gracefully (empty fields, missing data)

