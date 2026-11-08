---
"sf-agent-qa": patch
---

In the IDE, a step's context now comes as its own plain text after the step's JSON, so a host that saves a long result to a file no longer cuts it ("The context line is truncated"). The loop rules no longer tell the model to ask in chat when Agent-QA asks the user itself in an IDE prompt. The `done` step of `run-tests` and `debug` carries the run's result (counts, Xray recording, debug status) as its context.
