# The quality harness

`agent-qa harness` runs the real workflows (requirements and test-cases) on synthetic Jira tickets that carry planted personal data, called seeds. It fails if any seed reaches a model, or reaches the text of a confirm step that an IDE's model would be shown.

```bash
agent-qa harness                      # shipped cases, offline fixture model: no API key, no cost
agent-qa harness --model anthropic:claude-sonnet-5-5   # the same with a real model from models in agent-qa.yaml
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

The stand-in Jira is simpler than the real one in two ways: field ids are made up, so `masking.fields` rules written with real field ids (`customfield_10042`) don't apply (rules by field name do), and the read limits in `atlassian.jira` (depth, issue count) are ignored.

Your own cases go in a fixtures folder named in `agent-qa.yaml` (`harness.sources`), with seeds in `harness.seededPersonalData`. A ticket has `key`, `summary` and `description`, and optionally `type`, `status`, `priority`, `acceptanceCriteria`, `fields`, `people`, `mentions`, `labels`, `components`, `fixVersions`, `pages`, `parent` and `links`. Every seed a case names must appear whole in its tickets. Jira sources are skipped for now.

## Kept rate

The report also gives the kept rate: of the test cases the model wrote, the share people kept as written in review. It comes from the `test-cases@1` artifact of every run in `.agent-qa/runs/` (or `AGENT_QA_RUNS_DIR`). Runs reviewed with `--yes` are left out, because nobody looked at those cases, and harness runs never count.

## In CI

The CI workflow runs `agent-qa harness` with the offline model on every pull request and every push to master, as the leak gate.
