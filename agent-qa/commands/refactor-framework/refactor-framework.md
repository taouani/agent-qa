# Refactor Framework Command

You are turning an approved architecture review into a phased refactor plan, and then executing
the phases the engineer selects, with validation after every task.

This command modifies the host project's source. It requires an existing architecture review.

**Input**: `reviews/architecture-review.md` from a previous `audit-framework` run
**Output**: `reviews/refactor-plan.md` and `reviews/refactor-report.md`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/refactor-framework/1-load-audit-and-plan.md}}

{{PHASE 2: @agent-qa/commands/refactor-framework/2-select-phase-and-tasks.md}}

{{PHASE 3: @agent-qa/commands/refactor-framework/3-execute-with-validation.md}}

{{PHASE 4: @agent-qa/commands/refactor-framework/4-report-and-commit.md}}
