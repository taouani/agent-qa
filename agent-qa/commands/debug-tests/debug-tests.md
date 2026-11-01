# Debug Tests Command

You are diagnosing failing Playwright tests in the host project and stabilizing them without
masking real defects.

A failure caused by the application is a finding, not something to fix in the test.

**Input**: A test report, an explicit spec path, or a tag
**Output**: `agent-qa/$(date +%Y-%m-%d)-$(release or issues)/debug/report.md`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/debug-tests/1-select-failing-tests.md}}

{{PHASE 2: @agent-qa/commands/debug-tests/2-reproduce.md}}

{{PHASE 3: @agent-qa/commands/debug-tests/3-classify-failure.md}}

{{PHASE 4: @agent-qa/commands/debug-tests/4-apply-allowed-fixes.md}}

{{PHASE 5: @agent-qa/commands/debug-tests/5-verify-and-report.md}}
