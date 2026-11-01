# Audit Framework Command

You are performing a repository-wide architecture audit of the host project's Playwright test
framework — structure, layering, reuse, locator strategy, synchronization, test data, naming,
and scalability.

This command is REPOSITORY-SCOPED and read-only. To review specific files, use
`review-automation-code` instead.

**Input**: The Playwright project identified by the framework profile
**Output**: `agent-qa/$(date +%Y-%m-%d)-$(release or issues)/reviews/architecture-review.md`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/audit-framework/1-scope-and-inventory.md}}

{{PHASE 2: @agent-qa/commands/audit-framework/2-analyze.md}}

{{PHASE 3: @agent-qa/commands/audit-framework/3-score-and-prioritize.md}}

{{PHASE 4: @agent-qa/commands/audit-framework/4-write-audit-report.md}}
