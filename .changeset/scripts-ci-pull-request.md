---
"sf-agent-qa": minor
---

In CI, `agent-qa run scripts --ci --accept review,run --yes` writes the generated tests into the job's own checkout, runs and fixes them there, then opens one pull request on GitHub with the files Agent-QA wrote and the run's report as its description (`scripts-pr@1`). It is a draft unless every test passed and stayed stable; tests that weren't run say so at the top. The branch is `agent-qa/<run id>`. The base is the branch the job's code came from (a pull request's own branch, else the pushed branch, else the default branch), and it is never written to. Only new files are added. Configure `git: { platform: github, repo: owner/name, token: ${env:GITHUB_TOKEN} }` and give the job `permissions: contents: write, pull-requests: write`. A pull request opened with `GITHUB_TOKEN` doesn't start the repo's other workflows. A run stopped halfway can go on only in the same job, since a new job's checkout no longer has the files.
