# Generate Playwright Tests Command

You are helping to generate Playwright test specification files (.spec.ts) and Page Object classes from existing test cases for agent-qa.

This command finds existing test case files, analyzes UI elements and navigation flows, generates Page Object Model classes, and creates test spec files.

**Input**: User selection of test cases folder
**Output**: Playwright `.spec.ts` and `.page.ts` files in `agent-qa/YYYY-MM-DD-{context}/playwright/`

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/generate-playwright-tests/1-find-and-select-test-cases.md}}

{{PHASE 2: @agent-qa/commands/generate-playwright-tests/2-analyze-and-map-ui-elements.md}}

{{PHASE 3: @agent-qa/commands/generate-playwright-tests/3-generate-page-objects.md}}

{{PHASE 4: @agent-qa/commands/generate-playwright-tests/4-generate-test-specs.md}}
