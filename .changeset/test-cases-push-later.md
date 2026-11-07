---
"sf-agent-qa": minor
---

`test-cases` takes `casesRun`: a new run that goes straight to the Xray push of an earlier run's reviewed cases, for a run whose push was declined. No Jira read, no model, the earlier run's vault; the earlier run is left as it finished. CLI: `--push-from <run id>`.
