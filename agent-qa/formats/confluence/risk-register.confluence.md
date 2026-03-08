# Risk Register — Confluence Format Template

Mapping rules for converting risk register markdown to Confluence storage format.

## Risk Summary Panel

Convert the risk summary section to a dashboard-style panel:

```xml
<ac:structured-macro ac:name="panel">
  <ac:parameter ac:name="title">Risk Summary</ac:parameter>
  <ac:parameter ac:name="borderStyle">solid</ac:parameter>
  <ac:rich-text-body>
    <table>
      <thead><tr><th>Risk Level</th><th>Count</th></tr></thead>
      <tbody>
        <tr>
          <td><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Critical</ac:parameter><ac:parameter ac:name="colour">Red</ac:parameter></ac:structured-macro></td>
          <td>{critical_count}</td>
        </tr>
        <tr>
          <td><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">High</ac:parameter><ac:parameter ac:name="colour">Yellow</ac:parameter></ac:structured-macro></td>
          <td>{high_count}</td>
        </tr>
        <tr>
          <td><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Medium</ac:parameter><ac:parameter ac:name="colour">Blue</ac:parameter></ac:structured-macro></td>
          <td>{medium_count}</td>
        </tr>
        <tr>
          <td><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Low</ac:parameter><ac:parameter ac:name="colour">Green</ac:parameter></ac:structured-macro></td>
          <td>{low_count}</td>
        </tr>
      </tbody>
    </table>
  </ac:rich-text-body>
</ac:structured-macro>
```

## Risk Matrix Table

Convert risk matrix to a color-coded table:

```xml
<h2>Risk Matrix</h2>
<table>
  <thead>
    <tr><th>ID</th><th>Risk</th><th>Probability</th><th>Impact</th><th>Score</th><th>Level</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>R-001</td>
      <td>{risk_description}</td>
      <td>{probability}</td>
      <td>{impact}</td>
      <td>{score}</td>
      <td>{risk_level_status_macro}</td>
    </tr>
  </tbody>
</table>
```

### Risk Level Color Mapping

| Score Range | Level | Color |
|-------------|-------|-------|
| 20-25 | Critical | Red |
| 12-19 | High | Yellow |
| 6-11 | Medium | Blue |
| 1-5 | Low | Green |

## Mitigation Strategies

Each risk's mitigation as an expand macro:

```xml
<ac:structured-macro ac:name="expand">
  <ac:parameter ac:name="title">R-{id}: Mitigation Strategy</ac:parameter>
  <ac:rich-text-body>
    <p><strong>Mitigation:</strong> {mitigation_text}</p>
    <p><strong>Contingency:</strong> {contingency_text}</p>
    <p><strong>Owner:</strong> {owner}</p>
  </ac:rich-text-body>
</ac:structured-macro>
```

## Metadata Panel

```xml
<ac:structured-macro ac:name="info">
  <ac:parameter ac:name="title">Risk Register Metadata</ac:parameter>
  <ac:rich-text-body>
    <p><strong>Generated:</strong> {generated}</p>
    <p><strong>Source Requirements:</strong> {source_requirements}</p>
    <p><strong>Total Risks:</strong> {total_count}</p>
  </ac:rich-text-body>
</ac:structured-macro>
```
