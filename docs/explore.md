# Exploring test cases in a browser

The `explore` workflow walks reviewed test cases (`test-cases@1`) in a real browser on your Salesforce sandbox. The model picks one action at a time from a masked view of the page, and Agent-QA performs it. What it finds is saved as `exploration@1`: the elements each step used, the waits it needed, and what the app did that the case doesn't describe. Script generation (coming next) builds from this.

## Before you start

- A `salesforce` section in `agent-qa.yaml` with the role you explore as. See [salesforce.md](salesforce.md).
- A reviewed framework profile (`agent-qa.profile.json`, see [profile.md](profile.md)). Agent-QA uses the Playwright installed in that folder (1.49 or later), so run `npm install` and `npx playwright install chromium` there first.
- A test-cases run whose cases you reviewed.

**Sandboxes only.** Exploring performs the test steps, which create and change records. Agent-QA refuses a production org. Without a `salesforce` section, it only drives an app on this machine (`playwright.baseUrl` on localhost).

## Run it

In the IDE, start the `explore` workflow. On the command line:

```bash
agent-qa run explore --input '{"testCasesRun":"<run id>","role":"StoreManager-FRA","start":"/lightning/n/Approval_App"}' --accept approve
```

Optional inputs: `cases` (only these TC ids), `headed: true` (show the window), `maxActions` (per case, default 40).

Only you can approve a run. The model's yes is refused, and so is `--yes`.

## What happens

1. Each case starts in a fresh browser context, signed in with a new single-use frontdoor URL, on the start page.
2. For each step, Agent-QA:
   - shows the model the case and what has been done so far;
   - shows the page's accessibility tree, masked;
   - takes back one action (click, fill, select, check, press, go to a path, or verify an expected result), marks a step unverifiable, or ends the case.
3. Elements are named by role and name, as generated code will name them. When the page shows a token such as `<VALUE_3>`, the model uses the token, and Agent-QA puts the real value in the browser.
4. A case ends when the model finishes it, after `maxActions` actions, or after three unverifiable steps in a row. It is recorded as `complete` when every step was verified or marked unverifiable, and `partial` otherwise. However the run ends (done, failed after rejected answers, or cancelled), its browser closes.

## What the model sees

The page is masked before the model sees it:

- Values typed or picked in fields become tokens.
- Everything in table rows becomes a token (header rows are kept).
- A record page's name, and the record parts of the page title, become tokens.
- Links keep their path only.
- Any value Agent-QA already knows, such as one it just typed, is put back as its token wherever the page shows it again, for example in a toast.
- Other text goes through the masking detectors.

Real values reach only the browser. They never go into the run folder, a log or a model.

**Known gap.** Field values on a record page that sit outside a table or a field are only as safe as the detectors. Check the masked page on your own org before relying on it.

## Clicks are never repeated

If a click reaches the element but the page doesn't change within about a second, Agent-QA reports `no-effect` and does not click again, since that could save twice. Agent-QA tries another way (pressing Enter, or a click sent by script) only when the click never reached the element. When Lightning swallows a click that did arrive, the model can send `press Enter` itself.

## After a restart

The browser's state follows the run's saved actions. If the MCP server or CLI restarts mid-case, the case starts again and its actions are replayed on the org. Records it created may then exist twice. The page tells the model so, and a case whose final actions were replayed carries `replayed: true` in exploration@1.
