# Automation Conventions

Rules for commands that read, generate, or modify real Playwright test code.
Framework-specific details are NOT in this file — they live in `agent-qa/framework-profile.md`.

## Locator Priority

Prefer locators in this order. Drop to the next rank only when the rank above is unavailable
or not unique on the page.

| Rank | Locator | Use when |
|------|---------|----------|
| 1 | `getByRole(role, { name })` | The element has an accessible role and name |
| 2 | `getByLabel(text)` | Form controls with an associated label |
| 3 | `getByPlaceholder(text)` | Inputs with no label but a stable placeholder |
| 4 | `getByText(text, { exact })` | Static, non-localised content |
| 5 | `getByTestId(id)` | The application exposes stable test IDs |
| 6 | CSS or XPath | Last resort. Must carry a comment explaining why ranks 1-5 failed |

When `agent-qa/framework-profile.md` records a different observed priority for the host
repository, the profile wins — it reflects what the repository actually does.

Never build a locator from: generated class names, nth-child positions that depend on data
volume, or text that varies by environment or user.

## Allowed Fixes

A command may apply these without further justification, subject to the approval gate:

| Fix | Condition |
|-----|-----------|
| Replace a locator with a higher-ranked one | The replacement is sourced from a captured snapshot, not guessed |
| Convert a manual assertion to a web-first assertion | e.g. `expect(locator).toBeVisible()` instead of reading state then asserting |
| Add an explicit wait for a specific condition | The condition is observable — a locator state, a response, a URL |
| Reuse an existing fixture, page object, or helper | The existing unit already covers the need |
| Correct a typo in test data or an expected string | The correct value is confirmed by the requirement or a snapshot |

## Never-Apply Fixes

These mask defects rather than fix them. A command must refuse, report, and stop:

| Forbidden | Why |
|-----------|-----|
| `page.waitForTimeout()` or any fixed sleep | Hides a real synchronization problem and adds flake |
| Increasing retry counts or timeouts to make a test pass | Converts a reproducible failure into an intermittent one |
| `test.skip()`, `test.fixme()`, or commenting out an assertion | Removes the signal that found the bug |
| Converting a hard assertion to a soft assertion to get green | Same as above |
| Loosening an expected value to match actual output | The test then asserts nothing |
| Editing `playwright.config.ts` to change global timeouts or retries | Repository-wide impact from a single-test symptom. Report it instead |

## Failure Classification

Classify every failure before proposing any change:

| Class | Evidence | Action |
|-------|----------|--------|
| Real defect | The application behaves incorrectly; the assertion is right | STOP. Report the defect. Do not modify the test |
| Selector | Element exists but the locator no longer matches | Re-locate from a snapshot; apply an allowed fix |
| Synchronization | Element appears after the assertion ran | Add an explicit wait for the observable condition |
| Test data | Precondition data missing, stale, or already consumed | Fix data setup or generation, not the assertion |
| Environment | Wrong base URL, expired auth, service unavailable | Report. Never work around it in test code |
| Flake | Passes and fails without code or data change | Identify the race before changing anything. Never mask it |

When evidence is insufficient to classify, STOP and report what is missing. Do not guess.

## Severity Levels

Used by `review-automation-code` and `audit-framework` findings:

| Severity | Meaning |
|----------|---------|
| Critical | Test can produce a false pass, or a secret or credential is exposed |
| High | Test is unreliable by construction, or a real defect is masked |
| Medium | Maintainability or reuse problem that will cause future breakage |
| Low | Convention or naming deviation with no functional impact |

## Stop Conditions

Every command in this family stops and reports, rather than continuing, when:

- The failure is classified as a real defect
- A required snapshot or profile field is missing
- A proposed change would touch a deny-listed path
- The same fix has been attempted twice without changing the outcome
- The engineer has not approved a change that writes outside `agent-qa/`
