# Live check, step 3: test cases, then explore

You have no `ANTHROPIC_API_KEY` (doctor warned about it), so the CLI can't run a model. Run steps 3 and 4 in VS Code with Copilot. Each run's id is its folder name under `.agent-qa\runs\`, for example `2026-11-05-profile-j0j4`.

## 0. Point VS Code at your master build

`.vscode/mcp.json` still runs the published alpha.0 through `npx`, so the IDE would not test master. Change the `agent-qa` server to your clone:

```json
"agent-qa": {
  "command": "node",
  "args": ["--use-system-ca", "C:\\path\\to\\agent-qa\\dist\\cli\\bin.js", "mcp"]
}
```

Then run **MCP: List Servers**, pick `agent-qa` and choose **Restart**.

In the terminal, before any `agent-qa.cmd` command, turn on the Windows certificate store. This fixes doctor's `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` for Atlassian and Xray:

```powershell
$env:NODE_OPTIONS = "--use-system-ca"
agent-qa.cmd doctor     # Services should now be [ok]
```

## 3a. Test cases

In Copilot Chat, in agent mode, type `/agent-qa`, pick `test-cases` and enter:

```json
{"key":"<approval-app issue key>"}
```

If the slash command doesn't show up, send `#workflow_start test-cases {"key":"<issue key>"}` instead.

Review the cases when Copilot shows them. Answer **No** to the Xray push: it isn't needed for this check. Then note the run folder, for example `.agent-qa\runs\2026-11-05-<key>-abcd`.

## 3b. Explore

Pick a role that can perform the cases, such as the sales associate who creates the request. Use a role name exactly as it appears under `salesforce.users`. Then type `/agent-qa`, pick `explore` and enter:

```json
{"testCasesRun":"<test-cases run id>","role":"SalesAssociate-EUR-FRA","start":"/lightning/n/<your app's page>","cases":["TC-<KEY>-001"],"headed":true}
```

- `start` is the path in your sandbox's address bar when the app is open (everything after `.com`).
- Start with one case (`cases`) and `headed: true`, so you can watch the browser.
- VS Code then asks you to approve: only your own yes counts. If it can't ask you, run the command it gives you in the terminal (`agent-qa.cmd run --resume <run id> --accept approve`).

When it ends, open the run's exploration file and check the status of each case (`complete` or `partial`). Note the explore run id.

## 4. Scripts

Type `/agent-qa`, pick `scripts` and enter:

```json
{"testCasesRun":"<test-cases run id>","explorationRun":"<explore run id>","cases":["TC-<KEY>-001"]}
```

Agent-QA asks you three times: `typecheck`, `review` (you see every file whole) and `run`.

## Send me

- the status each case reached in explore;
- the status of the scripts run (`passed`, `unstable`, `defect`, `environment` or `gave-up`);
- a screenshot of anything that looked wrong.
