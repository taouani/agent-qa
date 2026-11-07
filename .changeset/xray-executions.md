---
"sf-agent-qa": minor
---

`run-tests` can record its results in Xray as a new Test Execution (S3-9). If Jira can't be read, nothing is recorded and the run still finishes. A run is never sent twice: if the import fails or is cut off, the step ends as `uncertain` and says which label to look for in Xray. Each test is matched to its case's Xray test through the `agent-qa:TC-ID` label. A skipped test, or one with no case in Xray, isn't recorded. Before asking, it compares with the last recorded run of the same selection in the local run folder (`.agent-qa/runs`; keep it between CI jobs) and says what changed: now failing, now passing, still failing, new, and not run this time. The result is `xray-execution@1`. Recording takes the person's yes (`--accept xray` in CI) and goes through the `xray` write policy.
