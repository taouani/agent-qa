# Generate Test Charter Command

You are helping to generate test charters from analyzed requirements for agent-qa.

This command checks for existing requirements analysis, prompts the user to choose which one to use, and generates test charter markdown files.

**Input**: User selection of requirements analysis folder
**Output**: Test charter markdown files in `agent-qa/$(date +%Y-%m-%d)-$(release or issues)/test-charter/`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/generate-test-charter/1-find-and-select-requirements.md}}

{{PHASE 2: @agent-qa/commands/generate-test-charter/2-load-requirements-data.md}}

{{PHASE 3: @agent-qa/commands/generate-test-charter/3-generate-test-charter-content.md}}

{{PHASE 4: @agent-qa/commands/generate-test-charter/4-generate-test-charter-files.md}}
