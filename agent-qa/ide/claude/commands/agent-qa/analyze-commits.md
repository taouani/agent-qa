# Analyze Commits Command

You are helping to analyze git commits and pull requests/merge requests, correlating them with Jira tickets and extracting code changes for agent-qa.

This command follows a multi-phase process to analyze commits and PRs/MRs correlated with Jira tickets, extract code changes, and generate commit analysis markdown files.

**Input**: Jira filter (JQL query), fixVersion(s), specific Jira ticket key(s), repository project ID, optional date range
**Output**: Commit analysis markdown files in `agent-qa/$(date +%Y-%m-%d)-$(release or issues)/commits/`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/analyze-commits/1-initialize-and-determine-input.md}}

{{PHASE 2: @agent-qa/commands/analyze-commits/2-retrieve-jira-tickets.md}}

{{PHASE 3: @agent-qa/commands/analyze-commits/3-correlate-tickets-with-commits.md}}

{{PHASE 4: @agent-qa/commands/analyze-commits/4-extract-code-changes.md}}

{{PHASE 5: @agent-qa/commands/analyze-commits/5-analyze-code-changes.md}}

{{PHASE 6: @agent-qa/commands/analyze-commits/6-generate-commit-analysis-files.md}}

