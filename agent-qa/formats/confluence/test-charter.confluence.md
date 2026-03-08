# Test Charter — Confluence Format Template

Mapping rules for converting test charter markdown to Confluence storage format.

## Metadata Panel

```xml
<ac:structured-macro ac:name="info">
  <ac:parameter ac:name="title">Test Charter</ac:parameter>
  <ac:rich-text-body>
    <p><strong>Generated:</strong> {generated}</p>
    <p><strong>Source Requirements:</strong> {source_requirements}</p>
    <p><strong>Mission:</strong> {charter_mission}</p>
  </ac:rich-text-body>
</ac:structured-macro>
```

## Session Panels

Convert each test session to a structured panel with borders:

```xml
<ac:structured-macro ac:name="panel">
  <ac:parameter ac:name="title">Session {N}: {session_title}</ac:parameter>
  <ac:parameter ac:name="borderStyle">solid</ac:parameter>
  <ac:parameter ac:name="borderColor">#4C9AFF</ac:parameter>
  <ac:rich-text-body>
    <p><strong>Area:</strong> {area}</p>
    <p><strong>Duration:</strong> {duration}</p>
    <p><strong>Priority:</strong> {priority_status_macro}</p>

    <h4>Charter</h4>
    <p>Explore {area} using {approach} to discover {target_information}</p>

    <h4>Notes</h4>
    <p>{session_notes}</p>
  </ac:rich-text-body>
</ac:structured-macro>
```

## SFDIPOT Heuristics Table

Convert heuristics to a structured table:

```xml
<h2>SFDIPOT Heuristics</h2>
<table>
  <thead>
    <tr><th>Category</th><th>Description</th><th>Areas to Explore</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>S</strong>tructure</td><td>What the product is</td><td>{areas}</td></tr>
    <tr><td><strong>F</strong>unction</td><td>What the product does</td><td>{areas}</td></tr>
    <tr><td><strong>D</strong>ata</td><td>What the product processes</td><td>{areas}</td></tr>
    <tr><td><strong>I</strong>nterface</td><td>How the product connects</td><td>{areas}</td></tr>
    <tr><td><strong>P</strong>latform</td><td>What the product depends on</td><td>{areas}</td></tr>
    <tr><td><strong>O</strong>perations</td><td>How the product is used</td><td>{areas}</td></tr>
    <tr><td><strong>T</strong>ime</td><td>How the product changes over time</td><td>{areas}</td></tr>
  </tbody>
</table>
```

## Scope Definition

Use expand macros for in-scope and out-of-scope:

```xml
<ac:structured-macro ac:name="expand">
  <ac:parameter ac:name="title">In Scope</ac:parameter>
  <ac:rich-text-body>{in_scope_content}</ac:rich-text-body>
</ac:structured-macro>

<ac:structured-macro ac:name="expand">
  <ac:parameter ac:name="title">Out of Scope</ac:parameter>
  <ac:rich-text-body>{out_of_scope_content}</ac:rich-text-body>
</ac:structured-macro>
```

## Time Estimates

Use status macros for session time allocations:

```xml
<ac:structured-macro ac:name="status">
  <ac:parameter ac:name="title">{duration} min</ac:parameter>
  <ac:parameter ac:name="colour">Blue</ac:parameter>
</ac:structured-macro>
```
