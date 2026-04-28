# Generate API Tests Command

You are helping to generate REST/GraphQL API test specifications from existing test cases for agent-qa.

This command finds existing test case files, filters for API-relevant test cases, analyzes endpoint information, and generates structured API test specification files.

**Input**: User selection of test cases folder
**Output**: API test specification files in `agent-qa/YYYY-MM-DD-{context}/api-tests/`

Execute the generate-api-tests command by following the phases defined in:
@agent-qa/commands/generate-api-tests/generate-api-tests.md
