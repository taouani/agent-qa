# MCP Usage Rules

Rules for using MCP (Model Context Protocol) servers in Agent-QA commands.

## Atlassian MCP

Tools prefixed with `mcp_Atlassian_*` provide Jira and Confluence access.

### Common Operations

- **Search Jira issues**: Use `mcp_Atlassian_jira_search` with JQL queries
- **Get issue details**: Use `mcp_Atlassian_jira_get_issue` with issue key
- **Read Confluence pages**: Use `mcp_Atlassian_confluence_get_page` with page ID
- **Search Confluence**: Use `mcp_Atlassian_confluence_search` with CQL queries

### Patterns

- Always validate MCP connectivity before starting a command
- Handle pagination for search results (check `total` vs `maxResults`)
- Extract linked Confluence page IDs from Jira issue `remoteLinks` or description URLs
- Parse epic links and subtask relationships from issue fields

### Error Handling

- If Atlassian MCP is unavailable, inform the user and stop the command
- If a specific issue is not found, report the key and continue with remaining issues
- If Confluence page access fails, log the error and continue without that content

## Repository MCP

Platform-specific MCP servers for git operations. Configured via `agent-qa/config.yml`.

### GitLab MCP

- Tools prefixed with `mcp_gitlab_*`
- Use `repository_project_id` from config (numeric ID or `group/project` path)
- Key operations: commit search, merge request retrieval, diff extraction, branch listing

### GitHub MCP

- Tools prefixed with `mcp_github_*`
- Use `repository_project_id` from config (`owner/repo` format)
- Key operations: commit search, pull request retrieval, diff extraction, branch listing

### Azure DevOps MCP

- Tools prefixed with `mcp_azure-devops_*`
- Use `repository_project_id` and `azure_devops_cloud_id` from config
- Key operations: commit search, pull request retrieval, diff extraction, branch listing

### Connection Validation

- Read `agent-qa/config.yml` to determine the platform
- Verify the configured MCP server is available before executing repository operations
- If repository MCP is unavailable and the command requires it, inform the user and skip git operations
- Git operations are optional for most commands (required only for `analyze-commits` and `generate-release-notes`)

### Fallback Strategy

1. Attempt the MCP tool call
2. If the tool returns an error, retry once
3. If still failing, log the error and continue without that data source
4. Never block the entire command due to a single MCP failure (unless it's the primary data source)
