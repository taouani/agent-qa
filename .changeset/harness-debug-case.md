---
"sf-agent-qa": patch
---

The harness's browser run now includes a `debug` case (S3-10). A hand-written test and page object, not generated ones, open a seeded person's request on the stand-in app and fail on its seeded bug. The run must report a defect, refuse the fix that expects what the app shows, leave both files unchanged, and keep the person's names, the error and the page snapshot masked. The harness never approves a change, so this case also runs with a real model.
