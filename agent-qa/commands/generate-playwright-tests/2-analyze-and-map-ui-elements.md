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

### Step 2: Extract Page References

Scan all test steps across selected test cases to identify pages/views:

**Page indicators in test steps:**
- "Navigate to the **login page**" → `LoginPage`
- "User is on the **dashboard**" → `DashboardPage`
- "Open the **settings** page" → `SettingsPage`
- "Redirected to the **user profile**" → `UserProfilePage`
- "**Registration form** is displayed" → `RegistrationPage`

Build a list of unique pages referenced across all test cases.

### Step 3: Extract UI Elements Per Page

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

### Step 4: Map Navigation Flows

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

### Step 5: Map Test Data to Variables

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

### Step 6: Identify Shared Pages

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
