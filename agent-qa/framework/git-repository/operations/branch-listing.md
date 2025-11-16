# Branch Listing - Unified Interface

Unified interface for listing branches across GitLab, GitHub, and Azure DevOps platforms.

## Purpose

This instruction file provides a unified interface for branch listing operations. Commands should use this file instead of calling platform-specific MCP tools directly.

## Core Responsibilities

1. **Get Platform Configuration**: Retrieve platform value from configuration
2. **Route to Platform Implementation**: Route to platform-specific implementation based on platform
3. **Return Standardized Output**: Return branch data in standardized format regardless of platform

## Workflow

### Step 1: Get Platform Configuration

Retrieve the platform value from memory.

### Step 2: Route to Platform Implementation

Route to platform-specific implementation based on platform.

### Step 3: Return Standardized Output

All platform implementations return branch data in standardized format (see `formats/branch-information-format.md`).

## Unified Parameters

**Required Parameters:**
- `repository_project_id` - Repository identifier

**Optional Parameters:**
- `filter_contains` - Filter branches by name containing this string
- `top` - Maximum number of branches to return

## Output Format

Returns array of standardized branch information objects (see `formats/branch-information-format.md`).

## Usage Example

```markdown
## Step 1: List Branches

Follow the instructions in: `agent-qa/framework/git-repository/operations/branch-listing.md`

Parameters:
- repository_project_id: [from config or input]
- filter_contains: "PROJ-123" (optional)
- top: 100 (optional)
```

