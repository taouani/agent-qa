# How Agent-QA handles your data

This page is for whoever approves Agent-QA's use: security, privacy or the team lead. It says what leaves the machine, what protects it, and where the protection stops. To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## What leaves the machine

Agent-QA runs on your laptop or a CI runner. It has no server of its own and sends no telemetry.

| To | What | When |
|---|---|---|
| Your Jira, Confluence and Xray Cloud | API reads; test cases, executions and pages it writes | Every workflow that reads requirements; a write only as below |
| Your git host (GitHub, Azure DevOps, GitLab) | Pull request reads; a pull request it opens | With the `git` section, `--with-pull-requests`, or a CI run that leaves code as a pull request |
| The model | **Masked** text only: prompts and the files a step shows | Every model step: the API model from the CLI, or your IDE's model through MCP |
| Your Salesforce sandbox | A browser session with the users you configure | `explore`, and the tests Agent-QA runs in your repo |
| npm | The package download | Install, or each `npx` start |

The model is the one you choose. From the CLI, that is a direct API call with your key (Anthropic by default), or a call through OpenRouter or a LiteLLM gateway ([models.md](models.md)). In an IDE, it is the IDE's own model (Copilot, Claude Code, Cursor), under your IDE's agreement with its provider.

## Masking

Before any text reaches a model, Agent-QA masks personal data and puts tokens in its place, such as `<PERSON_1>` or `<EMAIL_2>`. This covers Jira and Confluence content, pull request text, browser pages in `explore`, and the test files of your repo.

- **What is found:**
  - emails, phone numbers, IBANs, card numbers, national IDs and IP addresses, with checksums where the format has one;
  - names of people from Jira's people fields, and from name lists in nine languages;
  - fields you list in `masking.fields`, which are replaced whole.

  `masking.detectors` chooses which detectors run.
- **Repo paths are masked too.** A file named after a person, such as `tests/users/marie-curie.spec.ts`, is shown as `tests/users/<PATH_…_1>.spec.ts`. Path tokens are a keyed hash of the name. The key comes from the vault key, so the same file has the same token in every run on that machine. One consequence: while the vault key exists, someone who has both the key and a list of candidate names can test which name a path token stands for. Run vaults expire, but this key doesn't.
- **The vault.**
  - Each run's tokens map back to the real values in that run's vault: a file under `.agent-qa/vault/`.
  - It is encrypted with AES-256-GCM and bound to the run's id.
  - It expires 30 days after its first save.
  - The vault never leaves the machine, and `.agent-qa/` is kept out of git (`agent-qa init` adds it to `.gitignore`, and `agent-qa doctor` checks it).
- **The vault key** is in your OS keychain: macOS Keychain, Windows Credential Manager, or Secret Service on Linux. Where there is no keychain, such as a CI runner, it comes from `AGENT_QA_VAULT_KEY`, which you keep as a CI secret. Losing the key makes old vaults unreadable, but nothing else breaks.
- **Real values come back only on a write you approved,** and only with `masking.restoreOnWrite: true`. With it off (the default), Xray and Confluence receive the tokens as they are.
- **The masking report.** Each run writes `masking-report.json`: how many values each detector replaced, by field. It holds counts, never the values.
- **Presidio.** `masking.presidio` is accepted in the config and checked by `doctor`, but nothing sends text to it yet.

**Where masking stops.** Detectors find what they know. A personal detail written in free text that no pattern or name list matches is sent as it is. Examples are a nickname, an unusual name in a language outside the nine, or "the manager of the Lyon store". Treat masking as a strong reduction, not a guarantee.

Two things check it:

- The [quality harness](harness.md) runs the real workflows on seeded data, and fails if any seeded value reaches a model.
- The masking report lets you check a real run.

## Writes

Every write outside the run folder goes through one policy layer. `policy.writes` in `agent-qa.yaml` sets each target to `allow`, `ask` or `deny`.

| Target | Default | What it covers |
|---|---|---|
| `xray` | ask | Test cases, Test Executions |
| `confluence` | ask | Publishing a document |
| `testCode` | ask | Writing or deleting files in your repo |
| `commands` | ask | Running the commands your framework profile lists (tests, type check) |
| `jira` | deny | Reserved |

- **`ask` means the person.** In an IDE that can ask directly, Agent-QA shows its own prompt, which starts on "No". In a terminal, it asks there. The model can't answer for you: a model's "yes" is never a yes.
- **In CI, nobody is asked.** `ask` is denied, except for `commands`. Test code leaves only as a pull request, never as a push to a branch.
- **Only the reviewed profile's commands run.** Agent-QA runs commands in your repo only from `agent-qa.profile.json`, which a person reviewed and saved. Nothing a model or a ticket says can add one.
- **Changes are checked before they're written.** Every edit to a test file is shown as a diff first. Agent-QA refuses a write when the file changed since it read it, and it never writes `package.json`, lockfiles, `tsconfig`, `.env` or its own settings.
- **The audit log.** Each write request and its outcome (approved, done, declined, denied, failed) goes to `.agent-qa/audit.jsonl`, with a summary and never the data written. A write never runs if its entry can't be stored.

## Secrets

- `agent-qa.yaml` holds only references: `${env:NAME}` or `${keychain:NAME}`. Loading the config fails if a value looks like a literal token or password.
- Secrets are read when they're used. They are kept out of artifacts, logs, error messages and model prompts.
- `doctor` shows which references resolve, never their values. It shows paths relative to the project, so home folders and user names stay out of CI logs.

## What a model can and can't do

Jira tickets, Confluence pages, pull requests and web pages are written by other people. A model that reads them can be steered by what they say (prompt injection). Agent-QA is built so that this changes only the model's answer:

- **Every answer is checked against a schema** before the run goes on. An answer that doesn't fit is refused.
- **Agent-QA gives the model no tools.** From the CLI, the API model and headless agent CLIs only answer the step they were given: headless CLIs run with every agent tool off.
- **Every write and command Agent-QA makes goes through the policy layer above,** with your yes.

**In an IDE, the host's model also has the host's own tools.** Copilot agent mode, Claude Code and Cursor can read and edit files and run terminal commands on their own, under that host's approval settings. Agent-QA's masking and gates cover only what goes through Agent-QA. They don't stop the host's model from:

- opening a test file itself, unmasked;
- acting on what a ticket told it.

Keep your host's own confirmations on for file edits and commands. For the strictest setup, run workflows from the CLI.

What a steered model *can* do is write poor or misleading test cases or code. That is what the review steps are for: nothing is pushed or written until a person has seen it.

## Supply chain

- **Signed packages.** Releases are published from GitHub Actions with npm provenance. On npmjs.com, the package page links each version to the commit and workflow that built it.
- **A package that holds only what it should.** Before each release, CI checks the packed package against a file list and a size limit, and scans it for anything that looks like a private key or token (`npm run pack:check`). It also installs it fresh on Ubuntu and Windows.
- **Dependency audit.** CI runs `npm audit --omit=dev --audit-level=high` on every pull request: a high or critical advisory in a runtime dependency fails the build. Moderate and low advisories are reviewed here instead:

  | Advisory | In | Why it stays |
  |---|---|---|
  | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), minimatch denial of service (moderate) | `ts-morph` → `@ts-morph/common` | `ts-morph` runs on an in-memory file system over the files Agent-QA passes it, and never matches a glob, so the vulnerable code isn't reached. The fix needs a `ts-morph` release that moves to minimatch 11. |

  Advisories in development tools (the test runner, lint) don't reach users. They are fixed in the normal course of work.
