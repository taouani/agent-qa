# Release live check (S5-10)

10 Nov 2026 · @Tarek AOUANI

This is the last gate before 2.0.0 (decision 4a). It runs on the **published release candidate**, not on a clone. Most steps come from guides [11](11-live-check-guide-2026-11-05.md) and [13](13-live-check-guide-slice4-2026-11-08.md), which already passed. This round checks that they still pass from a fresh npm install.

Tick each line, and send me the error text and the run id of anything that fails. A run's id is its folder name under `.agent-qa\runs\`. Every fix goes into the next rc, and only the failed lines are run again.

Azure DevOps stays out of scope: 2.0.0 ships with it marked untested (your answer of 10 Nov).

## 0. Fresh install (10 min)

- [ ] In an empty folder: `npx -y sf-agent-qa@next --version` prints the rc's version (rc.4 or later; ask me which).
- [ ] In your approval-app repo: `npm install -D sf-agent-qa@next`, then `npx agent-qa --version` prints the same version. Every command below is `npx agent-qa …` from this repo, so it runs that version.
- [ ] Remove the `agent-qa` entries from `.vscode/mcp.json`, `.mcp.json` and `.cursor/mcp.json` (init keeps an existing one, which may run an older version). Then `npx agent-qa init --force`: it asks for the site and the Xray key, writes the three files again, and prints `agent-qa secret set` lines.
- [ ] Run each `secret set` line. Then run `npx agent-qa doctor`: no line fails.
- [ ] On the corporate network, check that `.vscode/mcp.json` starts `node --use-system-ca` on `node_modules/sf-agent-qa`, as in [getting-started.md](../getting-started.md#behind-a-company-network).

## 1. Copilot in VS Code (30 min)

- [ ] Start `agent-qa` from `.vscode/mcp.json`. `test-cases` on one Jira key reaches the review, and the push to Xray asks you first. Say yes once: the cases and the Test Execution dates show in Xray.
- [ ] Run `scripts` on the same key. Its diff review shows only new files, and the test run passes or reports clear failures.
- [ ] Run `debug` on a failing test of the suite. It names the page object or step, never `.features-gen`.
- [ ] Run `review` and `audit` on one feature folder. Each ends with a report and changes nothing.
- [ ] Close and reopen VS Code (not from a terminal). The server still finds the keychain secrets.

## 2. Claude Code and Cursor (20 min)

- [ ] `init --host claude-code`, then run `test-cases` from `claude`, up to the review.
- [ ] `init --host cursor`, then run `test-cases` from Cursor, up to the review. The run folder is in this project.

## 3. CLI (20 min)

- [ ] `run test-cases --key <key> --headless claude-code --yes` exits 0.
- [ ] `run document --type test-plan --key <key> --publish confluence --accept publish` creates the page under your parent page, with the `agent-qa` label.
- [ ] `run requirements --key <key named by an MR> --with-pull-requests --yes --headless claude-code` lists the GitLab merge requests, masked.
- [ ] `harness --headless claude-code` passes.
- [ ] `report --html` writes the dashboard. Open it in your browser: it shows the week's rates.

## 4. Send me

- Each unticked line, with its error text and run id.
- How long the whole check took.

When every line is ticked, I prepare 2.0.0: the release notes, the `pre exit` PR, and the "Version packages" PR. Publishing 2.0.0 still waits for your go.
