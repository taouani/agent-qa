# Generate Gherkin Command

You are helping to generate Gherkin BDD `.feature` files from existing test cases for agent-qa.

This command finds existing test case files, maps test steps to Given/When/Then syntax, and generates `.feature` files grouped by requirement key.

**Input**: User selection of test cases folder
**Output**: Gherkin `.feature` files in `agent-qa/YYYY-MM-DD-{context}/gherkin/`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/generate-gherkin/1-find-and-select-test-cases.md}}

{{PHASE 2: @agent-qa/commands/generate-gherkin/2-map-test-cases-to-scenarios.md}}

{{PHASE 3: @agent-qa/commands/generate-gherkin/3-generate-feature-files.md}}

{{PHASE 4: @agent-qa/commands/generate-gherkin/4-validate-and-write-files.md}}
