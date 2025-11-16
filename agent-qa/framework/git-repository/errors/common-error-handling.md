# Common Error Handling

Common error handling patterns for all git repository operations.

## Purpose

This instruction file provides standardized error handling patterns that should be used across all framework operations for consistent error messages and graceful degradation.

## Core Responsibilities

1. **Define Error Types**: Document common error types across all operations
2. **Standardize Error Messages**: Provide consistent error message formats
3. **Implement Graceful Degradation**: Continue processing despite individual failures
4. **Log Error Context**: Provide error context for debugging

## Error Types

### MCP Server Failures

- MCP server unavailable
- MCP server timeout
- MCP server connection errors

### Repository Errors

- Repository not found
- Invalid repository project ID
- Repository access permission errors

### Network Errors

- Connection timeout
- Rate limiting (GitHub, GitLab)
- Network connectivity issues

### Unauthorized Errors

- Authentication failures
- Permission denied
- Token expired (Azure DevOps OAuth)

### Invalid Input Errors

- Invalid parameter format
- Missing required parameters
- Invalid date range format

## Error Message Format

Standardized error message format:

```
❌ [Error Type]: [Brief Description]

[Detailed explanation]

[Actionable guidance]

[Error context for debugging]
```

## Error Handling Patterns

### Pattern 1: MCP Server Failure

```
❌ MCP Server Error: [Platform] MCP server unavailable

[Platform] MCP server is not available or not responding.

Please verify:
- [Platform] MCP server is installed and configured in IDE/Cursor
- MCP server is properly connected
- Network connectivity is available

Error Context:
- Platform: [platform]
- Operation: [operation name]
- Timestamp: [timestamp]
```

### Pattern 2: Repository Not Found

```
❌ Repository Error: Repository not found

Repository '[repository_project_id]' was not found or is not accessible.

Please verify:
- Repository project ID is correct
- You have access to the repository
- Repository exists in the configured platform

Error Context:
- Platform: [platform]
- Repository ID: [repository_project_id]
- Operation: [operation name]
```

### Pattern 3: Rate Limiting

```
⚠️ Rate Limiting: API rate limit exceeded

The [Platform] API rate limit has been exceeded. Processing will continue with available data.

Please note:
- Some operations may be skipped due to rate limiting
- Wait before retrying operations
- Consider using date range filtering to reduce API calls

Error Context:
- Platform: [platform]
- Operation: [operation name]
- Retry After: [retry-after header if available]
```

### Pattern 4: Graceful Degradation

When individual operations fail, continue processing:

```
⚠️ Partial Failure: [Operation] failed for [item]

[Operation] failed for [specific item], but processing will continue with remaining items.

Failed Item: [item identifier]
Error: [error message]

Remaining items will be processed normally.
```

## Graceful Degradation Guidelines

1. **Continue Processing**: Don't fail entire operation if individual items fail
2. **Log Failures**: Document failed items for debugging
3. **Return Partial Results**: Return successfully processed items
4. **Provide Warnings**: Warn user about partial failures

## Error Context Logging

Always include error context for debugging:

- Platform identifier
- Operation name
- Parameters used
- Timestamp
- Error details (if available)

## Usage Example

```markdown
## Error Handling

Follow the instructions in: `agent-qa/framework/git-repository/errors/common-error-handling.md`

Handle errors according to standardized patterns.
```

## Reference

- **MCP Server Errors**: `errors/mcp-server-errors.md`
- **Repository Errors**: `errors/repository-errors.md`
- **Network Errors**: `errors/network-errors.md`
- **Unauthorized Errors**: `errors/unauthorized-errors.md`

## Important Notes

- Always use standardized error message formats
- Implement graceful degradation for partial failures
- Provide actionable guidance in error messages
- Log error context for debugging purposes
- Don't fail entire operation for individual item failures

