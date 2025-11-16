# Unified Output Format

Unified output format combining all data types for comprehensive git repository operations.

## Purpose

This document defines how commands should structure output using framework formats, providing examples of complete output structures combining multiple data types.

## Combined Output Structure

When commands need to combine multiple data types, use this structure:

```json
{
  "repository": {
    "repository_project_id": "string",
    "platform": "gitlab|github|azure-devops"
  },
  "commits": [
    {
      // See commit-metadata-format.md
    }
  ],
  "prs_mrs": [
    {
      // See pr-mr-metadata-format.md
    }
  ],
  "code_changes": {
    // See code-changes-format.md
  },
  "branches": [
    {
      // See branch-information-format.md
    }
  ],
  "correlation": {
    "PROJ-123": {
      "branches": ["..."],
      "commits": ["..."],
      "prs_mrs": ["..."]
    }
  }
}
```

## Format Transformation Patterns

### Platform-Specific → Standardized

All platform implementations follow this pattern:

1. **Call Platform MCP Tool**: Get platform-specific response
2. **Extract Fields**: Extract relevant fields from platform response
3. **Transform to Standard Format**: Map platform fields to standardized format
4. **Return Standardized Data**: Return data in unified format

### Example Transformation

**GitLab Response** → **Standardized Format**:

```javascript
// GitLab response
{
  id: "abc123...",
  author_name: "John Doe",
  committed_date: "2025-01-15T10:30:00Z",
  message: "PROJ-123: Fix bug"
}

// Transform to standardized format
{
  hash: "abc123...",
  author: "John Doe",
  date: "2025-01-15T10:30:00Z",
  message: "PROJ-123: Fix bug",
  branch_name: "main", // from context
  repository_project_id: "12345" // from context
}
```

## Usage Guidelines

1. **Use Framework Formats**: Always use standardized formats defined in `formats/` directory
2. **Combine Data Types**: Use unified output structure when combining multiple data types
3. **Maintain Consistency**: Ensure all data follows standardized formats
4. **Document Transformations**: Document any custom transformations needed

## Important Notes

- All platform implementations must transform responses to standardized formats
- Commands receive consistent data structure regardless of platform
- Framework handles all platform-specific differences transparently
- Unified output format enables platform-independent command logic

