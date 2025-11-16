# Quick Start Guide

Quick start guide for command developers using the Git Repository Integration Framework.

## Getting Started

This guide shows you how to use the framework in a new command that needs git repository access.

## Basic Workflow

### Step 1: Read Platform Configuration

```markdown
## Step 1: Read Platform Configuration

Follow the instructions in: `agent-qa/framework/git-repository/config/read-platform-config.md`

Store the platform value for use in subsequent steps.
```

### Step 2: Validate MCP Server

```markdown
## Step 2: Validate MCP Server

Follow the instructions in: `agent-qa/framework/git-repository/config/validate-mcp-server.md`

Ensure MCP server is available before proceeding.
```

### Step 3: Get Repository Project ID

```markdown
## Step 3: Get Repository Project ID

Follow the instructions in: `agent-qa/framework/git-repository/config/manage-project-id.md`

Store the project ID for use in repository operations.
```

### Step 4: Perform Repository Operations

```markdown
## Step 4: Search Commits

Follow the instructions in: `agent-qa/framework/git-repository/operations/commit-search.md`

Parameters:
- repository_project_id: [from Step 3]
- branch_name: "main" (optional)
- commit_message: "PROJ-123" (optional)

The framework automatically routes to the correct platform implementation.
```

## Minimal Working Example

Here's a minimal example of a command phase that uses the framework:

```markdown
# PHASE 1: Initialize and Search Commits

## Step 1: Read Platform Configuration

Follow the instructions in: `agent-qa/framework/git-repository/config/read-platform-config.md`

## Step 2: Validate MCP Server

Follow the instructions in: `agent-qa/framework/git-repository/config/validate-mcp-server.md`

## Step 3: Get Repository Project ID

Follow the instructions in: `agent-qa/framework/git-repository/config/manage-project-id.md`

## Step 4: Search Commits

Follow the instructions in: `agent-qa/framework/git-repository/operations/commit-search.md`

Parameters:
- repository_project_id: [from Step 3]
- branch_name: "main"

Store the commits in standardized format for use in subsequent steps.
```

## Available Operations

- **Commit Search**: `operations/commit-search.md`
- **PR/MR Retrieval**: `operations/pr-mr-retrieval.md`
- **Diff Extraction**: `operations/diff-extraction.md`
- **Branch Listing**: `operations/branch-listing.md`

## Correlation Methods

- **Branch Name Matching**: `correlation/branch-name-matching.md`
- **Commit Message Parsing**: `correlation/commit-message-parsing.md`
- **PR/MR Matching**: `correlation/pr-mr-matching.md`
- **Unified Correlation**: `correlation/unified-correlation.md`

## Error Handling

Always use framework error handling:

```markdown
## Error Handling

Follow the instructions in: `agent-qa/framework/git-repository/errors/common-error-handling.md`

Handle errors according to standardized patterns.
```

## Next Steps

- See [Framework Index](framework-index.md) for complete operation reference
- See [Examples](EXAMPLES.md) for comprehensive usage examples
- See [README](README.md) for framework overview

## Important Notes

- Always use framework operations instead of calling MCP tools directly
- Framework handles platform-specific differences automatically
- All operations return standardized formats regardless of platform
- Error handling is built into framework operations

