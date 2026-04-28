# Phase 2: Convert to Confluence Format

## Core Responsibilities

- Read selected deliverable markdown files
- Apply Confluence format template rules
- Convert markdown to Confluence storage format (XHTML)
- Write `.confluence.html` files alongside originals

## Workflow Steps

### Step 1: Load Format Templates

Check for custom templates first, then fall back to defaults. For each deliverable type, check:
1. `agent-qa/custom-templates/confluence/{template-file}`
2. `agent-qa/formats/confluence/{template-file}`

| Deliverable Type | Template File |
|-----------------|---------------|
| Test Cases | `test-cases.confluence.md` |
| Test Strategy | `test-strategy.confluence.md` |
| Test Plan | `test-plan.confluence.md` |
| Test Charter | `test-charter.confluence.md` |
| Risk Register | `risk-register.confluence.md` |
| Release Notes | `release-notes.confluence.md` |

If neither custom nor default template is found, use the default conversion rules below.

### Step 2: Parse Deliverable Files

For each selected deliverable file:

1. Read the markdown file content
2. Parse YAML front matter (extract type, generated date, source requirements, language)
3. Separate the front matter from the markdown body

### Step 3: Convert Markdown to Confluence Storage Format

Apply these conversion rules (from templates or defaults):

#### Heading Conversion
```
# Heading 1    →  <h1>Heading 1</h1>
## Heading 2   →  <h2>Heading 2</h2>
### Heading 3  →  <h3>Heading 3</h3>
#### Heading 4 →  <h4>Heading 4</h4>
```

#### Table Conversion
```markdown
| Col1 | Col2 |
|------|------|
| A    | B    |
```
→
```xml
<table>
  <thead><tr><th>Col1</th><th>Col2</th></tr></thead>
  <tbody><tr><td>A</td><td>B</td></tr></tbody>
</table>
```

#### Text Formatting
```
**bold**       →  <strong>bold</strong>
*italic*       →  <em>italic</em>
`code`         →  <code>code</code>
[text](url)    →  <a href="url">text</a>
```

#### Code Block Conversion
````markdown
```language
code content
```
````
→
```xml
<ac:structured-macro ac:name="code">
  <ac:parameter ac:name="language">language</ac:parameter>
  <ac:plain-text-body><![CDATA[code content]]></ac:plain-text-body>
</ac:structured-macro>
```

#### Callout Conversion
```
> [!NOTE] text     →  <ac:structured-macro ac:name="info"><ac:rich-text-body><p>text</p></ac:rich-text-body></ac:structured-macro>
> [!WARNING] text  →  <ac:structured-macro ac:name="warning"><ac:rich-text-body><p>text</p></ac:rich-text-body></ac:structured-macro>
> [!IMPORTANT] text →  <ac:structured-macro ac:name="note"><ac:rich-text-body><p>text</p></ac:rich-text-body></ac:structured-macro>
```

#### List Conversion
```
- item    →  <ul><li>item</li></ul>
1. item   →  <ol><li>item</li></ol>
```

#### YAML Metadata → Info Panel
Convert YAML front matter into a Confluence info panel at the top of the page:
```xml
<ac:structured-macro ac:name="info">
  <ac:parameter ac:name="title">Document Metadata</ac:parameter>
  <ac:rich-text-body>
    <p><strong>Type:</strong> {type}</p>
    <p><strong>Generated:</strong> {generated}</p>
    <p><strong>Source:</strong> {source_requirements}</p>
  </ac:rich-text-body>
</ac:structured-macro>
```

#### Status Macros (for priorities and risk levels)
```xml
<ac:structured-macro ac:name="status">
  <ac:parameter ac:name="title">P1 - Critical</ac:parameter>
  <ac:parameter ac:name="colour">Red</ac:parameter>
</ac:structured-macro>
```

Color mapping: P1/Critical → Red, P2/High → Yellow, P3/Medium → Blue, P4/Low → Grey

### Step 4: Write Confluence Files

For each converted deliverable:

1. Construct the output file path: same directory, same base name with `.confluence.html` extension
   - Example: `test-cases/PROJ-123-test-cases.md` → `test-cases/PROJ-123-test-cases.confluence.html`
2. Write the Confluence storage format XHTML content
3. Log the conversion: file name, size, deliverable type

### Step 5: Generate Conversion Report

Create a summary of all converted files:
- Total files converted
- Per-file: source path, output path, deliverable type
- Any conversion warnings (unsupported markdown elements, etc.)

Store this report in memory for Phase 3.

## Constraints

- Do NOT modify the original markdown files
- Do NOT publish to Confluence in this phase (that's Phase 3)
- Write `.confluence.html` files in the same directory as the source markdown
- Preserve all content — do not summarize or truncate during conversion
