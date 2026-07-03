# User Guide

Comprehensive guide to using Agent-QA for quality assurance automation.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Command Structure](#command-structure)
3. [Core Commands](#core-commands)
4. [New Commands](#new-commands)
5. [Utility & Pipeline Commands](#utility--pipeline-commands)
6. [Workflow Examples](#workflow-examples)
7. [Output Structure](#output-structure)
8. [Quality Standards](#quality-standards)
9. [Best Practices](#best-practices)
10. [Advanced Usage](#advanced-usage)
11. [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

Before using Agent-QA, ensure:

1. ✅ Agent-QA is installed in your project (see [INSTALLATION.md](INSTALLATION.md))
2. ✅ MCP servers are configured and working (Atlassian, Git repository)
3. ✅ You have access to Jira tickets and git repositories
4. ✅ Your `agent-qa/config.yml` is configured correctly

**Windows users:** Use `project-install.ps1` in PowerShell (same structure as `project-install.sh`). See [INSTALLATION.md](INSTALLATION.md).

### Command Location

All Agent-QA commands live in `agent-qa/commands/`. Each command has an entry point file, for example:

- `agent-qa/commands/analyze-requirements/analyze-requirements.md`
- `agent-qa/commands/generate-test-cases/generate-test-cases.md`
- `agent-qa/commands/generate-gherkin/generate-gherkin.md`

### IDE-Specific Setup

#### Claude Code

Commands are automatically recognized as slash commands.

**What gets installed:**
- `.claude/commands/agent-qa/` — Slash command entry points
- `.claude/rules/` — QA conventions, MCP usage, output standards, language handling
- `.claude/agents/agent-qa/` — Specialized subagents (requirements analyst, test case generator, etc.)
- `.claude/hooks.json` — Pre/post command hooks (config validation, output logging)

**Usage:**
```
/analyze-requirements PROJ-123
/generate-test-cases
/generate-gherkin
/generate-playwright-tests
/publish-to-confluence
```

**Manual setup (if needed):**
```bash
mkdir -p .claude/commands/agent-qa
cp agent-qa/commands/*/*.md .claude/commands/agent-qa/
```

#### Cursor IDE

Commands are recognized as slash commands (same entry points as Claude Code).

**What gets installed:**
- `.claude/commands/agent-qa/` — Slash command entry points
- `.cursor/rules/` — QA conventions and usage guide adapted for Cursor

**Usage:**
```
/analyze-requirements PROJ-123
/generate-test-cases
```

#### VS Code with GitHub Copilot

Instructions are loaded from `.github/copilot-instructions.md`.

**Option 1: Direct file reference**
```
@agent-qa/commands/analyze-requirements/analyze-requirements.md
Please help me analyze requirements for Jira ticket PROJ-123 following the instructions in this file.
```

**Option 2: Use as documentation**
- Reference the command files as workflow documentation
- Ask Copilot to help you execute the workflow described in the command file

#### Other IDEs / AI Assistants

1. **Read the command file** directly:
   ```bash
   cat agent-qa/commands/analyze-requirements/analyze-requirements.md
   ```

2. **Reference the file** in your AI assistant:
   - Provide the path: `agent-qa/commands/analyze-requirements/analyze-requirements.md`
   - Ask the assistant to follow the instructions in the file

3. **Follow the phase structure** — each command file contains phase-by-phase instructions to execute sequentially

The `.claude/commands/` and `.claude/rules/` directories are optional and IDE-specific. Commands work in any IDE by reading the markdown files directly.

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

## Command Structure

Each command follows the multi-phase pattern:

```
agent-qa/commands/{command-name}/
  {command-name}.md          # Main command file (entry point)
  1-phase-name.md            # Phase 1 instructions
  2-phase-name.md            # Phase 2 instructions
  ...
```

The main command file references phase files using:
```
{{PHASE X: @agent-qa/commands/{command-name}/{phase-file}.md}}
```

### Command Dependency Chain

```
analyze-requirements ──┬── generate-test-cases ──┬── generate-gherkin
                       │                         ├── generate-playwright-tests
                       │                         ├── generate-api-tests
                       │                         └── generate-accessibility-tests
                       ├── generate-test-charter
                       ├── generate-test-strategy
                       ├── generate-test-plan
                       ├── generate-risk-register
                       ├── generate-test-data
                       └── publish-to-confluence (any deliverable)

analyze-commits ─── generate-release-notes ─── publish-to-confluence
```

### Workflow

1. **First**: Run `analyze-requirements` with Jira issue(s) or a JQL filter
2. **Then**: Run any generate command, selecting the requirements analysis to use
3. **Optional**: Generate commands automatically include outputs from previous commands as context

Commands are independent after `analyze-requirements` and can be run in any order. Each generate command prompts you to select which analysis folder to use. Custom format templates can be placed in `agent-qa/custom-templates/` to override defaults.

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

## New Commands

### 9. generate-gherkin

Generates Gherkin BDD `.feature` files from test cases.

#### Syntax

```
/generate-gherkin
```

#### What It Does

1. **Finds** available test case folders
2. **Prompts** you to select which test cases to convert
3. **Maps** test steps to Given/When/Then syntax
4. **Groups** scenarios into Features by requirement key
5. **Generates** `.feature` files with tags and traceability

#### Output

- Feature files: `gherkin/PROJ-123.feature`
- Gherkin index: `gherkin/README.md`
- Traceability report

### 10. generate-playwright-tests

Generates Playwright `.spec.ts` test files with Page Object Model.

#### Syntax

```
/generate-playwright-tests
```

#### What It Does

1. **Finds** available test case folders
2. **Identifies** pages, UI elements, and navigation flows
3. **Generates** Page Object classes with typed Locator properties
4. **Generates** test spec files grouped by requirement
5. **Handles** data-driven tests with parameterization

#### Output

- Page Objects: `playwright/pages/*.page.ts`
- Test Specs: `playwright/tests/*.spec.ts`
- README with setup instructions

### 11. publish-to-confluence

Converts deliverables to Confluence format and optionally publishes.

#### Syntax

```
/publish-to-confluence
```

#### What It Does

1. **Finds** available output folders
2. **Prompts** you to select deliverables to convert
3. **Converts** markdown to Confluence storage format (XHTML)
4. **Publishes** pages via Atlassian MCP if configured

#### Output

- `.confluence.html` files alongside original markdown
- Publication report with status and URLs

## Utility & Pipeline Commands

### 12. health-check

Verifies Agent-QA configuration, directory structure, and MCP server connectivity.

**Syntax:** `/health-check`

**Input:** None  
**Output:** Health check report (displayed to user, no files generated)  
**Dependencies:** None

**Phases:**
1. Validate configuration (`config.yml`, directories, IDE integrations)
2. Test MCP connectivity (Atlassian, Repository)

### 13. validate-outputs

Validates generated deliverables against QA conventions and output standards.

**Syntax:** `/validate-outputs`

**Input:** User selection of output folder  
**Output:** Validation report (displayed to user, no files generated)  
**Dependencies:** Requires at least one output folder to exist

**Phases:**
1. Find and select output folder
2. Validate deliverables (YAML front matter, file naming, test case IDs, CSV format, cross-deliverable consistency)
3. Generate validation report

### 14. generate-traceability-report

Generates a cross-deliverable coverage matrix showing requirements through all deliverables.

**Syntax:** `/generate-traceability-report`

**Input:** User selection of output folder  
**Output:** `agent-qa/YYYY-MM-DD-{folder-name}/traceability-report.md`  
**Dependencies:** Requires `analyze-requirements` to be run first

**Phases:**
1. Find and select output folder
2. Build traceability matrix (requirements → test cases → gherkin → playwright)
3. Generate report files with gap analysis

### 15. generate-test-data

Generates structured test data specifications (valid, invalid, boundary, null, security).

**Syntax:** `/generate-test-data`

**Input:** User selection of requirements analysis folder  
**Output:** `agent-qa/YYYY-MM-DD-{folder-name}/test-data/`  
**Dependencies:** Requires `analyze-requirements`. Optionally uses `generate-test-cases` output.

**Phases:**
1. Find and select requirements
2. Analyze data requirements (fields, types, constraints)
3. Generate data sets (valid, invalid, boundary, null/empty, security)
4. Generate test data files

### 16. run-pipeline

Executes multiple commands in dependency order as a single pipeline.

**Syntax:** `/run-pipeline`

**Input:** Pipeline specification (predefined pipeline, range, or command list)  
**Output:** All deliverables from each command in the pipeline  
**Dependencies:** None (first command must be a root command)

**Phases:**
1. Parse pipeline configuration and resolve command order
2. Execute commands sequentially with auto-context passing
3. Generate pipeline summary

### 17. generate-api-tests

Generates REST/GraphQL API test specifications from analyzed test cases.

**Syntax:** `/generate-api-tests`

**Input:** User selection of test cases folder  
**Output:** API test spec files in `agent-qa/YYYY-MM-DD-{context}/api-tests/`  
**Dependencies:** Requires `generate-test-cases` to be run first

**Phases:**
1. Find and select test cases with API interactions
2. Analyze API endpoints from test cases and requirements
3. Generate API test specifications (positive, negative, auth, edge cases)
4. Generate API test files and index

### 18. generate-accessibility-tests

Generates WCAG 2.1 AA accessibility test cases from UI-facing test cases.

**Syntax:** `/generate-accessibility-tests`

**Input:** User selection of test cases folder  
**Output:** Accessibility test files in `agent-qa/YYYY-MM-DD-{context}/accessibility-tests/`  
**Dependencies:** Requires `generate-test-cases` to be run first

**Phases:**
1. Find and select UI-facing test cases
2. Analyze accessibility requirements and map to WCAG criteria
3. Generate accessibility test cases per criterion per page
4. Generate accessibility test files, WCAG compliance matrix, and index

### 19. regenerate

Detects requirement changes and regenerates only affected deliverables.

**Syntax:** `/regenerate`

**Input:** User selection of existing output folder  
**Output:** Updated deliverables in the same output folder, plus a change log  
**Dependencies:** Requires an existing output folder with generated deliverables

**Phases:**
1. Detect changes by comparing Jira issue timestamps against deliverable timestamps
2. Identify affected deliverables and map change impact
3. Back up and regenerate affected deliverables only
4. Generate change report and update indexes

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

    gherkin/                    # (if generate-gherkin used)
      PROJ-123.feature          # Gherkin feature files
      README.md                 # Gherkin index

    playwright/                 # (if generate-playwright-tests used)
      pages/                    # Page Object classes
        login.page.ts
      tests/                    # Test spec files
        PROJ-123.spec.ts
      README.md                 # Setup instructions
```

## Quality Standards

Agent-QA commands follow senior QA architect best practices to produce professional, audit-compliant deliverables.

### General Principles

- **Accuracy threshold**: Ask for clarification when confidence is below 95%
- **Think before acting**: Challenge assumptions and suggest improvements
- **When in doubt, ask**: Do not guess — request clarification
- **Risk-based testing**: Prioritize by business impact and risk
- **Traceability**: Complete mapping between requirements and all deliverables

### analyze-requirements

- Automatic language detection and matching
- Comprehensive requirement structure with quality analysis scoring
- Enhanced error handling for MCP and data retrieval failures

### generate-test-cases

- **YAML front matter**: Complete metadata (id, summary, priority, tags, etc.)
- **Test case structure**: Prerequisites, test data tables, detailed steps, expected results
- **Priority assignment**: P1–P4 based on keyword analysis (security, payment, critical)
- **Test case ID format**: `TC-{REQUIREMENT-KEY}-{NNN}`
- **Xray CSV format**: Column headers `Test Key,Summary,Test Type,Priority,Labels,Preconditions,Steps,Expected Result,Requirement Keys,Folder Path`
- **Pipe-separated steps**: `Number|Action|Data|Expected Result`
- **Language detection**: Artifacts generated in the same language as requirements (70% confidence threshold)
- **Quality validation**: Clarity, completeness, traceability, maintainability checks
- **Regression recommendations**: Risk-based regression suite recommendations

### generate-test-charter

- Mission/goal, scope, areas to explore, test approach, risks, resources, time estimates
- Session-based testing (90-minute sessions with debriefing)
- Exploratory testing heuristics: SFDIPOT, CRUSSPIC STMPL, Touring heuristics
- Independent risk identification from requirements

### generate-test-strategy

- Test levels (Integration, System, UAT) with entry/exit criteria
- Test types: Functional, Security, Performance, Usability, Compatibility, Regression
- Test design techniques: Equivalence Partitioning, Boundary Value Analysis, Decision Tables, State Transition
- Playwright automation approach with Page Object Model
- Coverage, defect, execution, and progress metrics

### generate-test-plan

- Executive summary, test objectives, scope definition
- Test strategy integration with file linking
- Environment requirements, schedules, milestones
- Entry/exit criteria, deliverables list, risk management, approval process

### generate-risk-register

- Multi-source risk identification (requirements, strategies, charters, test cases)
- Risk categories: Technical, Requirements, Process, Resource, Schedule, Quality, Business
- Scoring scales: Probability 1–5, Impact 1–5, Risk Score = Probability × Impact (1–25)
- Mitigation strategies and contingency plans for high-risk items (Risk Score ≥ 15)
- Ownership suggestions and requirement traceability

### Language Detection

- Detect language from Jira fields or heuristic analysis
- Generate all artifacts in the same language as requirements
- Support multilingual requirements (per-requirement language)
- Confidence threshold (70%) with user confirmation when uncertain

### Xray Integration

- Exact CSV column headers for Xray import
- Pipe-separated step format
- Preconditions separated from description
- Proper CSV escaping and formatting

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
1. Verify Agent-QA is installed: `ls agent-qa/commands` (or `Get-ChildItem agent-qa\commands` on Windows)
2. Check if `.claude/commands/agent-qa/` exists: `ls .claude/commands/agent-qa/`
3. Re-run project installation:
   - Bash: `~/agent-qa/scripts/project-install.sh`
   - PowerShell: `& "$env:USERPROFILE\agent-qa\scripts\project-install.ps1"`
4. Or manually copy command files:
   ```bash
   mkdir -p .claude/commands/agent-qa
   cp agent-qa/commands/analyze-requirements/analyze-requirements.md .claude/commands/agent-qa/analyze-requirements.md
   cp agent-qa/commands/generate-test-cases/generate-test-cases.md .claude/commands/agent-qa/generate-test-cases.md
   # ... repeat for other commands
   ```

**For VS Code / Other IDEs:**
- Commands do not need to be in `.claude/commands/`
- Reference command files directly: `@agent-qa/commands/analyze-requirements/analyze-requirements.md`
- Read the markdown files and follow phase-by-phase instructions

### Rules Not Loading (Claude Code)

**Issue**: QA rules or conventions not applied

**Solution**:
1. Check if `.claude/rules/` exists: `ls .claude/rules/`
2. Re-run project installation to copy rules files

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

- Review [INSTALLATION.md](INSTALLATION.md) if you need to reconfigure or update Agent-QA
- Run `/health-check` to verify your setup
- Customize workflows for your team's needs

---

**Ready to automate your QA workflow?** Start with `/analyze-requirements` and explore the generated outputs!

