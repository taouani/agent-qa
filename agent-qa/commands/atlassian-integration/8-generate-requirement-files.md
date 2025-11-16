# PHASE 8: Generate Requirement Files

Generate individual requirement markdown files and summary index file in the appropriate context folder (`agent-qa/requirement/` or `agent-qa/release/`).

**Context**: This phase creates markdown files for each analyzed requirement and a summary index file, storing them in the context folder created in Phase 1.

## Core Responsibilities

1. **Generate Individual Files**: Create separate markdown file for each requirement
2. **Format Requirement Files**: Format files following agent-os markdown standards
3. **Create Summary Index**: Generate index file with links to all requirement files
4. **Calculate Statistics**: Include summary statistics in index file
5. **Write Files**: Store files in appropriate context folder

## Workflow

### Step 1: Access Analyzed Requirement Data

Access requirement structures from Phase 7:
- Requirements with completeness and quality analysis
- All requirement data available
- Ready for file generation

### Step 2: Determine Context Folder

Determine the appropriate context folder:
- If single ticket: Use `agent-qa/requirement/` (created in Phase 1)
- If filter/release: Use `agent-qa/release/` (created in Phase 1)
- Ensure folder exists before writing files

### Step 3: Generate Individual Requirement Files

For each requirement, create a markdown file:

1. **Generate Filename**: Create filename based on ticket key
   - Format: `requirement-{KEY}.md` (e.g., `requirement-PROJ-123.md`)
   - Handle special characters: Replace invalid characters with hyphens
   - Ensure unique filenames

2. **Format Requirement File**: Create markdown content following agent-os standards

```markdown
# Requirement: {KEY} - {Summary}

## Basic Information

| Field | Value |
|-------|-------|
| Key | {key} |
| ID | {id} |
| Summary | {summary} |
| Description | {description} |
| Status | {status} |
| Issue Type | {issueType} |
| Created | {created} |
| Updated | {updated} |

## People

| Role | Name | Email |
|------|------|-------|
| Assignee | {assignee.displayName} | {assignee.emailAddress} |
| Reporter | {reporter.displayName} | {reporter.emailAddress} |

## Acceptance Criteria

{If acceptance criteria present:}
{For each criterion:}
- {criterion}

{If missing:}
⚠️ **Missing Acceptance Criteria**: This requirement does not have acceptance criteria defined.

## Dependencies

{If dependencies exist:}
| Type | Related Requirement | Status |
|------|-------------------|--------|
| {type} | [{key}](requirement-{key}.md) | {status} |

{If no dependencies:}
No dependencies identified.

## Relationships

{If relationships exist:}
| Type | Related Requirement | Description |
|------|-------------------|-------------|
| {type} | [{key}](requirement-{key}.md) | {description} |

{If no relationships:}
No relationships identified.

## Linked Issues

{If linked issues exist:}
{For each linked issue:}
### [{key}](requirement-{key}.md) - {summary}
- Status: {status}
- Type: {issueType}
- Relationship: {relationship}

{If no linked issues:}
No linked issues.

## Confluence Content

{If Confluence pages exist:}
{For each page:}
### {title}
{content}

{If no Confluence pages:}
No Confluence pages linked.

## Quality Analysis

### Completeness
- **Score**: {completeness.score}%
- **Level**: {completeness.level}
- **Missing Fields**: {completeness.missingFields.join(", ")}

### Quality
- **Score**: {quality.score}/100
- **Level**: {quality.level}
- **Factors**:
  - Completeness: {quality.factors.completeness}%
  - Clarity: {quality.factors.clarity}%
  - Acceptance Criteria: {quality.factors.acceptanceCriteria}%
  - Relationship Coverage: {quality.factors.relationshipCoverage}%

### Recommendations
{For each recommendation:}
- {recommendation}

## Custom Fields

{If custom fields exist:}
| Field Name | Value |
|-----------|-------|
{For each custom field:}
| {name} | {value} |

{If no custom fields:}
No custom fields.

## Metadata

- Labels: {labels.join(", ")}
- Components: {components.map(c => c.name).join(", ")}
- Fix Versions: {fixVersions.map(v => v.name).join(", ")}
- Project: {project.name} ({project.key})
```

3. **Write File**: Write formatted markdown to file
   - Path: `{contextFolder}/requirement-{KEY}.md`
   - Ensure folder exists
   - Handle file write errors gracefully

### Step 4: Calculate Summary Statistics

Calculate statistics for all requirements:

```javascript
const statistics = {
  totalRequirements: requirements.length,
  completeness: {
    average: calculateAverage(requirements.map(r => r.completeness.score)),
    distribution: {
      high: countByLevel(requirements, "completeness", "High"),
      medium: countByLevel(requirements, "completeness", "Medium"),
      low: countByLevel(requirements, "completeness", "Low")
    }
  },
  quality: {
    average: calculateAverage(requirements.map(r => r.quality.score)),
    distribution: {
      excellent: countByLevel(requirements, "quality", "Excellent"),
      good: countByLevel(requirements, "quality", "Good"),
      fair: countByLevel(requirements, "quality", "Fair"),
      poor: countByLevel(requirements, "quality", "Poor")
    }
  },
  missingAC: requirements.filter(r => r.missingAcceptanceCriteria).length,
  withLinkedIssues: requirements.filter(r => r.linkedIssues && r.linkedIssues.length > 0).length,
  withConfluencePages: requirements.filter(r => r.confluencePages && r.confluencePages.length > 0).length
};
```

### Step 5: Generate Summary Index File

Create `requirements-index.md` file:

```markdown
# Requirements Index

## Summary Statistics

- **Total Requirements**: {totalRequirements}
- **Average Completeness**: {completeness.average}%
- **Average Quality Score**: {quality.average}/100
- **Missing Acceptance Criteria**: {missingAC} requirement(s)
- **With Linked Issues**: {withLinkedIssues} requirement(s)
- **With Confluence Pages**: {withConfluencePages} requirement(s)

## Completeness Distribution

- **High** (80-100%): {completeness.distribution.high} requirement(s)
- **Medium** (50-79%): {completeness.distribution.medium} requirement(s)
- **Low** (<50%): {completeness.distribution.low} requirement(s)

## Quality Distribution

- **Excellent** (90-100): {quality.distribution.excellent} requirement(s)
- **Good** (70-89): {quality.distribution.good} requirement(s)
- **Fair** (50-69): {quality.distribution.fair} requirement(s)
- **Poor** (<50): {quality.distribution.poor} requirement(s)

## Requirements List

{For each requirement:}
### [{key}](requirement-{key}.md) - {summary}
- **Status**: {status}
- **Type**: {issueType}
- **Completeness**: {completeness.score}% ({completeness.level})
- **Quality**: {quality.score}/100 ({quality.level})
- **Missing AC**: {missingAcceptanceCriteria ? "Yes" : "No"}

{Organize by status or type if needed}
```

### Step 6: Write Index File

Write index file to context folder:
- Path: `{contextFolder}/requirements-index.md`
- Ensure folder exists
- Handle file write errors gracefully

### Step 7: Output Confirmation

Output confirmation of file generation:

```
✅ Requirement files generated: [count] file(s)
✅ Files stored in: [contextFolder]
✅ Summary index created: requirements-index.md
✅ Statistics calculated and included in index
✅ All requirement files formatted following agent-os standards
```

## Important Constraints

- Follow agent-os markdown formatting standards
- Use descriptive filenames based on ticket keys
- Handle special characters in filenames
- Ensure folder exists before writing
- Include all requirement data in structured format
- Create proper markdown links between files
- Calculate accurate statistics
- Handle file write errors gracefully

