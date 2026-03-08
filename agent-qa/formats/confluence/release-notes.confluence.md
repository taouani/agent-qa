# Release Notes — Confluence Format Template

Mapping rules for converting release notes markdown to Confluence storage format.

## Version Info Panel

Convert release metadata to a prominent info panel:

```xml
<ac:structured-macro ac:name="info">
  <ac:parameter ac:name="title">Release Notes</ac:parameter>
  <ac:rich-text-body>
    <p><strong>Generated:</strong> {generated}</p>
    <p><strong>Source Requirements:</strong> {source_requirements}</p>
    <p><strong>Release:</strong> {release_context}</p>
  </ac:rich-text-body>
</ac:structured-macro>
```

## Change Categories

Convert each change category to a structured panel:

```xml
<ac:structured-macro ac:name="panel">
  <ac:parameter ac:name="title">New Features</ac:parameter>
  <ac:parameter ac:name="borderStyle">solid</ac:parameter>
  <ac:parameter ac:name="borderColor">#36B37E</ac:parameter>
  <ac:rich-text-body>
    <ul>
      <li><strong>{REQUIREMENT-KEY}:</strong> {feature_description}</li>
    </ul>
  </ac:rich-text-body>
</ac:structured-macro>

<ac:structured-macro ac:name="panel">
  <ac:parameter ac:name="title">Bug Fixes</ac:parameter>
  <ac:parameter ac:name="borderStyle">solid</ac:parameter>
  <ac:parameter ac:name="borderColor">#FFAB00</ac:parameter>
  <ac:rich-text-body>
    <ul>
      <li><strong>{REQUIREMENT-KEY}:</strong> {fix_description}</li>
    </ul>
  </ac:rich-text-body>
</ac:structured-macro>

<ac:structured-macro ac:name="panel">
  <ac:parameter ac:name="title">Improvements</ac:parameter>
  <ac:parameter ac:name="borderStyle">solid</ac:parameter>
  <ac:parameter ac:name="borderColor">#4C9AFF</ac:parameter>
  <ac:rich-text-body>
    <ul>
      <li><strong>{REQUIREMENT-KEY}:</strong> {improvement_description}</li>
    </ul>
  </ac:rich-text-body>
</ac:structured-macro>
```

## Traceability Table

Convert traceability matrix to a linked table:

```xml
<h2>Traceability</h2>
<table>
  <thead>
    <tr><th>Requirement</th><th>Description</th><th>Status</th><th>Test Coverage</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><a href="https://jira.example.com/browse/{KEY}">{KEY}</a></td>
      <td>{description}</td>
      <td><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Done</ac:parameter><ac:parameter ac:name="colour">Green</ac:parameter></ac:structured-macro></td>
      <td>{coverage_summary}</td>
    </tr>
  </tbody>
</table>
```

## Known Issues

Convert known issues to a warning panel:

```xml
<ac:structured-macro ac:name="warning">
  <ac:parameter ac:name="title">Known Issues</ac:parameter>
  <ac:rich-text-body>
    <ul>
      <li><strong>{ISSUE-KEY}:</strong> {issue_description}</li>
    </ul>
  </ac:rich-text-body>
</ac:structured-macro>
```

## Code Changes Section

Wrap code change details in expand macros:

```xml
<ac:structured-macro ac:name="expand">
  <ac:parameter ac:name="title">Code Changes Details</ac:parameter>
  <ac:rich-text-body>
    <table>
      <thead><tr><th>Commit</th><th>Author</th><th>Message</th><th>Files Changed</th></tr></thead>
      <tbody>
        <tr><td>{commit_hash}</td><td>{author}</td><td>{message}</td><td>{files_count}</td></tr>
      </tbody>
    </table>
  </ac:rich-text-body>
</ac:structured-macro>
```
