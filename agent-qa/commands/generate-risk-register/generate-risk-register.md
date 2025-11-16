# Generate Risk Register Command

You are helping to generate risk registers from analyzed requirements for agent-qa.

This command checks for existing requirements analysis, prompts the user to choose which one to use, and includes test charter, test strategy, and/or test cases if available. It generates risk register markdown files.

**Input**: User selection of requirements analysis folder
**Output**: Risk register markdown files in `agent-qa/$(date +%Y-%m-%d)-$(release or issues)/risk-register/`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/generate-risk-register/1-find-and-select-requirements.md}}

{{PHASE 2: @agent-qa/commands/generate-risk-register/2-load-requirements-and-deliverables.md}}

{{PHASE 3: @agent-qa/commands/generate-risk-register/3-identify-and-analyze-risks.md}}

{{PHASE 4: @agent-qa/commands/generate-risk-register/4-generate-risk-register-files.md}}
