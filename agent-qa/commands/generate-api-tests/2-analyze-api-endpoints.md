# Phase 2: Analyze API Endpoints

## Core Responsibilities

- Apply the api-test-design role's endpoint-analysis craft to extract API endpoint information from filtered test cases and their source requirements
- Apply the role's craft to identify HTTP methods, URL paths, request/response structures
- Apply the role's craft to handle both REST and GraphQL patterns
- Apply the role's craft to group endpoints by resource or domain
- Apply the role's craft to identify shared authentication patterns

## Workflow Steps

### Step 1: Load Templates and Configuration

Check for custom templates first, then fall back to defaults:

1. Check `agent-qa/custom-templates/api-tests/api-spec-template.md`, else use `agent-qa/formats/api-tests/api-spec-template.md`
2. Read `agent-qa/config.yml` for `api_test_base_url` setting

If neither custom nor default templates are found, use the default patterns described in this phase.

### Step 2: Load Source Requirements

For each requirement key referenced by the API test cases:

1. Check for requirement files in `{selected_folder}/requirements/{REQUIREMENT-KEY}.md`
2. Read requirement content for additional API context:
   - API endpoint URLs mentioned in descriptions or acceptance criteria
   - Request/response examples in code blocks
   - Authentication requirements
   - Rate limiting or quota mentions

### Step 3: Analyze the API Surface

Apply `@agent-qa/roles/api-test-design.md`, section `## Endpoint Analysis`, to the requirements
loaded in Step 2, together with `api_test_base_url` from `agent-qa/config.yml`.

## Data Storage

Store for subsequent phases:
- `endpoint_groups`: Map of group name to list of endpoints with full details
- `auth_patterns`: Map of auth type to list of endpoints using it
- `data_structures`: Map of structure name to field definitions
- `graphql_operations`: List of GraphQL queries/mutations with variables
- `api_base_url`: Base URL from config (or placeholder)
- `template_content`: Loaded API spec template

## Constraints

- Do NOT write any files in this phase
- Do NOT invent endpoints not referenced in test cases or requirements
- Add TODO markers for endpoints where method or path is ambiguous
- If no clear URL path is found, use a placeholder like `/api/{resource}` with a TODO comment
