# Generate Test Cases Command

You are helping to generate test cases from analyzed requirements for agent-qa.

This command checks for existing requirements analysis, prompts the user to choose which one to use, and includes test charter and/or test strategy if available. It generates test case markdown files.

**Input**: User selection of requirements analysis folder
**Output**: Test case markdown files in `agent-qa/$(date +%Y-%m-%d)-$(release or issues)/test-cases/`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/generate-test-cases/1-find-and-select-requirements.md}}

{{PHASE 2: @agent-qa/commands/generate-test-cases/2-load-requirements-and-deliverables.md}}

{{PHASE 3: @agent-qa/commands/generate-test-cases/3-generate-test-cases-content.md}}

{{PHASE 4: @agent-qa/commands/generate-test-cases/4-generate-test-case-files.md}}
