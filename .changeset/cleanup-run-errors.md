---
"sf-agent-qa": patch
---

`agent-qa run --resume` with an unknown run id says the run isn't in this project's run folder. Run store errors carry a code (`NOT_FOUND`, `EXISTS`, `UNSAFE_ID`, `INVALID`). The harness leak gate also finds personal data in base64 that starts mid-text.
