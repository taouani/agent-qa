# Generate API Tests Command

You are helping to generate REST/GraphQL API test specifications from existing test cases for agent-qa.

This command finds existing test case files, filters for API-relevant test cases, analyzes endpoint information, and generates structured API test specification files.

**Input**: User selection of test cases folder
**Output**: API test specification files in `agent-qa/YYYY-MM-DD-{context}/api-tests/`
**Depends on**: `generate-test-cases` output

Carefully read and execute the instructions in the following files IN SEQUENCE, following their numbered file names. Only proceed to the next numbered instruction file once the previous numbered instruction has been executed.

Instructions to follow in sequence:

{{PHASE 1: @agent-qa/commands/generate-api-tests/1-find-and-select-test-cases.md}}

{{PHASE 2: @agent-qa/commands/generate-api-tests/2-analyze-api-endpoints.md}}

{{PHASE 3: @agent-qa/commands/generate-api-tests/3-generate-api-test-specs.md}}

{{PHASE 4: @agent-qa/commands/generate-api-tests/4-generate-api-test-files.md}}
