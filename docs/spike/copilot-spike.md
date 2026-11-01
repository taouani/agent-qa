# Copilot spike (slice 0, T10)

**Question:** does GitHub Copilot in VS Code agent mode reliably follow Agent-QA's core-driven step loop (`workflow_start` → `workflow_submit` → … → `done`)?

The spike uses a toy workflow, `spike-test-cases`, on three synthetic tickets (`SPIKE-1`, `SPIKE-2`, `SPIKE-3`). `SPIKE-2` contains masked personal data tokens such as `<PERSON_1>`. The workflow has three steps: analyze, write 10–30 test cases, and confirm a fake Xray push (nothing is pushed).

## Setup (about 5 minutes)

1. Clone this repo, then run `npm ci && npm run build`.
2. Open any folder in VS Code (1.102 or later) with GitHub Copilot enabled.
3. Add `.vscode/mcp.json` to that folder, using the absolute path to your clone. On Windows, write the path with forward slashes (`C:/Users/you/agent-qa/...`) or doubled backslashes, because a single `\` is invalid JSON.

   ```json
   {
     "servers": {
       "agent-qa": {
         "type": "stdio",
         "command": "node",
         "args": ["/ABSOLUTE/PATH/TO/agent-qa/dist/cli/bin.js", "mcp"],
         "cwd": "${workspaceFolder}"
       }
     }
   }
   ```

4. Open the Copilot Chat view and switch it to **Agent** mode. Start the `agent-qa` server when VS Code offers to (or use **MCP: List Servers** and start it). Run state is written to `.agent-qa/state/` in that folder. To put it elsewhere, set `AGENT_QA_STATE_DIR` under `"env"` in `mcp.json`. To put it elsewhere, set `AGENT_QA_STATE_DIR` under `"env"` in `mcp.json`.

## Runs

Do six runs: two models (one Anthropic, one OpenAI, picked in the Copilot model menu) × three tickets. Start each run in a new chat, with one of these:

- **Slash command:** type `/` and look for `mcp.agent-qa.spike-test-cases`. VS Code asks for the `inputs` argument; enter `{"ticket":"SPIKE-2"}`.
- **Plain request (if the prompt isn't listed):** "Use the agent-qa tools to run the spike-test-cases workflow for ticket SPIKE-2."

When the model reaches the confirm step and asks whether to push, answer yes.

For one of the runs, test retries on purpose by telling the model: "For the cases step, first submit only 3 cases." The engine rejects that (10 is the minimum), and the model should fix it and resubmit.

## Pass criteria

The spike passes if four of these five hold for both models.

| # | Check | Pass when |
|---|---|---|
| 1 | Loop following | All three steps finish without the user nudging the model, in at least 5 of 6 runs |
| 2 | Validation retries | After a rejected output, the model fixes it and resubmits within 3 attempts |
| 3 | Large outputs | A 30-case submit (about 15k tokens) goes through in one call |
| 4 | Slash command | The workflow starts from the MCP prompt, or from one short instruction if prompts aren't shown |
| 5 | Approval friction | No more than one tool-approval click per run after "always allow" is set for the server |

## Results (fill in)

| Run | Model | Ticket | Steps done unaided? | Retries OK? | 30-case submit OK? | Started via | Approval clicks | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | | SPIKE-1 | | | | | | |
| 2 | | SPIKE-2 | | | | | | |
| 3 | | SPIKE-3 | | | | | | |
| 4 | | SPIKE-1 | | | | | | |
| 5 | | SPIKE-2 | | | | | | |
| 6 | | SPIKE-3 | | | | | | |

The files in `.agent-qa/state/` show exactly what each run submitted and how many attempts it took. Attach them, or paste a summary, when you report back.

## If it fails

In order:

1. **Smaller steps:** one item per submit, and shorter instructions.
2. **Hybrid:** Copilot stays the front end, but the core answers `generate` steps with its own API model.
3. **Move the first host to Claude Code** and bring in Copilot in slice 4. This changes decision M4, so Tarek decides.
