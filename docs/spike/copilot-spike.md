# Copilot spike (slice 0, T10)

**Question:** does GitHub Copilot in VS Code agent mode reliably follow Agent-QA's core-driven step loop (`workflow_start` → `workflow_submit` → … → `done`)?

The spike uses a toy workflow, `spike-test-cases`, on three synthetic tickets (`SPIKE-1`, `SPIKE-2`, `SPIKE-3`). `SPIKE-2` contains masked personal data tokens such as `<PERSON_1>`. The workflow has three steps: analyze, write 10–30 test cases, and confirm a fake Xray push (nothing is pushed).

## Setup (about 5 minutes)

1. Clone this repo, then run `npm ci && npm run build`.

   If the build fails on Windows with `Cannot read directory "../../..": Access is denied`, run `npm run build:tsc` instead. esbuild, which `npm run build` uses, looks for `package.json` and `tsconfig.json` in every parent folder up to the drive root, and it stops when a locked-down machine denies it access to one of them (for example `C:\` or `C:\Users`). `build:tsc` compiles with the TypeScript compiler, which skips folders it can't read, and writes an unbundled `dist/` with the same `dist/cli/bin.js` entry point. On such a machine, `npm test` and `npm run schema` may fail the same way, because they also use esbuild; the spike doesn't need them.
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

4. Open the Copilot Chat view, switch it to **Agent** mode, and send any message first ("hi" is enough; it doesn't count as a run). Some VS Code versions don't start MCP servers until a chat session exists: before that, the editor shows "Error" above the server in `mcp.json`, and the log says `Server 'agent-qa' failed: Cannot start an MCP server before the session runtime has been created. Send a message first.` After the first message the server may start by itself; otherwise use **MCP: List Servers** → `agent-qa` → **Start**.

   If the server still fails, **MCP: List Servers** → `agent-qa` → **Show Output** shows why. Each run gets a folder under `.agent-qa/runs/` in that folder. To put runs elsewhere, set `AGENT_QA_RUNS_DIR` under `"env"` in `mcp.json`.

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

## Results (2026-11-02)

**Verdict: pass.** Both models met all five criteria. Copilot in VS Code agent mode stays the first host, and decision M4 stands. Tarek ran the spike on Windows with VS Code, a company Copilot plan (MCP policy enabled by the org), Claude Opus 5.5 and GPT-6.1 Sol.

| Run | Model | Ticket | Steps done unaided? | Retries OK? | 30-case submit OK? | Started via | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Claude Opus 5.5 | SPIKE-1 | Yes | Yes (3 cases rejected at `$.cases`; 15 accepted on attempt 2) | n/a | `#workflow_start` | Run `2026-11-02-SPIKE-1-27u8` |
| 2 | Claude Opus 5.5 | SPIKE-2 | Yes | n/a (no rejections) | n/a | `#workflow_start` | 20 cases, masked tokens kept. Run `2026-11-02-SPIKE-2-inyx` |
| 3 | Claude Opus 5.5 | SPIKE-3 | Yes | n/a | n/a | `#workflow_start` | 18 cases. Run `2026-11-02-SPIKE-3-gegx` |
| 4 | GPT-6.1 Sol | SPIKE-1 | Yes | n/a | n/a | `#workflow_start` | 15 cases |
| 5 | GPT-6.1 Sol | SPIKE-2 | Yes | n/a | n/a | `#workflow_start` | 15 cases, masked tokens kept |
| 6 | GPT-6.1 Sol | SPIKE-3 | Yes | n/a | Yes (30 in one submit) | `#workflow_start` | |
| 7 | Claude Opus 5.5 | SPIKE-1 | Yes | n/a | Yes (30 in one submit) | `#workflow_start` | Run `2026-11-02-SPIKE-1-gvck` |
| 8 | GPT-6.1 Sol | SPIKE-1 | Yes | Yes (3 rejected; 12 accepted on attempt 2) | n/a | `#workflow_start` | Run `2026-11-02-SPIKE-1-wa4e` |

**Approval clicks:** 3 in a run with manual permissions. After "Allow all", 1, which is the confirm step's push question. That click is there by design.

| # | Check | Claude Opus 5.5 | GPT-6.1 Sol |
|---|---|---|---|
| 1 | Loop following | Pass (4/4 runs; 8/8 overall, the target was 5/6) | Pass (4/4 runs) |
| 2 | Validation retries | Pass (attempt 2) | Pass (attempt 2) |
| 3 | Large outputs | Pass | Pass |
| 4 | Slash command or short instruction | Pass (short instruction) | Pass (short instruction) |
| 5 | Approval friction | Pass (1 click) | Pass (1 click) |

**Findings for later slices:**
- **The MCP prompt never appeared as a slash command.** Every run started with `#workflow_start "SPIKE-n"`. Slice 1 should find out why, or make the short instruction the documented way to start. Follow-up (S1-13): VS Code names MCP prompts `/<server>.<prompt>`, so the command was `/agent-qa.spike-test-cases`, not `/spike-test-cases`. Both ways are now documented in [docs/ide.md](../ide.md).
- **The server has to be selected for each chat session.** Until it is, Copilot shows no agent-qa tools.
- **VS Code refuses to start an MCP server until a chat message exists.** Step 4 of the runbook now covers this.
- **VS Code flags `cwd` in `.vscode/mcp.json` as "partially supported"**, because it can't migrate it to the root `.mcp.json`. Consider using `AGENT_QA_RUNS_DIR` in `env` instead.
- **On locked-down Windows machines, `npm run build` (esbuild) fails** because it can't read a parent folder. Use `npm run build:tsc` there.
- **Copilot's file search can't see `.agent-qa/runs/`**, because the folder is gitignored. The run folders are there.

## If it fails

In order:

1. **Smaller steps:** one item per submit, and shorter instructions.
2. **Hybrid:** Copilot stays the front end, but the core answers `generate` steps with its own API model.
3. **Move the first host to Claude Code** and bring in Copilot in slice 4. This changes decision M4, so Tarek decides.
