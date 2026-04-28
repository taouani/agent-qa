# Phase 4: Generate API Test Files

## Core Responsibilities

- Write API test specification files to the output directory
- Generate an index file with endpoint coverage matrix
- Optionally generate Playwright API test files
- Update the output folder index

## Workflow Steps

### Step 1: Create Output Directory

Create the `api-tests/` subdirectory in the selected output folder:

```
{selected_folder}/api-tests/
```

### Step 2: Write Per-Endpoint-Group Files

For each endpoint group, generate a markdown file:

**File name**: `{endpoint-group}-api-tests.md` (e.g., `users-api-tests.md`, `auth-api-tests.md`)

**File structure**:

```markdown
---
type: api-test-spec
generated: YYYY-MM-DD HH:MM
source_requirements:
  - {REQUIREMENT-KEY-1}
  - {REQUIREMENT-KEY-2}
endpoint_group: {group-name}
language: {detected-language-code}
version: "1.0"
---

# API Tests: {Group Name}

## Base URL

`{api_test_base_url}`

## Authentication

{Description of auth pattern for this group}

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/{resource} | List {resources} |
| POST | /api/v1/{resource} | Create {resource} |
| ... | ... | ... |

## Test Cases

### Positive Tests

{Generated positive test specs from Phase 3}

### Negative Tests

{Generated negative test specs from Phase 3}

### Authentication Tests

{Generated auth test specs from Phase 3}

### Edge Cases

{Generated edge case test specs from Phase 3}

### Error Handling Tests

{Generated error handling test specs from Phase 3}

## Test Summary

| Test ID | Description | Method | Endpoint | Expected Status | Priority |
|---------|------------|--------|----------|----------------|----------|
| API-{GROUP}-001 | ... | ... | ... | ... | ... |
| ... | ... | ... | ... | ... | ... |
```

### Step 3: Generate Index File

Write `{selected_folder}/api-tests/api-tests-index.md`:

```markdown
---
type: api-test-spec
generated: YYYY-MM-DD HH:MM
source_requirements:
  - {all requirement keys}
language: {majority-language-code}
version: "1.0"
---

# API Test Specifications Index

## Overview

- **Total endpoint groups**: {count}
- **Total API tests**: {count}
- **Priority breakdown**: P1: {n}, P2: {n}, P3: {n}, P4: {n}

## Endpoint Coverage Matrix

| Endpoint Group | Endpoints | Positive | Negative | Auth | Edge Cases | Error | Total |
|---------------|-----------|----------|----------|------|------------|-------|-------|
| {group-name} | {n} | {n} | {n} | {n} | {n} | {n} | {n} |
| ... | ... | ... | ... | ... | ... | ... | ... |
| **Total** | **{n}** | **{n}** | **{n}** | **{n}** | **{n}** | **{n}** | **{n}** |

## Authentication Patterns

| Pattern | Endpoints Using It |
|---------|-------------------|
| Bearer Token | {list} |
| API Key | {list} |
| No Auth (Public) | {list} |

## Files

| File | Endpoint Group | Tests | Source Requirements |
|------|---------------|-------|---------------------|
| {group}-api-tests.md | {Group Name} | {n} | {keys} |
| ... | ... | ... | ... |

## Source Test Cases

| Source Test Case | API Tests Generated |
|-----------------|---------------------|
| {TC-ID} | {API-IDs} |
| ... | ... |
```

### Step 4: Generate Playwright API Tests (Optional)

Check `agent-qa/config.yml` for Playwright-related settings. If Playwright output is enabled or if a `playwright/` folder already exists in `{selected_folder}`, generate Playwright API test files.

For each endpoint group, generate `{endpoint-group}.api.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

const BASE_URL = '{api_test_base_url}';

test.describe('API Tests: {Group Name}', () => {

  // Authentication helper
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    // TODO: Implement authentication to obtain token
    // const response = await request.post(`${BASE_URL}/api/v1/auth/login`, {
    //   data: { email: 'test@example.com', password: 'password' }
    // });
    // authToken = (await response.json()).token;
  });

  test('API-{GROUP}-001: {Test Description}', async ({ request }) => {
    const response = await request.{method}(`${BASE_URL}{path}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      data: {request_body},  // For POST/PUT/PATCH
    });

    expect(response.status()).toBe({expected_status});
    const body = await response.json();
    // Assertions on response body
    expect(body).toHaveProperty('{expected_field}');
  });

});
```

Write Playwright API spec files to:

```
{selected_folder}/api-tests/{endpoint-group}.api.spec.ts
```

### Step 5: Present Results

Present a summary to the user:

```
API test specification generation complete!

Output: {selected_folder}/api-tests/
  - {group_count} endpoint group files
  - {test_count} total API test specifications
  - Priority: P1={n}, P2={n}, P3={n}, P4={n}
  (- {spec_count} Playwright API spec files)

Files generated:
  api-tests/users-api-tests.md (15 tests)
  api-tests/auth-api-tests.md (8 tests)
  api-tests/orders-api-tests.md (12 tests)
  api-tests/api-tests-index.md
  (api-tests/users.api.spec.ts)
  (api-tests/auth.api.spec.ts)

Next steps:
  1. Review generated API test specs for accuracy
  2. Verify endpoint URLs and expected responses against actual API
  3. Look for TODO markers that need manual completion
  4. (Optional) Run Playwright API tests: npx playwright test *.api.spec.ts
```

### Step 6: Generate Output Index

Follow the instructions in `@agent-qa/commands/common/generate-output-index.md` to generate or update the `README.md` index file in the output folder.

### Step 7: Execute Post-Generation Hooks

Follow the instructions in `@agent-qa/commands/common/execute-post-hooks.md` to run any configured post-generation hooks.

## Constraints

- Write files ONLY to the `api-tests/` subdirectory of the selected output folder
- Do NOT modify existing test case files or other deliverables
- Do NOT create project configuration files (package.json, tsconfig, etc.)
- Include YAML front matter in all markdown files
- Match the language of the source requirements for all descriptions
- Include TODO comments for uncertain response structures or endpoint paths
- Playwright API spec files are optional and only generated when Playwright is configured
