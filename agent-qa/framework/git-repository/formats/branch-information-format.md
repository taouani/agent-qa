# Branch Information Format

Standardized format for branch information across all platforms.

## Purpose

This document defines the standardized format for branch information that all platform implementations must return, ensuring consistent data structure regardless of platform.

## Standardized Format

```json
{
  "branch_name": "string",
  "commit_hash": "string",
  "commit_date": "string (ISO 8601)",
  "author": "string",
  "repository_project_id": "string"
}
```

## Field Definitions

### branch_name

- **Type**: String
- **Description**: Branch name
- **Format**: Branch name (e.g., "main", "feature-branch")
- **Required**: Yes

### commit_hash

- **Type**: String
- **Description**: Latest commit hash on branch
- **Format**: Full commit hash
- **Required**: Yes

### commit_date

- **Type**: String
- **Description**: Date of latest commit on branch
- **Format**: ISO 8601 format (e.g., "2025-01-15T10:30:00Z")
- **Required**: Yes

### author

- **Type**: String
- **Description**: Author of latest commit on branch
- **Format**: Author display name
- **Required**: Yes

### repository_project_id

- **Type**: String
- **Description**: Repository identifier
- **Format**: Platform-specific format
- **Required**: Yes

## Array Format

When returning multiple branches, use array format:

```json
[
  {
    "branch_name": "...",
    "commit_hash": "...",
    ...
  },
  {
    "branch_name": "...",
    "commit_hash": "...",
    ...
  }
]
```

## Platform Transformations

All platforms must extract branch information and latest commit details to populate this format.

## Usage Example

All platform implementations must transform their branch listing responses to this format before returning to commands.

## Important Notes

- Branch name should match exactly as stored in repository
- Commit hash should be full hash, not abbreviated
- Commit date must be in ISO 8601 format
- Repository identifier format varies by platform but is normalized in this field

