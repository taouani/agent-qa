# Phase 2: Analyze and Map UI Elements

## Core Responsibilities

- Identify pages/views referenced in test steps
- Identify UI elements (fields, buttons, links, menus)
- Map navigation flows between pages
- Build a page inventory for Page Object generation

## Workflow Steps

### Step 1: Load Templates

Check for custom templates first, then fall back to defaults:

1. Check `agent-qa/custom-templates/playwright/page-object-template.md`, else use `agent-qa/formats/playwright/page-object-template.md`
2. Check `agent-qa/custom-templates/playwright/spec-file-template.md`, else use `agent-qa/formats/playwright/spec-file-template.md`
3. Read `agent-qa/formats/playwright/auth-fixture-template.md` — for authentication fixture patterns
4. Read `agent-qa/formats/playwright/api-mock-template.md` — for API mocking patterns
5. Read `agent-qa/formats/playwright/visual-regression-template.md` — for screenshot comparison patterns

Also read `agent-qa/config.yml` for Playwright-specific settings:
- `playwright_base_url` — base URL for navigation
- `playwright_browser` — browser engine (chromium, firefox, webkit)
- `playwright_viewport` — default viewport size

If neither custom nor default templates are found, use the default patterns described in this phase.

### Step 2: Load the Exploration Report If Present

Check for `{selected_folder}/ui-snapshots/exploration.md`.

**If it exists** — this is the exploration-backed path:

1. Read the `## Locators` table. For each row, record element, locator expression, rank, and
   source snapshot.
2. Read the `## Waits` table and record each observable wait condition by page.
3. Read `## Messages` and use the exact strings for assertions.
4. Read `## Unverifiable Steps`. Steps listed there have NO observed locator — they keep the
   TODO-comment treatment described in Phase 4. Never substitute a guess for an unverifiable step.
5. Read `## Recovery Notes` and carry any forced-interaction requirement into the generated code
   as a comment on the relevant action.

Set `exploration_available: true` and use these locators in preference to any inference.

**If it does not exist** — this is the inference path. Set `exploration_available: false` and
continue with the remaining steps of this phase unchanged. Behaviour must be identical to before
this feature existed. Mention once in the run summary:

    No UI exploration found. Locators are inferred and marked with TODO comments.
    Run /agent-qa:explore-ui first to generate real locators.

Then read the framework profile WITHOUT running discovery. If `agent-qa/framework-profile.md`
exists and its front matter says `reviewed: true`, read its `## Layout` section for
`page_object_dir`, `page_object_naming`, `fixture_import`, `spec_dir` and `spec_naming`, and
prefer those over the generic templates. If the profile is absent, or exists with
`reviewed: false`, use the generic templates and say so once in the run summary.

Do NOT delegate to the shared profile-discovery snippet under `agent-qa/commands/common/` from
this command — it STOPS on every branch — and never stop this command because a profile is
missing, unreviewed, or because no Playwright project could be found. This command must run to
completion for projects that have never opted into live automation.

### Step 3: Extract Page References

Scan all test steps across selected test cases to identify pages/views:

**Page indicators in test steps:**
- "Navigate to the **login page**" → `LoginPage`
- "User is on the **dashboard**" → `DashboardPage`
- "Open the **settings** page" → `SettingsPage`
- "Redirected to the **user profile**" → `UserProfilePage`
- "**Registration form** is displayed" → `RegistrationPage`

Build a list of unique pages referenced across all test cases.

### Step 4: Extract UI Elements Per Page

For each identified page, scan test steps to find referenced UI elements:

**Element indicators:**

| Test Step Pattern | Element Type | Locator Strategy |
|------------------|-------------|-----------------|
| "Enter in the **Email** field" | textbox | `getByRole('textbox', { name: 'Email' })` |
| "Enter in the **Password** field" | textbox | `getByRole('textbox', { name: 'Password' })` |
| "Click the **Submit** button" | button | `getByRole('button', { name: 'Submit' })` |
| "Click the **Cancel** link" | link | `getByRole('link', { name: 'Cancel' })` |
| "Select from the **Country** dropdown" | combobox | `getByRole('combobox', { name: 'Country' })` |
| "Check the **Agree** checkbox" | checkbox | `getByRole('checkbox', { name: 'Agree' })` |
| "See the **Welcome** heading" | heading | `getByRole('heading', { name: 'Welcome' })` |
| "See the **Success** message" | text | `getByText('Success')` |
| "The **error message** is displayed" | alert/text | `getByRole('alert')` or `getByText(...)` |
| "The **table** contains rows" | table | `getByRole('table')` |
| "Click the **Settings** menu" | menuitem | `getByRole('menuitem', { name: 'Settings' })` |

### Step 5: Map Navigation Flows

Identify navigation patterns between pages:

```
LoginPage.goto() → /login
LoginPage.login() → DashboardPage (/dashboard)
DashboardPage.navigateToSettings() → SettingsPage (/settings)
DashboardPage.navigateToProfile() → UserProfilePage (/profile)
```

Record:
- Which page each test starts on
- Which pages are navigated to during the test
- Expected URL patterns after navigation

### Step 6: Map Test Data to Variables

For test steps with concrete data values, identify TypeScript variable mappings:

```
"Enter 'test@example.com'" → email: string parameter
"Enter 'Password123!'"     → password: string parameter
"Select 'France'"          → option: string parameter
```

For data-driven test cases, identify the data structure:

```typescript
interface LoginTestData {
  email: string;
  password: string;
  expectedResult: string;
}
```

### Step 7: Identify Shared Pages

Determine which Page Objects are used across multiple test cases:

```
LoginPage: used in TC-001, TC-002, TC-005 (shared)
DashboardPage: used in TC-001, TC-003, TC-004 (shared)
SettingsPage: used in TC-004 only (unique)
```

Shared pages are higher priority for well-designed Page Objects.

## Data Storage

Store for subsequent phases:
- `page_inventory`: Map of page name → list of UI elements with locator strategies
- `navigation_flows`: Map of page → page transitions with URL patterns
- `element_locators`: Map of element name → recommended Playwright locator
- `data_variables`: Map of test case → data parameter types
- `shared_pages`: List of pages used across multiple test cases

## Constraints

- Do NOT write any files in this phase
- Do NOT guess element locators for elements not mentioned in test steps
- Add TODO markers for any elements where the locator strategy is uncertain
