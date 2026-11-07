---
"sf-agent-qa": minor
---

`run-tests` can record its results in Xray as a new Test Execution (S3-9). If Xray can't be read, nothing is recorded and the run still finishes. A retry after a stop never records the same run twice. Each test is matched to its case's Xray test through the `agent-qa:TC-ID` label. A skipped test, or one with no case in Xray, isn't recorded. Before asking, it reads the newest Agent-QA Test Execution of the same selection back from Xray and says what changed: now failing, now passing, still failing, new, and not run this time. This works in CI too. The result is `xray-execution@1`. Recording takes the person's yes (`--accept xray` in CI) and goes through the `xray` write policy.
