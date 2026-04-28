# Agent-QA Usage in Cursor

## Available Commands

Commands are invoked as slash commands in Cursor's chat. Type `/` followed by the command name.

### Core Workflow

```
/analyze-requirements PROJ-123           # Analyze Jira issues (always run first)
/generate-test-cases                     # Generate test cases from requirements
/generate-test-strategy                  # Generate test strategy document
/generate-test-charter                   # Generate exploratory test charter
/generate-test-plan                      # Generate comprehensive test plan
/generate-risk-register                  # Generate risk register
/generate-release-notes                  # Generate technical release notes
```

### New Commands

```
/generate-gherkin                        # Generate Gherkin .feature files from test cases
/generate-playwright-tests               # Generate Playwright .spec.ts from test cases
/publish-to-confluence                   # Convert and publish deliverables to Confluence
```

### Additional Commands

```
/generate-test-data                      # Generate structured test data sets
/generate-traceability-report            # Generate cross-deliverable coverage matrix
/generate-api-tests                      # Generate API test specifications
/generate-accessibility-tests            # Generate WCAG 2.1 AA accessibility tests
/run-pipeline full PROJ-123              # Execute full command pipeline
```

### Utility Commands

```
/health-check                            # Verify configuration and MCP connectivity
/validate-outputs                        # Validate generated deliverables
/regenerate                              # Regenerate deliverables affected by changes
/analyze-commits "project = PROJ AND fixVersion = '1.0.0'"   # Analyze git commits
```

## Command Dependency Chain

```
analyze-requirements ──┬── generate-test-cases ──┬── generate-gherkin
                       │                         ├── generate-playwright-tests
                       │                         ├── generate-api-tests
                       │                         └── generate-accessibility-tests
                       ├── generate-test-charter
                       ├── generate-test-strategy
                       ├── generate-test-plan
                       ├── generate-risk-register
                       └── publish-to-confluence (any deliverable)

analyze-commits ─── generate-release-notes ─── publish-to-confluence
```

## MCP Server Requirements

- **Atlassian MCP**: Required for Jira/Confluence access (`mcp_Atlassian_*` tools)
- **Repository MCP**: One of GitLab/GitHub/Azure DevOps (configured in `agent-qa/config.yml`)

## Configuration

Project config is at `agent-qa/config.yml`. Template at `agent-qa/config.yml.template`.

## File References

For detailed command documentation, see:
- `agent-qa/commands/HOW_TO_USE.md` — IDE-specific usage instructions
- `agent-qa/commands/README.md` — Full command reference
