# Gherkin Feature File Template

Mapping rules for converting Agent-QA test cases into Gherkin `.feature` files.

## File Structure

One `.feature` file per requirement key. File naming: `{REQUIREMENT-KEY}.feature`
Output directory: `agent-qa/YYYY-MM-DD-{context}/gherkin/`

## Feature Mapping

```gherkin
@{REQUIREMENT-KEY} @regression
Feature: {Requirement Summary}
  As a {user role from requirement}
  I want {objective from requirement}
  So that {business value from requirement}
```

- Feature name comes from the requirement summary
- `@{REQUIREMENT-KEY}` tag links to the source requirement
- `@regression` tag added if any test case has `regressionSuite: true`

## Background Section

Shared preconditions across multiple test cases in the same feature become Background steps:

```gherkin
  Background:
    Given the user is logged in as "{default_role}"
    And the user is on the "{starting_page}" page
```

- Only include preconditions common to ALL scenarios in the feature
- Preconditions unique to individual test cases go in the Scenario's own Given steps

## Step Verb Mapping

### Given Steps (Context/Setup)

Action verbs that establish context or preconditions:

| Test Step Verb | Gherkin Step |
|---------------|-------------|
| Navigate to | Given the user navigates to "{page}" |
| Open | Given the user opens "{page/dialog}" |
| Go to | Given the user is on the "{page}" page |
| Browse to | Given the user browses to "{url}" |
| Log in / Sign in | Given the user is logged in as "{role}" |
| Set / Configure | Given the "{setting}" is set to "{value}" |
| Ensure / Prerequisite | Given {precondition_text} |

### When Steps (Actions)

Action verbs that perform user interactions:

| Test Step Verb | Gherkin Step |
|---------------|-------------|
| Enter / Input / Type | When the user enters "{value}" in the "{field}" field |
| Click / Press / Tap | When the user clicks the "{element}" button |
| Select | When the user selects "{option}" from the "{dropdown}" dropdown |
| Submit | When the user submits the form |
| Upload | When the user uploads the file "{filename}" |
| Drag | When the user drags "{source}" to "{target}" |
| Fill | When the user fills in the "{field}" with "{value}" |
| Check / Uncheck | When the user checks the "{checkbox}" checkbox |
| Toggle | When the user toggles "{element}" |
| Search | When the user searches for "{query}" |
| Scroll | When the user scrolls to the "{section}" section |

### Then Steps (Assertions)

Action verbs that verify outcomes:

| Test Step Verb | Gherkin Step |
|---------------|-------------|
| Verify / Validate | Then the user should see "{expected_text}" |
| Confirm | Then the "{element}" should be visible |
| Observe | Then the page displays "{content}" |
| Check / Assert | Then the "{field}" should contain "{value}" |
| Ensure | Then the system should {expected_behavior} |
| See / Expect | Then the user should see the "{element}" |
| Expect error | Then an error message "{message}" should be displayed |
| Expect redirect | Then the user should be redirected to "{page}" |

## Priority Tag Mapping

| Priority | Tags |
|----------|------|
| P1 Critical | `@critical @smoke` |
| P2 High | `@high` |
| P3 Medium | `@medium` |
| P4 Low | `@low` |

## Scenario Types

### Simple Scenario (single data set)

```gherkin
  @critical @smoke
  Scenario: TC-PROJ-123-001 - Successful login with valid credentials
    Given the user navigates to the login page
    When the user enters "test@example.com" in the "Email" field
    And the user enters "Password123!" in the "Password" field
    And the user clicks the "Login" button
    Then the user should be redirected to the dashboard
    And the user should see "Welcome" on the page
```

- Test case ID and summary become the Scenario name
- Single test data values are inlined in the step text

### Scenario Outline (multiple data sets)

```gherkin
  @high
  Scenario Outline: TC-PROJ-123-005 - Login with various user roles
    Given the user navigates to the login page
    When the user enters "<email>" in the "Email" field
    And the user enters "<password>" in the "Password" field
    And the user clicks the "Login" button
    Then the user should see the "<dashboard_type>" dashboard

    Examples:
      | email              | password      | dashboard_type |
      | admin@example.com  | AdminPass1!   | Admin          |
      | user@example.com   | UserPass1!    | Standard       |
      | guest@example.com  | GuestPass1!   | Limited        |
```

- Use when a test case has multiple data rows
- Variables in angle brackets `<variable>` match Examples table columns

## Complete Example

```gherkin
@PROJ-123 @regression
Feature: User Authentication
  As a registered user
  I want to log in to the application
  So that I can access my personalized dashboard

  Background:
    Given the application is accessible
    And the user is on the login page

  @critical @smoke
  Scenario: TC-PROJ-123-001 - Successful login with valid credentials
    When the user enters "test@example.com" in the "Email" field
    And the user enters "Password123!" in the "Password" field
    And the user clicks the "Login" button
    Then the user should be redirected to the dashboard
    And the user should see "Welcome" on the page

  @high
  Scenario: TC-PROJ-123-002 - Login fails with invalid password
    When the user enters "test@example.com" in the "Email" field
    And the user enters "WrongPassword" in the "Password" field
    And the user clicks the "Login" button
    Then an error message "Invalid credentials" should be displayed
    And the user should remain on the login page

  @medium
  Scenario Outline: TC-PROJ-123-005 - Login with various user roles
    When the user enters "<email>" in the "Email" field
    And the user enters "<password>" in the "Password" field
    And the user clicks the "Login" button
    Then the user should see the "<dashboard_type>" dashboard

    Examples:
      | email              | password      | dashboard_type |
      | admin@example.com  | AdminPass1!   | Admin          |
      | user@example.com   | UserPass1!    | Standard       |
```
