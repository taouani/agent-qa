---
"sf-agent-qa": minor
---

`agent-qa harness` prints the runnable rate next to the kept rate, read from the project's own runs (`scripts-run@1`). It is the share of test cases whose generated tests passed in the last run and again in the stability runs. A case stopped on a real defect or on the environment is counted apart and left out of the rate. Runs where nobody agreed to run the tests don't count. `--json` adds `runnableRate`.
