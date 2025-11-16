# Commit Metadata Format

Standardized format for commit metadata across all platforms.

## Purpose

This document defines the standardized format for commit metadata that all platform implementations must return, ensuring consistent data structure regardless of platform.

## Standardized Format

```json
{
  "hash": "string",
  "author": "string",
  "date": "string (ISO 8601)",
  "message": "string",
  "branch_name": "string",
  "repository_project_id": "string"
}
```

## Field Definitions

### hash

- **Type**: String
- **Description**: Commit hash/SHA
- **Format**: Full commit hash (e.g., "abc123def456...")
- **Required**: Yes

### author

- **Type**: String
- **Description**: Commit author name
- **Format**: Author display name (e.g., "John Doe")
- **Required**: Yes

### date

- **Type**: String
- **Description**: Commit date/time
- **Format**: ISO 8601 format (e.g., "2025-01-15T10:30:00Z")
- **Required**: Yes

### message

- **Type**: String
- **Description**: Full commit message
- **Format**: Plain text commit message
- **Required**: Yes

### branch_name

- **Type**: String
- **Description**: Branch name where commit was made
- **Format**: Branch name (e.g., "main", "feature-branch")
- **Required**: Yes

### repository_project_id

- **Type**: String
- **Description**: Repository identifier
- **Format**: Platform-specific format (GitLab: numeric/path, GitHub: owner/repo, Azure DevOps: project/repo)
- **Required**: Yes

## Platform Transformations

### GitLab

- `id` → `hash`
- `author_name` → `author`
- `committed_date` → `date` (convert to ISO 8601)
- `message` → `message`
- `branch_name` (from context) → `branch_name`
- `project_id` → `repository_project_id`

### GitHub

- `sha` → `hash`
- `commit.author.name` → `author`
- `commit.author.date` → `date` (convert to ISO 8601)
- `commit.message` → `message`
- `branch_name` (from context) → `branch_name`
- `owner/repo` → `repository_project_id`

### Azure DevOps

- `commitId` → `hash`
- `author.name` → `author`
- `author.date` → `date` (convert to ISO 8601)
- `comment` → `message`
- `branch_name` (from context) → `branch_name`
- `project/repository` → `repository_project_id`

## Array Format

When returning multiple commits, use array format:

```json
[
  {
    "hash": "...",
    "author": "...",
    ...
  },
  {
    "hash": "...",
    "author": "...",
    ...
  }
]
```

## Usage Example

All platform implementations must transform their responses to this format before returning to commands.

## Important Notes

- All dates must be in ISO 8601 format
- Commit hash should be full hash, not abbreviated
- Branch name should be included from context
- Repository identifier format varies by platform but is normalized in this field

