# Salesforce pack

The Salesforce pack is what script generation knows about Lightning. It is data, not prompt text spread around the code:

- **Rules** (`LIGHTNING_RULES` in `src/workflows/packs/salesforce.ts`) cover shadow DOM, generated ids, spinners, toasts, lookups, picklists, records opened by URL, related lists, modals, Screen Flows, exact names and record data.
- **Locator order.** The forms your repo already uses come first, then the rest of role, label, text, test id, placeholder, title and alt text. CSS and XPath always come last.
- **Helpers** live in a real file, [`packs/salesforce/lightning.ts`](../packs/salesforce/lightning.ts), for Playwright 1.49 or later. It needs no other dependency and works in CommonJS and ESM projects.

| Helper | What it does |
|---|---|
| `waitForLightning(page)` | Waits until no spinner or busy marker shows, twice in a row |
| `expectToast(page, text?)` | Waits for a toast (with the text, if given) and returns its text |
| `dismissToasts(page)` | Closes every visible toast |
| `modal(page)` | The open dialog, to scope a form's locators |
| `selectPicklist(scope, label, option)` | Opens a picklist and picks an option |
| `fillLookup(scope, label, search, option?)` | Types in a lookup and clicks the matching result |
| `openRecord(page, object, id, mode?)` | Opens a record page by URL |
| `openObject(page, object, view?)` | Opens a list view by URL |
| `relatedList(page, title)` | A related list card, by its title |
| `fieldValue(page, label)` | The value next to a field label on a record page |
| `waitForFlowScreen(page)` | Waits for a Flow screen |
| `flowNavigate(page, "Next")` | Clicks Next, Previous, Finish or Pause, and waits |

## Your own helpers come first

The pack reads your framework profile. For each job, generated code calls the method your page objects already have, and base classes are checked first. For example, `BasePage.waitForSpinner` or `BaseFlowScreen.clickNext`.

`lightning.ts` is added to your repo only when some job has no method of yours. It goes into `support/` next to your pages folder, for example `src/support/lightning.ts`, and it is shown in the same diff review as the generated tests. From then on the file is yours to edit.

## Changing the helpers

Edit `packs/salesforce/lightning.ts`, then run `npm run packs`. The workflow layer never reads files, so the helper ships as text in `src/workflows/packs/lightning-source.ts`, and a test checks that the two match.

When a Playwright install is found, the tests also type-check the file against Playwright's own types and run every helper in Chromium. They run against a stand-in page with shadow roots, a spinner that comes back after it first goes away, async lookup results and toasts.
