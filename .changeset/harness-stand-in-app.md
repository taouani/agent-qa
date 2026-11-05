---
"sf-agent-qa": minor
---

`agent-qa harness --browser` also explores a stand-in app in a real browser: a few Lightning-like pages served on 127.0.0.1, whose records show the case's seeded personal data in list cells, a record heading and title, detail fields and a toast. Each page snapshot the explorer's model sees, each action result and the exploration@1 record are scanned for the seeds, so CI checks the explorer's masking without Salesforce. It uses the Playwright and Chromium installed in the project (or the folder given). Without `--browser`, the browser cases are skipped with a note.
