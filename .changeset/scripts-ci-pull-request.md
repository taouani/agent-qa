---
"sf-agent-qa": minor
---

In CI, `agent-qa run scripts --ci --accept review,run --yes` writes the generated tests into the job's own checkout, runs and fixes them there, then opens one pull request on GitHub with the files Agent-QA wrote and tested and the run's report as its description (`scripts-pr@1`). It is a draft unless every test passed and stayed stable. The branch is `agent-qa/<run id>`, the base is the branch CI checked out, and the base branch is never written to. Configure `git: { platform: github, repo: owner/name, token: ${env:GITHUB_TOKEN} }`.
