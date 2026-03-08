# Test Cases — Confluence Format Template

Mapping rules for converting test case markdown files to Confluence storage format.

## Metadata Panel

Convert YAML front matter to an info panel at the top:

```xml
<ac:structured-macro ac:name="info">
  <ac:parameter ac:name="title">Test Case Metadata</ac:parameter>
  <ac:rich-text-body>
    <p><strong>Generated:</strong> {generated}</p>
    <p><strong>Source Requirements:</strong> {source_requirements}</p>
    <p><strong>Language:</strong> {language}</p>
  </ac:rich-text-body>
</ac:structured-macro>
```

## Priority Status Macros

Map test case priorities to colored status macros:

| Priority | Confluence Macro |
|----------|-----------------|
| P1 Critical | `<ac:structured-macro ac:name="status"><ac:parameter ac:name="title">P1 - Critical</ac:parameter><ac:parameter ac:name="colour">Red</ac:parameter></ac:structured-macro>` |
| P2 High | `<ac:structured-macro ac:name="status"><ac:parameter ac:name="title">P2 - High</ac:parameter><ac:parameter ac:name="colour">Yellow</ac:parameter></ac:structured-macro>` |
| P3 Medium | `<ac:structured-macro ac:name="status"><ac:parameter ac:name="title">P3 - Medium</ac:parameter><ac:parameter ac:name="colour">Blue</ac:parameter></ac:structured-macro>` |
| P4 Low | `<ac:structured-macro ac:name="status"><ac:parameter ac:name="title">P4 - Low</ac:parameter><ac:parameter ac:name="colour">Grey</ac:parameter></ac:structured-macro>` |

## Test Case Section

Each test case becomes a section with an expand macro:

```xml
<h2>{Test Case ID} - {Summary} {priority_status_macro}</h2>

<ac:structured-macro ac:name="expand">
  <ac:parameter ac:name="title">Test Details</ac:parameter>
  <ac:rich-text-body>
    <h3>Prerequisites</h3>
    <p>{prerequisites_text}</p>

    <h3>Test Data</h3>
    <table>
      <thead><tr><th>Field</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td>{field_name}</td><td>{field_value}</td></tr>
      </tbody>
    </table>

    <h3>Test Steps</h3>
    <table>
      <thead><tr><th>#</th><th>Action</th><th>Expected Result</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>{action}</td><td>{expected_result}</td></tr>
      </tbody>
    </table>
  </ac:rich-text-body>
</ac:structured-macro>
```

## Traceability Links

Convert requirement references to Jira issue links:

```xml
<p><strong>Requirement:</strong>
  <a href="https://jira.example.com/browse/{REQUIREMENT-KEY}">{REQUIREMENT-KEY}</a>
</p>
```

## Tags

Convert tags/labels to status macros in a row:

```xml
<p>
  <ac:structured-macro ac:name="status"><ac:parameter ac:name="title">regression</ac:parameter><ac:parameter ac:name="colour">Blue</ac:parameter></ac:structured-macro>
  <ac:structured-macro ac:name="status"><ac:parameter ac:name="title">smoke</ac:parameter><ac:parameter ac:name="colour">Green</ac:parameter></ac:structured-macro>
</p>
```
