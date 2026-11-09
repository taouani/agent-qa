---
"sf-agent-qa": minor
---

`agent-qa report --html [file]` writes a dashboard to `.agent-qa/report.html`: one self-contained HTML file with no script and no network call. It shows the kept and runnable rates against their targets week by week, the last `agent-qa harness` run, masking totals by detector, and the latest runs with their cost. `agent-qa harness` now also saves its report to `.agent-qa/harness/last-report.json` for it.
