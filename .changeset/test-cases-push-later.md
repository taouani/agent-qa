---
"sf-agent-qa": minor
---

`test-cases` takes `casesRun`: a new run that goes straight to the Xray push of an earlier, finished run's reviewed cases, for a run whose push was declined. No Jira read, no model; the real values come from that run's requirements vault, and the earlier run is left as it finished. Reviewed cases are pushed once: a run still open at its push, or cases already pushed, are refused. CLI: `--push-from <run id>`.
