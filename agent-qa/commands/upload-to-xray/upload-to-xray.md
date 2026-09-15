# Upload To Xray Command

You are uploading generated test cases into Jira as Xray tests — Cucumber tests where a Gherkin
feature exists for that test case, Manual tests otherwise.

Nothing is written to Jira until you have seen a dry run and approved it.

**Input**: An output folder from a previous `generate-test-cases` run
**Output**: Xray tests in Jira, plus `agent-qa/$(date +%Y-%m-%d)-$(release or issues)/xray/upload-report.md`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/upload-to-xray/1-find-and-select-tests.md}}

{{PHASE 2: @agent-qa/commands/upload-to-xray/2-classify-and-build.md}}

{{PHASE 3: @agent-qa/commands/upload-to-xray/3-dry-run-and-confirm.md}}

{{PHASE 4: @agent-qa/commands/upload-to-xray/4-upload-and-report.md}}
