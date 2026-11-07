# Using Agent-QA in your IDE

Agent-QA runs in your IDE as an MCP server. `agent-qa init` writes `.vscode/mcp.json` for VS Code; the IDE's own model (Copilot, Claude Code, Cursor) answers each step, and Agent-QA checks every answer before it goes on.

## Starting a workflow

Each workflow is an MCP prompt with one argument, `inputs`, as JSON. In VS Code (Copilot agent mode) an MCP prompt is a slash command named `/mcp.<server>.<prompt>`, so with the server named `agent-qa` in `mcp.json` the commands are `/mcp.agent-qa.test-cases` and `/mcp.agent-qa.requirements`. Typing `/agent-qa` in the chat lists both. Pick one and press Tab: VS Code shows a box titled "Value for: inputs". Type the inputs as JSON in its field and press Enter, for example:

```text
{"key":"ABC-123"}
{"jql":"project = ABC AND sprint in openSprints()"}
```

If you renamed the server in `mcp.json`, use that name instead of `agent-qa`.

If the slash command doesn't show up, ask the model to call the start tool directly. This always works, and it's what the Copilot spike used:

```text
#workflow_start test-cases {"key":"ABC-123"}
```

The model then follows the step loop on its own until the run is done, or a step needs you.

## Approving a push to Xray

Pushing test cases to Xray writes outside your machine, so it needs your own yes, never the model's.

- **IDEs that can ask you directly** (MCP elicitation, form mode): Agent-QA shows its own prompt, for example "Push 12 reviewed test case(s) to Xray project QA? 9 new, 3 updated.", with a choice between "Yes, go ahead" and "No" that starts on "No". Only "Yes, go ahead", submitted, pushes. Declining, cancelling or closing the prompt pushes nothing, whatever the model sent. If the model already answered no, you aren't asked.
- **Other IDEs:** the model asks you in chat and submits your answer. Check what it submitted in the run's `xray-push.md`.

If the prompt can't be shown (it fails or is closed with an error), nothing is submitted and the step stays open: ask the model to submit the push step again.

In the CLI, the push takes a terminal answer or `--accept push`. `--yes` never pushes.

### Pushing later, after a no

A run whose push you declined is finished, and stays as it finished. To push its reviewed cases later, start a new `test-cases` run with `{"casesRun": "<run id>"}` (CLI: `agent-qa run test-cases --push-from <run id> --accept push`). It reads no Jira and asks the model for nothing: it goes straight to the push of that run's `test-cases@1` and asks for your yes the same way, naming the run the cases come from. The real values come from the vault of the run that analyzed the requirements (the same run, unless it started from `requirementsRun` or reused an analysis), which must still hold them (30 days) when `masking.restoreOnWrite` is on; with it off, tokens are pushed as they are and no vault is needed. A push whose cases partly failed can be pushed again the same way: every case is sent, and those already in Xray are updated. Two pushes of the same cases can't run at once, even from two terminals. The new run's `xray-push@1` names the earlier run as its source.

Reviewed cases are pushed once. `casesRun` is refused for a run that isn't finished (one waiting at its push: resume it instead) and for cases some run already pushed. If two such runs wait at the push, the second yes is refused.

## Behind a corporate proxy

If `agent-qa doctor` shows a certificate error such as `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, your network re-signs HTTPS with a company certificate that Node doesn't trust by default. Start node with `--use-system-ca` (Node 22.15 and later) so it uses the operating system's certificates, in `mcp.json` too: `"command": "node", "args": ["--use-system-ca", "<path>/dist/cli/bin.js", "mcp"]`. For `agent-qa` in a terminal, set `NODE_OPTIONS=--use-system-ca` first (PowerShell: `$env:NODE_OPTIONS = "--use-system-ca"`). Or set `NODE_EXTRA_CA_CERTS` to the company CA file (.pem). If the network only reaches out through a proxy, set `HTTPS_PROXY` (and `NO_PROXY`). Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`: it turns off certificate checks for your Jira and Xray tokens.
