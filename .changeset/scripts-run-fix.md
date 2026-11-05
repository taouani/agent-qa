---
"sf-agent-qa": minor
---

`scripts` now runs the tests it wrote. On your own yes (asked once), Agent-QA runs them with your repo's Playwright: `npx bddgen` first for playwright-bdd, then `npx playwright test` on the generated files only, with the JSON reporter, no retries and one worker. For each failure the model says what it is: a selector, a wait, test data, a flake, the environment, or a real defect. It may fix only selectors, waits and test data, and only in the files Agent-QA wrote and you haven't edited since. It never changes the scenarios or a test's title, and never removes, softens or skips a check. A real defect or a broken environment stops the loop and is reported. Passing tests run again (`stabilityRuns`, 3 by default) to show they are stable. Everything is recorded in `scripts-run@1`. New inputs: `fixRounds` (3 by default, at most 5) and `stabilityRuns`.
