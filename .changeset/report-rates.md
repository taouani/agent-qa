---
"sf-agent-qa": minor
---

`agent-qa report` shows the kept rate (test cases kept as written in review) and the runnable rate (generated tests that pass again and again) from the project's own runs, overall and week by week, against the 95% and 90% targets. `--weeks <n>` sets how many weeks it shows, and `--json` prints it all for a spreadsheet. As before, `--yes` reviews and harness runs never count. docs/rates.md says how to collect the rates over 4 to 6 sprints.
