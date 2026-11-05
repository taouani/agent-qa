---
"sf-agent-qa": patch
---

The harness's browser run now includes a seeded product bug (S2-10). A generated test for the stand-in app fails because the app rejects a request it says it submitted. The run must report a defect, refuse a fix that changes what the test expects, leave the test unchanged, and keep the test's error and page snapshot masked.
