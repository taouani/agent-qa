# User Guide

Comprehensive guide to using Agent-QA for quality assurance automation.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Core Commands](#core-commands)
3. [Workflow Examples](#workflow-examples)
4. [Output Structure](#output-structure)
5. [Best Practices](#best-practices)
6. [Advanced Usage](#advanced-usage)
7. [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

Before using Agent-QA, ensure:

1. ✅ Agent-QA is installed in your project (see [INSTALLATION.md](INSTALLATION.md))
2. ✅ MCP servers are configured and working (Atlassian, Git repository)
3. ✅ You have access to Jira tickets and git repositories
4. ✅ Your `agent-qa/config.yml` is configured correctly

### IDE-Specific Setup

**Claude Code / Cursor IDE:**
- Commands are automatically installed to `.claude/commands/agent-qa/` during installation
- Type `/analyze-requirements` in the chat to use commands
- If commands aren't recognized, see [Troubleshooting](#troubleshooting)

**VS Code / GitHub Copilot / Other IDEs:**
- Commands can be used by referencing the markdown files directly
- See [HOW_TO_USE.md](agent-qa/commands/HOW_TO_USE.md) for detailed instructions
- The `.claude/commands/` directory is optional and only for Claude Code/Cursor

### Your First Command

**In Claude Code/Cursor:**
```
/analyze-requirements PROJ-123
```

**In VS Code / Other IDEs:**
Reference the command file and ask your AI assistant to follow it:
```
@agent-qa/commands/analyze-requirements/analyze-requirements.md
Please analyze requirements for Jira ticket PROJ-123 following the instructions in this file.
```

This will:
1. Retrieve the Jira ticket
2. Analyze linked content (Confluence pages, child stories)
3. Extract and structure requirements
4. Perform quality analysis
5. Generate requirement markdown files

Output will be in: `agent-qa/YYYY-MM-DD-PROJ-123/requirements/`

## Core Commands

### 1. analyze-requirements

Analyzes Jira issues and generates structured requirement documentation.

#### Syntax

```
/analyze-requirements <input> [--include-commits]
```

#### Input Types

**Single Issue**:
```
/analyze-requirements PROJ-123
```

**Multiple Issues**:
```
/analyze-requirements PROJ-123 PROJ-124 PROJ-125
```

**JQL Filter**:
```
/analyze-requirements "project = PROJ AND fixVersion = '1.0.0'"
```

**Epic** (automatically processes child stories):
```
/analyze-requirements PROJ-456
```

#### Options

- `--include-commits` (optional): Analyze git commits related to the requirements

#### What It Does

1. **Initializes** MCP connection and determines input type
2. **Retrieves** Jira issues (single or via filter)
3. **Processes** epics and child stories recursively
4. **Analyzes** linked content (Confluence pages, related issues)
5. **Extracts** and structures requirements
6. **Performs** quality analysis
7. **Optionally analyzes** commits (if `--include-commits` is set)
8. **Generates** requirement markdown files

#### Output

- Individual requirement files: `requirements/PROJ-123.md`
- Summary index: `requirements/README.md`
- Quality analysis reports
- Commit analysis (if enabled): `commits/` folder

### 2. generate-test-cases

Generates comprehensive test cases from analyzed requirements.

#### Syntax

```
/generate-test-cases
```

#### What It Does

1. **Finds** available requirements analysis folders
2. **Prompts** you to select which one to use
3. **Loads** requirements and related deliverables (test charter, test strategy if available)
4. **Generates** test cases (positive, negative, edge cases)
5. **Creates** markdown files and Xray CSV export

#### Output

- Test case files: `test-cases/PROJ-123-test-cases.md`
- Xray CSV: `test-cases/PROJ-123-test-cases.csv`
- Traceability matrix: `test-cases/traceability-matrix.md`

#### Test Case Structure

Each test case includes:
- **Metadata**: ID, summary, priority, tags
- **Prerequisites**: Setup requirements
- **Test Data**: Specific test values
- **Test Steps**: Detailed step-by-step instructions
- **Expected Results**: Clear pass/fail criteria
- **Traceability**: Linked requirement

### 3. generate-test-strategy

Generates comprehensive test strategy documents.

#### Syntax

```
/generate-test-strategy
```

#### What It Does

1. **Finds** available requirements analysis
2. **Loads** requirements and test charter (if available)
3. **Generates** test strategy covering:
   - Test levels (Integration, System, UAT)
   - Test types (Functional, Security, Performance, etc.)
   - Test design techniques
   - Automation approach (Playwright)
   - Metrics and reporting

#### Output

- Test strategy document: `test-strategy/test-strategy.md`
- Detailed sections for each test level and type

### 4. generate-test-charter

Generates exploratory test charters.

#### Syntax

```
/generate-test-charter
```

#### What It Does

1. **Finds** available requirements analysis
2. **Loads** requirements data
3. **Generates** test charter with:
   - Mission/goal
   - Scope definition
   - Areas to explore
   - Test approach (session-based testing)
   - Risks and resources
   - Time estimates

#### Output

- Test charter document: `test-charter/test-charter.md`
- Session-based testing structure

### 5. generate-test-plan

Generates comprehensive test plans.

#### Syntax

```
/generate-test-plan
```

#### What It Does

1. **Finds** available requirements analysis
2. **Loads** requirements and all related deliverables (test charter, strategy, test cases)
3. **Generates** test plan with:
   - Executive summary
   - Test objectives
   - Scope definition
   - Test strategy integration
   - Environment requirements
   - Schedules and milestones
   - Entry/exit criteria
   - Deliverables list

#### Output

- Test plan document: `test-plan/test-plan.md`
- Comprehensive planning document

### 6. generate-risk-register

Generates risk registers with automatic risk identification.

#### Syntax

```
/generate-risk-register
```

#### What It Does

1. **Finds** available requirements analysis
2. **Loads** requirements and related deliverables (test strategies, test charters, test cases)
3. **Identifies** risks from all sources
4. **Scores** risks (probability × impact)
5. **Generates** mitigation strategies and contingency plans
6. **Creates** risk register document

#### Output

- Risk register: `risk-register/risk-register.md`
- Prioritized risks with scores
- Mitigation strategies
- Contingency plans (for high-risk items)

### 7. analyze-commits

Analyzes git commits and correlates them with Jira tickets.

#### Syntax

```
/analyze-commits <input>
```

#### Input Types

**JQL Filter**:
```
/analyze-commits "project = PROJ AND fixVersion = '1.0.0'"
```

**Fix Version**:
```
/analyze-commits --fix-version "1.0.0"
```

**Specific Tickets**:
```
/analyze-commits PROJ-123 PROJ-124
```

#### What It Does

1. **Retrieves** Jira tickets
2. **Searches** git repository for related commits
3. **Correlates** commits with tickets
4. **Extracts** code changes
5. **Analyzes** code changes and impact
6. **Generates** commit analysis files

#### Output

- Commit analysis: `commits/commit-analysis.md`
- Code change summaries
- Impact analysis

### 8. generate-release-notes

Generates technical release notes with full traceability.

#### Syntax

```
/generate-release-notes
```

#### What It Does

1. **Finds** available requirements analysis (or calls `analyze-requirements` if none found)
2. **Loads** requirements and commit analysis
3. **Generates** release notes with:
   - Feature summaries
   - Code changes
   - Requirement traceability
   - Test coverage summary
   - Known issues

#### Output

- Release notes: `release-notes/release-notes.md`
- Traceability matrix: `release-notes/traceability-matrix.md`

## Workflow Examples

### Example 1: Single Feature Analysis

**Scenario**: Analyze a single user story and generate test cases.

```bash
# 1. Analyze the requirement
/analyze-requirements PROJ-123

# 2. Generate test cases
/generate-test-cases
# Select: 2025-01-16-PROJ-123

# 3. Generate test strategy
/generate-test-strategy
# Select: 2025-01-16-PROJ-123

# 4. Generate test plan
/generate-test-plan
# Select: 2025-01-16-PROJ-123
```

**Result**: Complete test documentation for the feature.

### Example 2: Release Analysis

**Scenario**: Analyze an entire release and generate all deliverables.

```bash
# 1. Analyze all tickets in the release
/analyze-requirements "project = PROJ AND fixVersion = '2.0.0'"

# 2. Generate test charter for exploratory testing
/generate-test-charter
# Select: 2025-01-16-release

# 3. Generate test strategy
/generate-test-strategy
# Select: 2025-01-16-release

# 4. Generate test cases
/generate-test-cases
# Select: 2025-01-16-release

# 5. Generate test plan
/generate-test-plan
# Select: 2025-01-16-release

# 6. Generate risk register
/generate-risk-register
# Select: 2025-01-16-release

# 7. Generate release notes (with commits)
/generate-release-notes
# Select: 2025-01-16-release
```

**Result**: Complete test documentation suite for the release.

### Example 3: Epic with Child Stories

**Scenario**: Analyze an epic and all its child stories.

```bash
# 1. Analyze epic (automatically processes child stories)
/analyze-requirements PROJ-EPIC-1

# 2. Generate deliverables
/generate-test-cases
/generate-test-strategy
/generate-test-plan
```

**Result**: Comprehensive analysis including all child stories.

### Example 4: Requirements with Commit Analysis

**Scenario**: Analyze requirements and include code changes.

```bash
# 1. Analyze requirements with commits
/analyze-requirements "project = PROJ AND fixVersion = '1.0.0'" --include-commits

# 2. Generate release notes
/generate-release-notes
# Select: 2025-01-16-release
```

**Result**: Requirements analysis with code change correlation.

## Output Structure

### Folder Naming Convention

Outputs are organized by date and context:

```
agent-qa/
  YYYY-MM-DD-{folder-name}/
```

Where `{folder-name}` is:
- **Single issue**: Issue key (e.g., `PROJ-123`)
- **Multiple issues or filter**: `release`

### Complete Structure

```
agent-qa/
  2025-01-16-PROJ-123/
    requirements/
      PROJ-123.md              # Individual requirement
      README.md                # Summary index
      quality-analysis.md       # Quality report
    
    test-cases/
      PROJ-123-test-cases.md   # Test cases (markdown)
      PROJ-123-test-cases.csv  # Xray CSV export
      traceability-matrix.md    # Traceability matrix
    
    test-strategy/
      test-strategy.md          # Test strategy document
    
    test-charter/
      test-charter.md           # Test charter
    
    test-plan/
      test-plan.md              # Test plan
    
    risk-register/
      risk-register.md          # Risk register
    
    release-notes/
      release-notes.md          # Release notes
      traceability-matrix.md    # Traceability matrix
    
    commits/                    # (if --include-commits used)
      commit-analysis.md        # Commit analysis
      code-changes/             # Code change summaries
```

## Best Practices

### 1. Start with Requirements Analysis

**Always** run `analyze-requirements` first. Other commands depend on its output.

### 2. Use Context-Aware Commands

Generate commands automatically detect and use previous outputs:
- `generate-test-strategy` uses test charter if available
- `generate-test-plan` uses test strategy and test cases if available
- `generate-risk-register` uses all previous deliverables

### 3. Review Generated Content

AI-generated content should be:
- **Reviewed** for accuracy
- **Refined** based on domain knowledge
- **Validated** against actual requirements
- **Updated** as requirements evolve

### 4. Maintain Traceability

Use the generated traceability matrices to:
- Track test coverage
- Identify gaps
- Link requirements to tests
- Generate reports

### 5. Iterate and Refine

Commands can be run multiple times:
- Update requirements analysis when tickets change
- Regenerate test cases when requirements evolve
- Update test plans as scope changes

### 6. Use Appropriate Input Types

- **Single tickets**: For focused feature analysis
- **JQL filters**: For release/sprint analysis
- **Epics**: For comprehensive epic analysis (includes child stories)

### 7. Enable Commit Analysis When Needed

Use `--include-commits` when:
- You need code change correlation
- Generating technical release notes
- Tracking implementation progress

## Advanced Usage

### Custom Configuration

Edit `agent-qa/config.yml` to customize behavior:

```yaml
repository_platform: gitlab
repository_project_id: "my-group/my-project"
```

### Command Chaining

Commands can be chained in workflows:

```bash
# Analyze and generate in one workflow
/analyze-requirements PROJ-123 && \
/generate-test-cases && \
/generate-test-strategy
```

### Selective Generation

Generate only what you need:

```bash
# Just test cases
/analyze-requirements PROJ-123
/generate-test-cases

# Just risk register
/analyze-requirements PROJ-123
/generate-risk-register
```

### Working with Multiple Releases

Each analysis creates a separate folder:

```bash
# Release 1.0.0
/analyze-requirements "fixVersion = '1.0.0'"
# Creates: 2025-01-16-release/

# Release 2.0.0
/analyze-requirements "fixVersion = '2.0.0'"
# Creates: 2025-01-17-release/
```

### Exporting to Xray

Test cases are automatically exported to CSV format compatible with Jira Xray:

1. Generate test cases: `/generate-test-cases`
2. Find CSV file: `test-cases/PROJ-123-test-cases.csv`
3. Import to Xray: Use Xray's CSV import feature

## Troubleshooting

### Command Not Found

**Issue**: Command not recognized in Claude Code/Cursor

**Solution**: 
- Verify Agent-QA is installed: `ls agent-qa/commands`
- Check if `.claude/commands/agent-qa/` exists: `ls .claude/commands/agent-qa/`
- If missing, re-run project installation: `~/agent-qa/scripts/project-install.sh`
- Or manually copy command files (see [HOW_TO_USE.md](agent-qa/commands/HOW_TO_USE.md))

**For VS Code / Other IDEs:**
- Commands don't need to be in `.claude/commands/`
- Reference command files directly: `@agent-qa/commands/analyze-requirements/analyze-requirements.md`
- See [HOW_TO_USE.md](agent-qa/commands/HOW_TO_USE.md) for IDE-specific instructions

### MCP Server Errors

**Issue**: "MCP tool not available"

**Solution**:
1. Verify MCP servers are running in your IDE
2. Test MCP connectivity manually
3. Check MCP server configuration
4. Review MCP server logs

### No Requirements Found

**Issue**: "No requirements analysis found"

**Solution**:
1. Run `analyze-requirements` first
2. Check output folder exists: `ls agent-qa/YYYY-MM-DD-*/requirements`
3. Verify Jira ticket access

### Invalid JQL Query

**Issue**: JQL query errors

**Solution**:
1. Test JQL in Jira first
2. Use proper JQL syntax
3. Escape special characters if needed
4. Verify project permissions

### Missing Deliverables

**Issue**: Generate command can't find previous outputs

**Solution**:
1. Ensure you select the correct analysis folder
2. Verify previous commands completed successfully
3. Check folder structure matches expected format

### Configuration Errors

**Issue**: Repository platform errors

**Solution**:
1. Verify `agent-qa/config.yml` exists
2. Check configuration values are correct
3. Re-run project installation to update config

## Tips and Tricks

### Quick Requirement Check

```bash
# Quick analysis without full processing
/analyze-requirements PROJ-123
# Review: agent-qa/YYYY-MM-DD-PROJ-123/requirements/README.md
```

### Batch Processing

```bash
# Analyze multiple tickets
/analyze-requirements PROJ-123 PROJ-124 PROJ-125
```

### Re-generating Deliverables

```bash
# Update test cases when requirements change
/analyze-requirements PROJ-123  # Re-analyze
/generate-test-cases             # Re-generate
```

### Working with Epics

Epics are automatically processed with child stories:

```bash
# Analyze epic (includes all child stories)
/analyze-requirements PROJ-EPIC-1
# Output includes all child story requirements
```

## Next Steps

- Explore [Commands Reference](agent-qa/commands/README.md) for detailed command documentation
- Check [IMPROVEMENTS.md](agent-qa/commands/IMPROVEMENTS.md) for latest enhancements
- Review generated outputs to understand structure
- Customize workflows for your team's needs

---

**Ready to automate your QA workflow?** Start with `/analyze-requirements` and explore the generated outputs!

