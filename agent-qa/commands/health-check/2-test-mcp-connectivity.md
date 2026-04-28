# Phase 2: Test MCP Connectivity

## Core Responsibilities

Test connectivity to required MCP servers and report results.

## Workflow

### Step 1: Test Atlassian MCP

1. Attempt a lightweight Jira search using `mcp_Atlassian_jira_search` with a minimal JQL query (e.g., `order by created DESC` with `maxResults: 1`)
2. Report result:
   - **PASS** — Atlassian MCP is connected and responding
   - **FAIL** — Atlassian MCP is not available (include error message)

### Step 2: Test Repository MCP

Based on `repository_platform` from config.yml:

**GitLab** (`repository_platform: gitlab`):
1. Attempt to list branches using `mcp_gitlab_*` tools with the configured `repository_project_id`
2. Report result:
   - **PASS** — GitLab MCP is connected, project accessible
   - **FAIL** — GitLab MCP is not available or project ID is invalid

**GitHub** (`repository_platform: github`):
1. Attempt to list branches using `mcp_github_*` tools with the configured `repository_project_id`
2. Report result:
   - **PASS** — GitHub MCP is connected, repository accessible
   - **FAIL** — GitHub MCP is not available or repository is invalid

**Azure DevOps** (`repository_platform: azure-devops`):
1. Attempt to list branches using `mcp_azure-devops_*` tools with the configured `repository_project_id` and `azure_devops_cloud_id`
2. Report result:
   - **PASS** — Azure DevOps MCP is connected, project accessible
   - **FAIL** — Azure DevOps MCP is not available or configuration is invalid

### Step 3: Display final health check report

Display a complete health check report combining Phase 1 and Phase 2 results:

```
Agent-QA Health Check Report
=============================

Configuration
  config.yml .................. PASS
  repository_platform ........ PASS (gitlab)
  repository_project_id ...... PASS
  core directories ........... PASS (5/5)
  IDE integrations ........... PASS (claude, cursor)

MCP Connectivity
  Atlassian MCP .............. PASS
  Repository MCP (GitLab) .... PASS

Overall Status: ALL CHECKS PASSED
```

If any check failed:
```
Overall Status: {N} CHECK(S) FAILED — see details above
```

If any check warned:
```
Overall Status: PASSED WITH {N} WARNING(S) — see details above
```

## Constraints

- Do NOT modify any files during health check
- If an MCP tool is not available (tool not found), report FAIL with a helpful message about configuring the MCP server
- Keep MCP test calls minimal to avoid unnecessary API load
- Timeout gracefully if MCP calls take too long
