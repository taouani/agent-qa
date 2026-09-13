# Phase 4: Apply Allowed Fixes

## Core Responsibilities

Apply a minimal, allowed fix behind the approval gate.

## Workflow Steps

### Step 1: Evaluate the Gate

A fix may be applied ONLY when ALL of the following hold:

1. `automation.allow_source_edits` is `true` in `agent-qa/config.yml`
2. The framework profile has `reviewed: true`
3. The target path resolves under `playwright_project_root`
4. The target path matches nothing on the deny-list: `.env*`, `**/.auth/*.json`, `node_modules/`,
   CI configuration, `playwright.config.ts`
5. The user approved this specific fix when asked in Step 3

If any condition fails, report which one, write the report with the proposed fix as a diff, and
stop. Do not apply a smaller version of the fix instead.

### Step 2: Select the Fix

| Class | Permitted fix |
|-------|---------------|
| Selector | Replace with a higher-ranked locator derived from a `ui-snapshots/` entry or a trace. If no snapshot covers the page, run `/agent-qa:explore-ui` for it rather than guessing |
| Synchronization | Add a wait for a specific observable condition — a locator state, a response, a URL |
| Test data | Correct the data setup or generation. Never weaken the assertion to match bad data |
| Flake | Remove the race. If the race cannot be identified, STOP and report |

### Step 3: Present and Ask

Show the exact diff and the reason. Ask for approval per fix. Never apply a fix the user did not
approve.

### Step 4: Forbidden Fixes

Never apply any of these, regardless of approval, and refuse if asked:

- `page.waitForTimeout()` or any fixed sleep
- Raising retries or timeouts to get a pass
- `test.skip()`, `test.fixme()`, or commenting out an assertion
- Converting a hard assertion to a soft one
- Loosening an expected value to match the actual output
- Editing `playwright.config.ts`

If the only way to make a test pass is on this list, the test is telling the truth about the
system. Report that instead.

### Step 5: Apply Minimally

Change one thing at a time. After each change, re-read the file to confirm the edit landed. If two
changes are needed, apply and verify them one after the other so the report can attribute the
outcome.

## Data Storage

- `fixes_applied`: list of {target, class, diff, approved_by_user}
- `fixes_refused`: list of {target, reason}

## Constraints

- Never write outside `playwright_project_root`
- Never apply an unapproved change
- Never apply anything under `## Never-Apply Fixes`
- Never commit
