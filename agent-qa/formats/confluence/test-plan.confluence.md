# Test Plan — Confluence Format Template

Mapping rules for converting test plan markdown to Confluence storage format.

## Page Structure

Add TOC macro at top:

```xml
<ac:structured-macro ac:name="toc">
  <ac:parameter ac:name="printable">true</ac:parameter>
  <ac:parameter ac:name="maxLevel">3</ac:parameter>
</ac:structured-macro>
```

## Executive Summary

Convert to a prominent info panel:

```xml
<ac:structured-macro ac:name="info">
  <ac:parameter ac:name="title">Executive Summary</ac:parameter>
  <ac:rich-text-body>
    <p>{executive_summary_text}</p>
  </ac:rich-text-body>
</ac:structured-macro>
```

## Schedule Table

Convert schedule/milestone tables:

```xml
<table>
  <thead>
    <tr><th>Phase</th><th>Start Date</th><th>End Date</th><th>Deliverables</th><th>Status</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>{phase}</td><td>{start}</td><td>{end}</td><td>{deliverables}</td>
      <td><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Planned</ac:parameter><ac:parameter ac:name="colour">Blue</ac:parameter></ac:structured-macro></td>
    </tr>
  </tbody>
</table>
```

## Entry/Exit Criteria

Use status macros for pass/fail indicators:

```xml
<h3>Entry Criteria</h3>
<table>
  <thead><tr><th>Criteria</th><th>Status</th></tr></thead>
  <tbody>
    <tr>
      <td>{criteria_text}</td>
      <td><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Met</ac:parameter><ac:parameter ac:name="colour">Green</ac:parameter></ac:structured-macro></td>
    </tr>
    <tr>
      <td>{criteria_text}</td>
      <td><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Not Met</ac:parameter><ac:parameter ac:name="colour">Red</ac:parameter></ac:structured-macro></td>
    </tr>
  </tbody>
</table>
```

## Deliverables

Convert deliverables list to a linked table:

```xml
<table>
  <thead><tr><th>Deliverable</th><th>Description</th><th>Owner</th></tr></thead>
  <tbody>
    <tr><td>{deliverable_name}</td><td>{description}</td><td>{owner}</td></tr>
  </tbody>
</table>
```

## Approval Section

Convert approval blocks to a structured panel:

```xml
<ac:structured-macro ac:name="note">
  <ac:parameter ac:name="title">Approval</ac:parameter>
  <ac:rich-text-body>
    <table>
      <thead><tr><th>Role</th><th>Name</th><th>Date</th><th>Signature</th></tr></thead>
      <tbody>
        <tr><td>{role}</td><td>{name}</td><td>{date}</td><td>________________</td></tr>
      </tbody>
    </table>
  </ac:rich-text-body>
</ac:structured-macro>
```
