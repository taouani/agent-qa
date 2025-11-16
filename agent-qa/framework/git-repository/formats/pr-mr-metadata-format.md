# PR/MR Metadata Format

Standardized format for pull request/merge request metadata across all platforms.

## Purpose

This document defines the standardized format for PR/MR metadata that all platform implementations must return, ensuring consistent data structure regardless of platform.

## Standardized Format

```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "status": "string",
  "merge_date": "string (ISO 8601) or null",
  "links": {
    "web_url": "string",
    "api_url": "string"
  },
  "repository_project_id": "string"
}
```

## Field Definitions

### id

- **Type**: String
- **Description**: PR/MR identifier
- **Format**: Platform-specific (GitLab: IID, GitHub: number, Azure DevOps: ID)
- **Required**: Yes

### title

- **Type**: String
- **Description**: PR/MR title
- **Format**: Plain text title
- **Required**: Yes

### description

- **Type**: String
- **Description**: PR/MR description/body
- **Format**: Plain text or markdown
- **Required**: Yes (may be empty string)

### status

- **Type**: String
- **Description**: PR/MR status
- **Format**: Standardized values: "open", "closed", "merged", "draft"
- **Required**: Yes

### merge_date

- **Type**: String or null
- **Description**: Date when PR/MR was merged
- **Format**: ISO 8601 format (e.g., "2025-01-15T10:30:00Z") or null if not merged
- **Required**: Yes

### links

- **Type**: Object
- **Description**: Links to PR/MR
- **Fields**:
  - `web_url`: Web URL to view PR/MR
  - `api_url`: API URL for PR/MR
- **Required**: Yes

### repository_project_id

- **Type**: String
- **Description**: Repository identifier
- **Format**: Platform-specific format
- **Required**: Yes

## Platform Transformations

### GitLab

- `iid` → `id`
- `title` → `title`
- `description` → `description`
- `state` → `status` (map: "opened"→"open", "closed"→"closed", "merged"→"merged")
- `merged_at` → `merge_date` (convert to ISO 8601)
- `web_url` → `links.web_url`
- `project_id` → `repository_project_id`

### GitHub

- `number` → `id`
- `title` → `title`
- `body` → `description`
- `state` → `status` (map: "open"→"open", "closed"→"closed")
- `merged_at` → `merge_date` (convert to ISO 8601)
- `html_url` → `links.web_url`
- `url` → `links.api_url`
- `owner/repo` → `repository_project_id`

### Azure DevOps

- `pullRequestId` → `id`
- `title` → `title`
- `description` → `description`
- `status` → `status` (map Azure DevOps status values)
- `closedDate` → `merge_date` (if merged, convert to ISO 8601)
- `url` → `links.web_url`
- `project/repository` → `repository_project_id`

## Usage Example

All platform implementations must transform their responses to this format before returning to commands.

## Important Notes

- Status values are standardized across platforms
- Merge date is null if PR/MR is not merged
- Links should include both web and API URLs when available
- Repository identifier format varies by platform but is normalized in this field

