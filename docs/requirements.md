# Requirements analysis

The `requirements` workflow, and the first step of `test-cases` when it starts from a `key` or `jql`, reads the Jira issue with its children, linked issues and Confluence pages, masks it, and asks the model for a quality score, the gaps, open questions, and, for an issue with no acceptance criteria, proposed criteria. The result is `requirements@1` (`requirements.json` and `requirements.md` in the run folder).

## Criteria for an issue that has none

When an issue has no acceptance criteria, the criteria are inferred. Two sources are allowed:

- **the issue itself**: its summary, description and linked pages. These show as `(inferred)`.
- **related feature files of the repo**: at most three `.feature` files, found with no model. A file that names the issue key (in its path or its text) comes first, then the files whose path, feature, rule and scenario titles share at least two words with the issue's summary. A file tagged with the issue's own case ids (`@TC-ABC-12-001`) is left out: that is what Agent-QA wrote from earlier guesses, and offering it again would make the guesses look like evidence. Paths are masked a part at a time with the run's vault, their extension kept (`tests/<PATH_1>.feature` for a file named after a person). The files are read from the reviewed profile's folder (`agent-qa.profile.json`), or the project folder without one, skipping `node_modules`, `.features-gen` and other build folders, and masked like Jira text, then cut to 6,000 characters at a line end. The search lists up to 50,000 files. Criteria taken from them show as `(inferred from repo: <path>)`, and `from` holds the path in `requirements@1`.

A related feature often describes a neighbouring process (for example "refund above store limit" for a "refund below store limit" story). The model is told to ask in the open questions where they may differ instead of copying limits, approvers or messages. Check criteria inferred from the repo with the story's author before trusting the cases written from them: `test-cases` tells the model they aren't written in the issue.

The context is the same in an IDE and in CI. The host model (Copilot's, for example) is told to use only that context and not to read the repository itself, so two runs on the same story and repo see the same files.

## Pull requests as context

With `withPullRequests: true` (CLI `--with-pull-requests`), on `requirements`, `test-cases` or `document` from a `key` or `jql`, the analysis also gets the pull requests that name each issue on the git host of the `git` section (GitHub, Azure DevOps (untested: [ci.md](ci.md#azure-pipelines)) or GitLab 15.7 or later, where they are merge requests):

```bash
agent-qa run requirements --key ABC-123 --with-pull-requests
agent-qa run test-cases --input '{"key":"ABC-123","withPullRequests":true}'
```

- **Found by key, with no model.** A pull request counts when its title, description, source branch or a commit message names the key as a whole word (`ABC-1`, not `ABC-12`). At most 5 per issue, newest first, and at most 25 issues per run; the others are listed as not searched. A pull request whose text doesn't name the key isn't found: `requirements.md` lists the ones used, so you see what is missing.
- **Masked and capped.** Titles, branch names, file paths and diffs are masked like Jira text, with the run's vault. Each issue gets at most 200 KB of diff in all, and the run at most 600 KB over every issue; past either cap a file keeps only its path and status. The pull requests are kept in the run as `pull-requests@1` (read again if the `git` settings change) (`pull-requests.json` and `.md`), with what masking replaced in them (counts only).
- **Code notes.** The model may add `codeNotes` to an issue, each naming the changed file it comes from (checked: the path must be one of that issue's pull request files). They show in `requirements.md` under "From the code". Code shows what was built, not what was asked, so the model is told to ask open questions where they differ rather than turn code into criteria.
- **The token** is `git.token`; read access is enough, and a token the host refuses stops the analysis with what it needs: on GitHub, Contents and Pull requests (read); on Azure DevOps, Code (read).

`withPullRequests` needs a `git` section, and a new analysis: it is refused with `requirementsRun`, `testCasesRun` or `casesRun`. In `test-cases`, an earlier analysis is reused only if it was given the same pull requests (their hashes are kept in `requirements@1`).

## Reusing an earlier analysis in test-cases

When `test-cases` starts from a `key` that an earlier run already analyzed (a `requirements` run, or a `test-cases` run that analyzed it), its first step is `reuse`. Agent-QA reads Jira again (no model) and compares what the analysis would be given with what the earlier run was given: the same issues at the same Jira version (each issue's `sourceHash`: key, last update, linked page versions) and the same related feature files (path and content hash, kept in `requirements@1` as `related`).

- **Unchanged:** you're asked whether to reuse the newest such run's analysis (its criteria, scores and open questions) or analyze again. A yes skips the analysis: the cases are written from that run's `requirements@1`, with its vault, like `{"requirementsRun": "<run id>"}`. Agent-QA names the run, never the model. In the CLI, `--yes` or `--accept reuse` reuses it and `--decline reuse` analyzes again. In CI, a run without one of these stops at this step (exit 3, waiting) when the runs folder holds an earlier analysis of the key, for example a cached `.agent-qa/runs`.
- **Changed:** the step says no earlier analysis can be reused and the host submits no without asking. A yes changes nothing: the match is checked again when the answer arrives.

The match covers the input only: an analysis made by an older Agent-QA version (another prompt) with the same input is offered too.

Not offered for a JQL filter (the stored filter is a vault token, different in each run), or when the earlier run's vault has expired (30 days). Runs analyzed before this change have no `related` hashes, so they are only reused when no related feature file is found now.

## Only what changed

With `changedOnly: true` (CLI `--changed-only`), on `test-cases` from a `key` or a `jql`, cases are written only for the issues that are new or changed since an earlier run wrote theirs. The first step is `changes`: Agent-QA reads Jira (no model) and, for each issue, finds the newest earlier `test-cases` run with cases for it. An issue is unchanged when the analysis of that run was given the same input: the same `sourceHash`, related feature files and pull requests. Unchanged issues are left out of the analysis and the cases, and the step names the run that has their cases; the others go on as usual, to the review and the push.

- **Nothing changed:** the step says so and the run ends, with no model call.
- **Some changed:** you're asked whether to go on with them. In the CLI, `--yes` or `--accept changes` goes on, `--decline changes` stops. In CI, a run without one of these stops at this step (exit 3, waiting).

This works for a JQL filter too, since it compares issues, not the filter. Agent-QA names the issues, never the model, and checks them again when the answer arrives. The reuse step isn't offered with `changedOnly`: the analysis covers the changed issues only.

```bash
agent-qa run test-cases --jql "project = ABC AND fixVersion = 2.4" --changed-only --yes --accept push
```
