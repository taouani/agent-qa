# Salesforce pack

The Salesforce pack is what script generation knows about Lightning. It is data, not prompt text spread around the code:

- **Rules** (`LIGHTNING_RULES` in `src/workflows/packs/salesforce.ts`) cover shadow DOM, generated ids, spinners, toasts, lookups, picklists, required labels, records opened by URL, related lists, modals, hidden earlier pages, Screen Flows, exact names and record data.
- **Locator order.** The forms your repo already uses come first, then the rest of role, label, text, test id, placeholder, title and alt text. CSS comes last. XPath is never used, because it can't reach into shadow roots.
- **Helpers** live in a real file, [`packs/salesforce/lightning.ts`](../packs/salesforce/lightning.ts), for Playwright 1.49 or later. It needs no other dependency and works in CommonJS and ESM projects.

| Helper | What it does |
|---|---|
| `waitForLightning(page)` | Waits until no spinner shows, twice in a row (a progress bar showing a value doesn't count) |
| `expectToast(page, text?)` | Waits for a toast (with the text, if given) and returns its message |
| `dismissToasts(page)` | Closes every visible toast |
| `modal(page)` | The open modal (not a popover), to scope a form's locators |
| `selectPicklist(scope, label, option)` | Opens a picklist and picks an option from its own list |
| `fillLookup(scope, label, search, option?)` | Types in a lookup and clicks the matching record (never "Show All Results" or "New") |
| `openRecord(page, object, id, mode?)` | Opens a record page by URL |
| `openObject(page, object, view?, { filterName? })` | Opens a list view, home or new-record page by URL |
| `relatedList(page, title)` | A related list card, by its title |
| `fieldValue(page, label)` | The value next to a field label on a record page (visible items only) |
| `waitForFlowScreen(page)` | Waits for a Flow screen |
| `flowNavigate(page, "Next")` | Clicks Next, Previous, Finish or Pause, and waits |

## Your own helpers come first

The pack reads your framework profile. For each job, generated code calls the method your page objects already have, for example `waitForSpinner` from `BasePage`, or `clickNext`, `clickPrevious` and `clickFinish` from `BaseFlowScreen`.

- **Matching:** methods are matched by name, best pattern first, and base classes before other pages. `waitForSpinner` wins over `waitForPageLoad`, and a method that reads without waiting, such as `getToastMessage`, is never used as a wait.
- **Locator helpers:** `modal`, `relatedList` and `fieldValue` return a Locator. Your methods' return types aren't known, so these always come from the pack.

`lightning.ts` is added to your repo only when some job has no method of yours. It goes into `support/` next to your pages folder, for example `src/support/lightning.ts`, and it is shown in the same diff review as the generated tests. From then on the file is yours to edit.

## Changing the helpers

Edit `packs/salesforce/lightning.ts`, then run `npm run packs`. The workflow layer never reads files, so the helper ships as text in `src/workflows/packs/lightning-source.ts`, and a test checks that the two match.

The tests type-check the file against Playwright 1.49's types (a dev dependency, used for its types only) as CommonJS ES2020, the way the reference repo builds it. `npm run typecheck` checks it under this repo's own settings too.

When a Playwright install with a browser is found, the tests also run every helper in Chromium. That install is `AGENT_QA_PLAYWRIGHT_DIR`, or `/opt/node-tools` in Claude's cloud environment. The stand-in page is built with Lightning's traps:
- shadow roots, and a spinner that comes back after it first goes away;
- a permanent progress bar;
- a Path list ahead of a required picklist;
- lookup results outside the field, with "Show All Results";
- an "Account Type" picklist ahead of an "Account" lookup;
- a hidden earlier record page;
- nested related-list cards;
- a popover after the modal;
- a field error, and toasts that fade out.
