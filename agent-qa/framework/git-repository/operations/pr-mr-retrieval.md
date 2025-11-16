# PR/MR Retrieval - Unified Interface

Unified interface for retrieving pull requests/merge requests across GitLab, GitHub, and Azure DevOps platforms.

## Purpose

This instruction file provides a unified interface for PR/MR retrieval operations. Commands should use this file instead of calling platform-specific MCP tools directly. The framework automatically routes to the appropriate platform-specific implementation.

## Core Responsibilities

1. **Get Platform Configuration**: Retrieve platform value from configuration
2. **Route to Platform Implementation**: Route to platform-specific implementation based on platform
3. **Return Standardized Output**: Return PR/MR data in standardized format regardless of platform

## Workflow

### Step 1: Get Platform Configuration

Retrieve the platform value from memory (set by `config/read-platform-config.md`).

### Step 2: Determine Operation Type

Determine which operation to perform:

- **Get by ID**: Retrieve a specific PR/MR by ID
- **Search**: Search PRs/MRs by title, description, or labels

### Step 3: Route to Platform Implementation

Based on the platform, route to the appropriate implementation:

- **If platform is `gitlab`**: Follow instructions in `operations/pr-mr-retrieval-gitlab.md`
- **If platform is `github`**: Follow instructions in `operations/pr-mr-retrieval-github.md`
- **If platform is `azure-devops`**: Follow instructions in `operations/pr-mr-retrieval-azure-devops.md`

### Step 4: Return Standardized Output

All platform implementations return PR/MR data in standardized format (see `formats/pr-mr-metadata-format.md`).

## Unified Parameters

**Required Parameters:**
- `repository_project_id` - Repository identifier (format varies by platform)

**For Get by ID:**
- `pr_mr_id` - PR/MR identifier (number or ID)

**For Search:**
- `search_query` - Search text to match in title, description, or labels

## Output Format

Returns standardized PR/MR metadata object or array (see `formats/pr-mr-metadata-format.md`).

## Usage Example

```markdown
## Step 1: Get PR by ID

Follow the instructions in: `agent-qa/framework/git-repository/operations/pr-mr-retrieval.md`

Operation: Get by ID
Parameters:
- repository_project_id: [from config or input]
- pr_mr_id: "123"
```

## Error Handling

Errors are handled according to `errors/common-error-handling.md`.

