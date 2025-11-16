# Diff Extraction - Unified Interface

Unified interface for extracting code diffs across GitLab, GitHub, and Azure DevOps platforms.

## Purpose

This instruction file provides a unified interface for diff extraction operations. Commands should use this file instead of calling platform-specific MCP tools directly.

## Core Responsibilities

1. **Get Platform Configuration**: Retrieve platform value from configuration
2. **Route to Platform Implementation**: Route to platform-specific implementation based on platform
3. **Return Standardized Output**: Return diff data in standardized format regardless of platform

## Workflow

### Step 1: Get Platform Configuration

Retrieve the platform value from memory.

### Step 2: Determine Operation Type

Determine which operation to perform:

- **Branch Diffs**: Get diff between branches
- **PR/MR Diffs**: Get diff for a specific PR/MR

### Step 3: Route to Platform Implementation

Route to platform-specific implementation based on platform.

### Step 4: Return Standardized Output

All platform implementations return diff data in standardized format (see `formats/code-changes-format.md`).

## Unified Parameters

**Required Parameters:**
- `repository_project_id` - Repository identifier

**For Branch Diffs:**
- `branch_name` - Target branch name
- `from_branch` - Source branch (optional, defaults to base branch)
- `to_branch` - Target branch (optional, defaults to branch_name)

**For PR/MR Diffs:**
- `pr_mr_id` - PR/MR identifier

## Output Format

Returns standardized code changes structure (see `formats/code-changes-format.md`).

## Usage Example

```markdown
## Step 1: Get Branch Diff

Follow the instructions in: `agent-qa/framework/git-repository/operations/diff-extraction.md`

Operation: Branch Diffs
Parameters:
- repository_project_id: [from config or input]
- branch_name: "feature-branch"
- from_branch: "main" (optional)
```

