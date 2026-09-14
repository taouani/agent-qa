# Explore UI Command

You are reproducing selected test cases in the live application to capture real locators, real
wait conditions, and real UI behaviour before any test code is written.

This produces an exploration report that `generate-playwright-tests` consumes to emit working
locators instead of TODO comments.

**Input**: Test cases from a previous `generate-test-cases` run
**Output**: `agent-qa/$(date +%Y-%m-%d)-$(release or issues)/ui-snapshots/`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/explore-ui/1-find-and-select-test-cases.md}}

{{PHASE 2: @agent-qa/commands/explore-ui/2-resolve-profile-and-session.md}}

{{PHASE 3: @agent-qa/commands/explore-ui/3-walk-and-snapshot.md}}

{{PHASE 4: @agent-qa/commands/explore-ui/4-extract-locators-and-observations.md}}

{{PHASE 5: @agent-qa/commands/explore-ui/5-write-exploration-report.md}}
