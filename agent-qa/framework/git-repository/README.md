# Git Repository Integration Framework

A reusable framework providing a unified interface for git repository operations across GitLab, GitHub, and Azure DevOps platforms.

## Purpose

This framework abstracts platform-specific MCP tool differences and standardizes:
- Configuration management
- Common operations (commit search, PR/MR retrieval, diff extraction, branch listing)
- Error handling patterns
- Output format standardization
- Correlation methods

## Framework Structure

```
agent-qa/framework/git-repository/
├── README.md                    # This file
├── framework-index.md           # Index of all available operations
├── QUICK_START.md              # Quick start guide for developers
├── EXAMPLES.md                 # Comprehensive usage examples
├── operations/                 # Operation instruction files
│   ├── platform-abstraction.md
│   ├── commit-search.md
│   ├── commit-search-gitlab.md
│   ├── commit-search-github.md
│   ├── commit-search-azure-devops.md
│   ├── pr-mr-retrieval.md
│   ├── pr-mr-retrieval-gitlab.md
│   ├── pr-mr-retrieval-github.md
│   ├── pr-mr-retrieval-azure-devops.md
│   ├── diff-extraction.md
│   ├── diff-extraction-gitlab.md
│   ├── diff-extraction-github.md
│   ├── diff-extraction-azure-devops.md
│   ├── branch-listing.md
│   ├── branch-listing-gitlab.md
│   ├── branch-listing-github.md
│   ├── branch-listing-azure-devops.md
│   ├── mcp-tool-mapping-gitlab.md
│   ├── mcp-tool-mapping-github.md
│   └── mcp-tool-mapping-azure-devops.md
├── config/                     # Configuration management
│   ├── read-platform-config.md
│   ├── validate-mcp-server.md
│   ├── manage-project-id.md
│   └── get-cloud-id.md
├── errors/                     # Error handling patterns
│   ├── common-error-handling.md
│   ├── mcp-server-errors.md
│   ├── repository-errors.md
│   ├── network-errors.md
│   └── unauthorized-errors.md
├── formats/                    # Output format standardization
│   ├── commit-metadata-format.md
│   ├── pr-mr-metadata-format.md
│   ├── code-changes-format.md
│   ├── branch-information-format.md
│   └── unified-output-format.md
└── correlation/                # Correlation methods
    ├── branch-name-matching.md
    ├── commit-message-parsing.md
    ├── pr-mr-matching.md
    └── unified-correlation.md
```

## How Commands Use This Framework

Commands reference framework instruction files rather than calling platform-specific MCP tools directly. For example:

```markdown
# In your command phase file:

## Step 1: Read Platform Configuration

Follow the instructions in: `agent-qa/framework/git-repository/config/read-platform-config.md`

## Step 2: Search Commits

Follow the instructions in: `agent-qa/framework/git-repository/operations/commit-search.md`

The framework will automatically route to the platform-specific implementation based on the configured platform.
```

## Integration Guidelines

1. **Always use framework operations** instead of calling MCP tools directly
2. **Reference framework files** using relative paths from your command directory
3. **Follow framework patterns** for configuration, error handling, and output formatting
4. **Use unified interfaces** - the framework handles platform-specific differences

## Platform Support

- **GitLab**: Full support via GitLab MCP server
- **GitHub**: Full support via GitHub MCP server
- **Azure DevOps**: Full support via Azure DevOps MCP server

## Quick Links

- [Quick Start Guide](QUICK_START.md) - Get started quickly
- [Framework Index](framework-index.md) - Complete operation reference
- [Examples](EXAMPLES.md) - Comprehensive usage examples

