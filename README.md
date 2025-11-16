# Agent-QA

**AI-Powered Quality Assurance Automation Agent**

Agent-QA is an intelligent automation agent that helps QA analysts, managers, and release managers streamline their testing workflows by automatically analyzing Jira tickets, Confluence pages, and git repository changes to generate comprehensive test deliverables.

## 🎯 What is Agent-QA?

Agent-QA automates the entire QA documentation workflow by:

- **Analyzing Requirements** from Jira tickets, epics, sprints, and releases
- **Extracting Content** from linked Confluence pages
- **Tracking Code Changes** from git commits and pull requests
- **Generating Test Deliverables** including test charters, strategies, plans, test cases, and risk registers
- **Maintaining Traceability** between requirements, code changes, and test cases

## ✨ Key Features

### Core Capabilities

- **Requirements Analysis Engine** - Automatically extracts and structures requirements from Jira tickets with quality analysis
- **Test Case Generation** - Generates comprehensive test cases (positive, negative, edge cases) with Xray CSV export
- **Test Charter Generation** - Creates exploratory test charters with session-based testing approaches
- **Test Strategy Generation** - Develops comprehensive test strategies covering all test levels and types
- **Test Plan Generation** - Produces detailed test plans with schedules, entry/exit criteria, and deliverables
- **Risk Register Generation** - Automatically identifies, scores, and documents risks with mitigation strategies
- **Commit Analysis** - Analyzes git commits and correlates them with Jira tickets
- **Technical Release Notes** - Generates release notes with full requirement traceability

### Integration Support

- **Atlassian MCP** - Jira and Confluence integration
- **Git Repository MCP** - GitLab, GitHub, or Azure DevOps support
- **Playwright MCP** - Test automation framework integration (planned)

## 🚀 Quick Start

### Prerequisites

- Access to Jira and Confluence (via Atlassian MCP server)
- Access to GitLab, GitHub, or Azure DevOps (via respective MCP servers)
- MCP servers configured in your IDE

### Installation

1. **Base Installation** (one-time setup):
   ```bash
   curl -sSL https://raw.githubusercontent.com/taouani/agent-qa/master/scripts/base-install.sh | bash
   ```

2. **Project Installation** (in your project directory):
   ```bash
   ~/agent-qa/scripts/project-install.sh
   ```

3. Follow the prompts to configure your repository platform and project ID.

For detailed installation instructions, see [INSTALLATION.md](INSTALLATION.md).

## 📖 Usage

### Basic Workflow

1. **Analyze Requirements**:
   ```
   /analyze-requirements PROJ-123
   ```
   or for a release/filter:
   ```
   /analyze-requirements "project = PROJ AND fixVersion = '1.0.0'"
   ```

2. **Generate Test Deliverables**:
   ```
   /generate-test-cases
   /generate-test-strategy
   /generate-test-charter
   /generate-test-plan
   /generate-risk-register
   ```

3. **Generate Release Notes**:
   ```
   /generate-release-notes
   ```

### Output Structure

All outputs are organized by date and context:

```
agent-qa/
  YYYY-MM-DD-{folder-name}/
    requirements/          # Requirement analysis
    test-cases/           # Generated test cases (MD + CSV)
    test-strategy/        # Test strategy documents
    test-charter/         # Test charters
    test-plan/            # Test plans
    risk-register/        # Risk registers
    release-notes/        # Technical release notes
    commits/              # Commit analysis (if enabled)
```

Where `{folder-name}` is:
- Issue key for single issues (e.g., `PROJ-123`)
- `release` for multiple issues or JQL filters

## 📚 Documentation

- **[Installation Guide](INSTALLATION.md)** - Detailed installation and configuration instructions
- **[User Guide](USER_GUIDE.md)** - Comprehensive guide with examples and best practices
- **[Commands Reference](agent-qa/commands/README.md)** - Complete command documentation

## 🏗️ Architecture

Agent-QA follows the agent-os framework patterns:

- **Multi-phase Commands** - Each command is broken down into numbered phases
- **MCP Server Integration** - Uses Model Context Protocol for external tool integration
- **Context-Aware Processing** - Automatically adapts terminology based on input type
- **Modular Design** - Commands can be run independently or in sequence

## 🔧 Configuration

Configuration is stored in `agent-qa/config.yml`:

```yaml
repository_platform: gitlab  # gitlab, github, or azure-devops
repository_project_id: "my-group/my-project"
azure_devops_cloud_id: ""  # Only for Azure DevOps
```

## 📋 Available Commands

| Command | Description | Input |
|---------|-------------|-------|
| `analyze-requirements` | Analyze Jira issues and generate requirement docs | Jira issue key(s) or JQL filter |
| `generate-test-cases` | Generate test cases from requirements | User selection |
| `generate-test-strategy` | Generate test strategy document | User selection |
| `generate-test-charter` | Generate exploratory test charter | User selection |
| `generate-test-plan` | Generate comprehensive test plan | User selection |
| `generate-risk-register` | Generate risk register | User selection |
| `analyze-commits` | Analyze git commits and correlate with tickets | Jira filter or tickets |
| `generate-release-notes` | Generate technical release notes | User selection |

## 🎓 Best Practices

1. **Start with Requirements Analysis** - Always run `analyze-requirements` first
2. **Use Context** - Generate commands will automatically use previous outputs as context
3. **Review Generated Content** - AI-generated content should be reviewed and refined
4. **Maintain Traceability** - Use the generated traceability matrices to track coverage
5. **Iterate** - Commands can be run multiple times as requirements evolve

## 🤝 Contributing

Agent-QA is designed to be extensible. Key areas for contribution:

- Additional MCP server integrations
- Enhanced test case generation algorithms
- Additional output formats
- Integration with more testing tools

## 📝 License

[Add your license information here]

## 🙏 Acknowledgments

Agent-QA leverages:
- The agent-os framework for command structure
- MCP (Model Context Protocol) for tool integration
- Best practices from senior QA architect templates

## 📞 Support

For issues, questions, or contributions, please [open an issue](https://github.com/taouani/agent-qa/issues) or refer to the documentation.

---

**Ready to get started?** Check out the [Installation Guide](INSTALLATION.md) and [User Guide](USER_GUIDE.md)!

