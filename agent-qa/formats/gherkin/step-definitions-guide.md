# Step Definitions Guide

Common step patterns, parameter extraction, and reusability guidelines for Gherkin steps.

## Common Given Steps

### Navigation & Page State

```gherkin
Given the user is on the "{page_name}" page
Given the user navigates to "{url_or_page}"
Given the application is accessible
```

### Authentication State

```gherkin
Given the user is logged in as "{role}"
Given the user is logged in with email "{email}" and password "{password}"
Given the user is not authenticated
Given the user session has expired
```

### Data Setup

```gherkin
Given a "{entity_type}" exists with the following details:
  | field    | value           |
  | name     | Test Entity     |
  | status   | active          |
Given the database contains {count} "{entity_type}" records
Given the "{feature_flag}" feature is enabled
```

## Common When Steps

### Form Interactions

```gherkin
When the user enters "{value}" in the "{field_name}" field
When the user clears the "{field_name}" field
When the user selects "{option}" from the "{dropdown_name}" dropdown
When the user checks the "{checkbox_name}" checkbox
When the user unchecks the "{checkbox_name}" checkbox
When the user fills in the form with:
  | field    | value           |
  | Email    | test@example.com|
  | Password | Test123!        |
```

### Button & Link Actions

```gherkin
When the user clicks the "{button_name}" button
When the user clicks the "{link_text}" link
When the user double-clicks the "{element}" element
When the user right-clicks the "{element}" element
```

### Navigation Actions

```gherkin
When the user navigates to "{page}"
When the user goes back to the previous page
When the user refreshes the page
When the user scrolls to the "{section}" section
```

### File Operations

```gherkin
When the user uploads the file "{filename}"
When the user downloads the "{document_name}" document
When the user drags "{source_element}" to "{target_element}"
```

### Search & Filter

```gherkin
When the user searches for "{query}"
When the user applies the "{filter_name}" filter with value "{value}"
When the user sorts the table by "{column_name}" in "{asc|desc}" order
```

## Common Then Steps

### Page Assertions

```gherkin
Then the user should be on the "{page_name}" page
Then the user should be redirected to "{url_or_page}"
Then the page title should be "{title}"
Then the current URL should contain "{path_segment}"
```

### Element Visibility

```gherkin
Then the "{element}" should be visible
Then the "{element}" should not be visible
Then the "{element}" should be enabled
Then the "{element}" should be disabled
```

### Text Content

```gherkin
Then the user should see "{expected_text}"
Then the user should see "{expected_text}" in the "{element}" element
Then the "{field_name}" field should contain "{expected_value}"
Then the page should not contain "{unexpected_text}"
```

### Error & Message Assertions

```gherkin
Then an error message "{message}" should be displayed
Then a success message "{message}" should be displayed
Then a confirmation dialog should appear with message "{message}"
Then the "{field_name}" field should show the validation error "{error_message}"
```

### Count & List Assertions

```gherkin
Then the table should contain {count} rows
Then the "{list_element}" should contain {count} items
Then the search results should include "{expected_item}"
```

## Parameter Extraction Patterns

### Quoted Strings

Use double quotes for string parameters:
```gherkin
When the user enters "{value}" in the "{field}" field
```
Extracts: `value` and `field` as string parameters.

### Numbers

Use bare numbers for numeric parameters:
```gherkin
Then the table should contain {count} rows
```
Extracts: `count` as an integer parameter.

### Data Tables

Use Gherkin data tables for multiple field-value pairs:
```gherkin
When the user fills in the form with:
  | field    | value     |
  | Name     | John Doe  |
  | Email    | john@test |
```

### Doc Strings

Use doc strings for multi-line text:
```gherkin
Then the user should see the following message:
  """
  Your account has been created successfully.
  Please check your email to verify your account.
  """
```

## Step Reusability Guidelines

### DO: Write Generic, Reusable Steps

```gherkin
# Good - reusable across features
When the user clicks the "{button_name}" button
Then the user should see "{message}"
```

### DON'T: Write Over-Specific Steps

```gherkin
# Bad - too specific to one scenario
When the user clicks the blue submit button on the registration form
Then the user should see the welcome message with their first name
```

### DO: Use Domain Language

```gherkin
# Good - business language
Given the user has a premium subscription
When the user requests a refund
```

### DON'T: Include Implementation Details

```gherkin
# Bad - implementation details
Given the user record in the users table has subscription_type = 'premium'
When the user sends a POST request to /api/refunds
```

## Anti-Patterns to Avoid

1. **UI implementation in steps**: Don't reference CSS selectors, element IDs, or XPaths
2. **Technical jargon**: Use business language, not code language
3. **Too many steps**: Keep scenarios to 5-10 steps maximum
4. **Conjunction steps**: Avoid "When A and B and C" — split into separate When/And steps
5. **Conditional logic**: Don't use if/else in steps — create separate scenarios
6. **Hardcoded waits**: Don't include timing ("wait 3 seconds") — handle in step definitions
