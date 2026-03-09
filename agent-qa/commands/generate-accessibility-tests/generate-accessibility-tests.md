# Generate Accessibility Tests Command

You are helping to generate WCAG 2.1 AA accessibility test cases from existing test cases for agent-qa.

This command checks for existing test case output, prompts the user to choose which one to use, analyzes UI-facing test cases for accessibility requirements, and generates accessibility test cases mapped to WCAG 2.1 AA success criteria.

**Input**: User selection of test cases folder
**Output**: Accessibility test case files in `agent-qa/$(date +%Y-%m-%d)-$(release or issues)/accessibility-tests/`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/generate-accessibility-tests/1-find-and-select-test-cases.md}}

{{PHASE 2: @agent-qa/commands/generate-accessibility-tests/2-analyze-accessibility-requirements.md}}

{{PHASE 3: @agent-qa/commands/generate-accessibility-tests/3-generate-accessibility-test-cases.md}}

{{PHASE 4: @agent-qa/commands/generate-accessibility-tests/4-generate-accessibility-test-files.md}}
