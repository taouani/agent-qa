---
"sf-agent-qa": minor
---

`withPullRequests: true` (CLI `--with-pull-requests`) on `requirements`, `test-cases` and `document` gives the analysis the pull requests that name each issue key on the configured git host (GitHub or Azure DevOps): masked like Jira text, at most 5 per issue and 200 KB of diff per issue, kept in the run as `pull-requests@1`. The analysis may add code notes, each naming the changed file it comes from; they show in `requirements.md` under "From the code". See docs/requirements.md.
