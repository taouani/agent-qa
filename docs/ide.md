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

- **IDEs that can ask you directly** (MCP elicitation, form mode): Agent-QA shows its own prompt, for example "Push 12 reviewed test case(s) to Xray project QA? 9 new, 3 updated.", with a "Yes, go ahead" box that starts unticked. Only an accepted prompt with the box ticked pushes. Declining, cancelling or closing the prompt pushes nothing, whatever the model sent. If the model already answered no, you aren't asked.
- **Other IDEs:** the model asks you in chat and submits your answer. Check what it submitted in the run's `xray-push.md`.

If the prompt can't be shown (it fails or is closed with an error), nothing is submitted and the step stays open: ask the model to submit the push step again.

In the CLI, the push takes a terminal answer or `--accept push`. `--yes` never pushes.
