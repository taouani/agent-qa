# Review Automation Code Command

You are reviewing Playwright automation code in the host project for correctness, reliability,
convention adherence, and maintainability.

This command is FILE-SCOPED. For a repository-wide structural assessment, use
`audit-framework` instead.

**Input**: Changed files from git, explicit paths, or a glob
**Output**: `agent-qa/$(date +%Y-%m-%d)-$(release or issues)/reviews/code-review.md`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/review-automation-code/1-select-files.md}}

{{PHASE 2: @agent-qa/commands/review-automation-code/2-classify-and-load-conventions.md}}

{{PHASE 3: @agent-qa/commands/review-automation-code/3-review.md}}

{{PHASE 4: @agent-qa/commands/review-automation-code/4-report-and-optional-fix.md}}
