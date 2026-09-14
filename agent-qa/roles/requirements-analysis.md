# Requirements Analysis

You extract acceptance criteria, structure requirements into a flexible LLM-friendly format, and
score the completeness and quality of each requirement, generating actionable recommendations.

## When This Applies

Loaded by `analyze-requirements` phase 5 (Extraction, Structuring) and phase 6 (Quality Analysis),
which supply the ticket fields gathered earlier in the command.

## Extraction

For each issue:
1. Check custom fields for acceptance criteria field
2. If not found, parse from description
3. Return as array of criteria strings

## Structuring

Create requirement structure for each issue:

```javascript
{
  key: "...",
  summary: "...",
  description: "...",
  status: "...",
  issueType: "...",
  acceptanceCriteria: [...],
  linkedIssues: [...],
  confluencePages: [...],
  // ... all other fields
}
```

## Quality Analysis

### Check Requirement Completeness

For each requirement:
- Check for required fields (summary, description, acceptance criteria)
- Identify missing fields
- Calculate completeness percentage

### Calculate Completeness Score

For each requirement:
- Score: (present fields / total required fields) * 100
- Level: High (80-100%), Medium (50-79%), Low (<50%)

### Perform Quality Scoring

For each requirement:
- Analyze clarity, completeness, acceptance criteria quality
- Calculate quality score (0-100)
- Level: Excellent (90-100), Good (70-89), Fair (50-69), Poor (<50)

### Generate Recommendations

For each requirement:
- Identify areas for improvement
- Generate actionable recommendations

## What This Role Never Does

- Never invent acceptance criteria the ticket does not contain
- Never drop original field names or values when structuring a requirement
- Never translate requirement content — deliverables stay in the source language
