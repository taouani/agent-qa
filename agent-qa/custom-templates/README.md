# Custom Templates

Place custom format templates in this directory to override the defaults in `agent-qa/formats/`.

## How It Works

Commands check this directory first before falling back to `agent-qa/formats/`. To customize a template:

1. Copy the template from `agent-qa/formats/{category}/{template-name}.md`
2. Place it in `agent-qa/custom-templates/{category}/{template-name}.md`
3. Modify the copy as needed

## Directory Structure

Mirror the `formats/` structure:

```
agent-qa/custom-templates/
├── confluence/              # Override Confluence format templates
│   ├── test-cases.confluence.md
│   ├── test-strategy.confluence.md
│   └── ...
├── gherkin/                 # Override Gherkin templates
│   ├── feature-template.md
│   └── step-definitions-guide.md
└── playwright/              # Override Playwright templates
    ├── page-object-template.md
    └── spec-file-template.md
```

## Examples

### Custom Gherkin tags

Copy `agent-qa/formats/gherkin/feature-template.md` here and modify the tag mapping to match your team's conventions.

### Custom Playwright locator strategy

Copy `agent-qa/formats/playwright/page-object-template.md` here and change the locator priority to prefer `data-testid` over `getByRole`.

### Custom Confluence macros

Copy any `agent-qa/formats/confluence/*.confluence.md` here and adjust the XHTML macro usage to match your Confluence space's custom macros.

## Notes

- Custom templates are not overwritten by `project-update.sh`
- Only override templates you actually need to change
- Keep the same filename as the original template
