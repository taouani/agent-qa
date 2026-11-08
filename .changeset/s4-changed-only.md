---
"sf-agent-qa": minor
---

`test-cases` with `changedOnly: true` (CLI `--changed-only`) writes cases only for the issues of a key or JQL filter that are new or changed (in Jira, their related feature files or pull requests) since an earlier run wrote their cases. Its first step, `changes`, lists the issues left out with the run that has their cases; when nothing changed, the run ends with no model call.
