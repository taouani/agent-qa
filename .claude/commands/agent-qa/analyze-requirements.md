# Analyze Requirements Command

You are helping to analyze requirements from Jira tickets, generating structured requirement documentation for agent-qa.

This command follows a multi-phase process to analyze Jira issues (single issue, multiple issues, or JQL filter) and generate requirement markdown files.

**Input**: Jira issue key(s) or JQL filter query
**Optional Input**: `include_commits` (default: false) - If true, analyze commits and include commit analysis in requirement analysis
**Output**: Requirement markdown files in `agent-qa/$(date +%Y-%m-%d)-$(release or issues)/requirements/`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/analyze-requirements/1-initialize-and-determine-input.md}}

{{PHASE 2: @agent-qa/commands/analyze-requirements/2-retrieve-jira-issues.md}}

{{PHASE 3: @agent-qa/commands/analyze-requirements/3-process-epics-and-child-stories.md}}

{{PHASE 4: @agent-qa/commands/analyze-requirements/4-analyze-linked-content.md}}

{{PHASE 5: @agent-qa/commands/analyze-requirements/5-extract-and-structure-requirements.md}}

{{PHASE 6: @agent-qa/commands/analyze-requirements/6-perform-quality-analysis.md}}

{{PHASE 7: @agent-qa/commands/analyze-requirements/7-analyze-commits-if-enabled.md}}

{{PHASE 8: @agent-qa/commands/analyze-requirements/8-generate-requirement-files.md}}
