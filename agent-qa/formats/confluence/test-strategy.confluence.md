# Test Strategy — Confluence Format Template

Mapping rules for converting test strategy markdown to Confluence storage format.

## Page Structure

Add a TOC macro at the top for navigation:

```xml
<ac:structured-macro ac:name="toc">
  <ac:parameter ac:name="printable">true</ac:parameter>
  <ac:parameter ac:name="maxLevel">3</ac:parameter>
</ac:structured-macro>
```

## Metadata Panel

```xml
<ac:structured-macro ac:name="info">
  <ac:parameter ac:name="title">Test Strategy Metadata</ac:parameter>
  <ac:rich-text-body>
    <p><strong>Generated:</strong> {generated}</p>
    <p><strong>Source Requirements:</strong> {source_requirements}</p>
  </ac:rich-text-body>
</ac:structured-macro>
```

## Section Conversion

Major sections use expand macros for collapsibility:

```xml
<h2>{Section Title}</h2>
<ac:structured-macro ac:name="expand">
  <ac:parameter ac:name="title">Details</ac:parameter>
  <ac:rich-text-body>
    {section_content_as_xhtml}
  </ac:rich-text-body>
</ac:structured-macro>
```

## Test Levels Table

Convert test level tables to color-coded Confluence tables:

```xml
<table>
  <thead>
    <tr><th>Test Level</th><th>Scope</th><th>Approach</th><th>Tools</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Integration</ac:parameter><ac:parameter ac:name="colour">Blue</ac:parameter></ac:structured-macro></td>
      <td>{scope}</td><td>{approach}</td><td>{tools}</td>
    </tr>
  </tbody>
</table>
```

## Callout Conversion

```
> [!NOTE]      →  ac:name="info"
> [!WARNING]   →  ac:name="warning"
> [!IMPORTANT] →  ac:name="note"
```

## Automation Approach

Wrap code/technical sections in code macros:

```xml
<ac:structured-macro ac:name="code">
  <ac:parameter ac:name="language">text</ac:parameter>
  <ac:plain-text-body><![CDATA[{technical_content}]]></ac:plain-text-body>
</ac:structured-macro>
```
