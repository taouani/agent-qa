# Generate Test Data Command

You are generating structured test data specifications from analyzed requirements and test cases.

This command creates reusable test data sets (valid, invalid, boundary values) that can be referenced by test cases, Gherkin scenarios, and Playwright tests.

**Input**: User selection of requirements analysis folder
**Output**: Test data files in `agent-qa/YYYY-MM-DD-{context}/test-data/`

**Dependencies**: Requires `analyze-requirements` to be run first. Optionally uses `generate-test-cases` output.

Carefully read and execute the instructions in the following files IN SEQUENCE.

{{PHASE 1: @agent-qa/commands/generate-test-data/1-find-and-select-requirements.md}}

{{PHASE 2: @agent-qa/commands/generate-test-data/2-analyze-data-requirements.md}}

{{PHASE 3: @agent-qa/commands/generate-test-data/3-generate-data-sets.md}}

{{PHASE 4: @agent-qa/commands/generate-test-data/4-generate-test-data-files.md}}
