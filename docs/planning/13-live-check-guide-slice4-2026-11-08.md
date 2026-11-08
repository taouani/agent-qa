# Live check, slice 4: hosts, headless CLIs, git hosts, Confluence

Slice 4's code is tested against stand-ins only. This guide is the live check (S4-11, S4-12). Each part is separate: do the ones you have access for, in any order, and send me what each "Report" line asks for. Run everything from your clone of master (`npm run build`, or `npm run build:tsc` on Windows), and on your corporate network set `$env:NODE_OPTIONS = "--use-system-ca"` first.

Use a project with an `agent-qa.yaml` (the approval app is fine) and one Jira issue key you used before. A run's id is its folder name under `.agent-qa\runs\`.

## 1. Claude Code

1. In the project folder: `node <clone>\dist\cli\bin.js init --host claude-code`. It writes `.mcp.json`. To test master instead of the published alpha, change its `command` and `args` to `"node"`, `["--use-system-ca", "<clone>\\dist\\cli\\bin.js", "mcp"]`.
2. Start `claude` in the project folder. Say yes when it asks to use the project's MCP servers. `/mcp` should list `agent-qa` as connected.
3. Type `/mcp__agent-qa__test-cases {"key":"<issue key>"}`. If the command isn't listed, ask: "Call workflow_start with workflow test-cases and inputs {"key":"<issue key>"}, then follow the steps."
4. Review the cases when asked. Answer no to the Xray push.

Report: did the slash command show up; did Claude Code ask you the review and push questions in its own prompt (elicitation) or in chat; the run id; any error text.

## 2. Cursor

1. `node <clone>\dist\cli\bin.js init --host cursor`, then change `.cursor/mcp.json` to your clone as in step 1.1.
2. In Cursor Settings, MCP, turn on `agent-qa`. It should show its tools.
3. In the agent chat: "Call workflow_start with workflow test-cases and inputs {"key":"<issue key>"}, then follow the steps."

Report: did the server start (Cursor's MCP log shows its errors); was the run folder made in this project's `.agent-qa\runs\` (not in another folder); review and push questions in a prompt or in chat; the run id; any error text.

## 3. Headless CLIs (no API key)

Claude Code is signed in on your laptop already. For Copilot CLI: `npm install -g @github/copilot`, then `copilot` once and `/login`.

```powershell
node <clone>\dist\cli\bin.js run test-cases --key <issue key> --headless claude-code --yes
node <clone>\dist\cli\bin.js run test-cases --key <issue key> --headless copilot --yes
node <clone>\dist\cli\bin.js harness --headless claude-code
```

Report, for each: the exit code and the last lines of output; whether `cost.json` in the run folder has token counts. For Copilot especially: did it answer at all (it must read the prompt from standard input), and did it try to use a tool. If the Copilot run fails, also send the output of `copilot --version`.

## 4. GitLab (your test project)

1. In a project with a few merge requests whose titles or branches name a Jira key, add to `agent-qa.yaml`:

   ```yaml
   git:
     platform: gitlab
     repo: <group>/<project>
     token: ${env:GITLAB_TOKEN}   # a personal or project token, api scope, Developer role
   ```

2. `node <clone>\dist\cli\bin.js run requirements --key <key named by an MR> --with-pull-requests --yes`

Report: the exit code; `pull-requests.md` in the run folder (it lists the MRs found, masked); any error text. A wrong project gives NOT_FOUND: check `repo` first.

The CI part (a merge request opened by `scripts --ci` from a GitLab CI job) can wait for the end of the slice.

## 5. Confluence (your test space)

1. In `agent-qa.yaml`, under `atlassian:` (next to `site`, `email` and `token`), add:

   ```yaml
     confluence:
       spaceKey: <space key>
       parentPageId: "<id of the page to publish under>"
   ```

   and keep `policy.writes.confluence: ask` (the `--accept publish` below is your yes).

2. `node <clone>\dist\cli\bin.js run document --key <issue key> --type test-plan --publish confluence --accept publish`
3. Run the same command again: the page must be updated, not duplicated.

Report: the page link from the output; whether it has the `agent-qa` label; how tables and code look on the page; whether the second run updated the same page.

## 6. Azure DevOps

Waits for your personal ADO organization: the same as part 4, with `platform: azure-devops` and `repo: <org>/<project>/<repository>`.
