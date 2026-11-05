---
"sf-agent-qa": minor
---

`agent-qa harness` prints the runnable rate next to the kept rate. It is read from the project's own runs (`scripts-run@1`) and judges each test case once, by its latest finished run.

- **Runnable**: a case whose tests passed, then passed again in the stability runs.
- **Left out of the rate, but shown**: a case that passed once but was never run again, and a case stopped on a real defect or on the environment.
- **Not counted**: runs whose tests never ran, and runs still in their fix loop.

`--json` adds `runnableRate`.
