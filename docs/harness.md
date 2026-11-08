# The quality harness

`agent-qa harness` runs the real workflows (requirements and test-cases) on synthetic Jira tickets that carry planted personal data, called seeds. It fails if any seed reaches a model, or reaches the text of a confirm step that an IDE's model would be shown.

```bash
agent-qa harness                      # shipped cases, offline fixture model: no API key, no cost
agent-qa harness --model anthropic:claude-sonnet-5-5   # the same with a real model from models in agent-qa.yaml
agent-qa harness --headless claude-code                # or copilot: the CLI's own sign-in, no API key (docs/ci.md)
agent-qa harness --json               # the full report
```

Exit codes: 0 every case passed, 1 a case leaked or errored, 2 the harness couldn't run (bad config, bad fixtures, nothing to test, or a `--model` it can't use, such as one with no API key).

## What it checks

- Each case's tickets stand in for Jira and go through the masked data service, exactly as a real read would.
- Every model call is scanned before it is sent. A call that carries a seed is refused and fails the case, so the value never reaches the model.
- The text of every confirm step is scanned too, because an IDE's model is shown it, and so is every file in the run folder, which it may be told to read.
- The review edits one case to name a seeded value, as a person might, so the masking of review edits is checked. The push step is asked with a stand-in Xray and always declined: nothing is ever pushed. Harness reviews count as unattended.
- Runs are kept in `.agent-qa/harness/runs/` to inspect. They hold masked text only: the token vault lives in memory and goes when the case ends.

The offline fixture model answers from the step's own masked context and copies that text into its answers. It proves the pipeline masks what it sends, not that the answers are good. To judge quality, run with `--model`; that sends the masked prompts to the provider and costs money.

## Shipped cases

Three cases put seeds in summary, description, @-mentions, the acceptance-criteria field, criteria inside a description, a custom text field, people, labels, components, fix versions, a linked Confluence page (title and body), a child issue, a linked issue and a JQL filter. The seed kinds are name, email, phone, IBAN, card, national id and IP. There is no address seed, because addresses have no detector yet.

A fourth case, **approval-request-review**, runs the `review` workflow, with no browser, on a hand-written test and page object that name a seeded person. They have two known flaws: a fixed wait, which the code scan must report, and a check inside the page object, which the model must report. The harness never says yes to a fix, so the case also checks that the files stay as they were.

A fifth case, **approval-request-audit**, runs the `audit` workflow on the same suite, also with no browser. The code scan must count the fixed wait at its line. The model must report the check inside the page object, with evidence in that file. An audit is read-only, so no file may change.

Two cases run the `document` workflow. Each first runs `test-cases` on its issues, then writes the document from the reviewed cases. **escalation-test-plan** writes a test plan from a key. **refund-traceability-jql** writes a traceability report over a JQL filter that names a person. In both, the harness's review types every seed into the document's summary, and the gate checks that the kept document holds only tokens.

The stand-in Jira is simpler than the real one in two ways: field ids are made up, so `masking.fields` rules written with real field ids (`customfield_10042`) don't apply (rules by field name do), and the read limits in `atlassian.jira` (depth, issue count) are ignored.

Your own cases go in a fixtures folder named in `agent-qa.yaml` (`harness.sources`), with seeds in `harness.seededPersonalData`. A ticket has `key`, `summary` and `description`, and optionally `type`, `status`, `priority`, `acceptanceCriteria`, `fields`, `people`, `mentions`, `labels`, `components`, `fixVersions`, `pages`, `parent` and `links`. Every seed a case names must appear whole in its tickets. Jira sources are skipped for now.

## Browser cases

Three more cases run in a real browser, on a stand-in Lightning app the harness serves on `127.0.0.1` (list view, record pages in shadow DOM, spinners and toasts). Its records show the case's seeds. They run only with `--browser [folder]`, where the folder has Playwright and its Chromium installed (default: the project).

- **approval-request-explore** explores a request with the `explore` workflow: every page snapshot, action result and `exploration@1` is scanned.
- **approval-request-defect** checks how a real product bug is handled. The app has a seeded bug: Submit for Approval says the request was submitted, but its status turns to Rejected. The harness starts a plain Playwright repo for the app in a temp folder (removed afterwards; the folder's `node_modules`, which needs `@playwright/test`, is linked in), then runs the test-cases and scripts workflows. The generated test fails on the bug. The fixture model first tries to make it pass by changing what the test expects, which the fix checks must refuse, then reports a defect. The case passes only if the run ends as `defect` with the test unchanged on disk, and no seed reaches the model through the test's error or page snapshot.
- **approval-request-debug** runs the `debug` workflow on the same bug, but on a hand-written test and page object instead of a generated test. The test opens a seeded person's request by name, so the masking of your own files is checked too. The fixture model tries the same tempting fix, which must be refused, then reports a defect. The case passes only if the run ends as `defect`, both files are unchanged on disk, and no seed reaches the model. The harness never says yes to a change, so this case can also run with a real model.

```bash
agent-qa harness --browser            # the browser cases too
```

## Kept rate

The report also gives the kept rate: of the test cases the model wrote, the share people kept as written in review. It comes from the `test-cases@1` artifact of every run in `.agent-qa/runs/` (or `AGENT_QA_RUNS_DIR`). Runs reviewed with `--yes` are left out, because nobody looked at those cases, and harness runs never count.

## In CI

The CI workflow runs `agent-qa harness` with the offline model on every pull request and every push to master, as the leak gate.
