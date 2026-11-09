# Getting started

From an empty terminal to your first `test-cases` run in about 10 minutes. Most of that time goes on creating the Jira and Xray keys; the install itself takes seconds.

## What you need

- **Node.js 20 or later.** Node 22.15 or later if your company network re-signs HTTPS (see [Behind a company network](#behind-a-company-network)). Check with `node --version`.
- **A Jira Cloud site**, and an API token for your Atlassian account: create one at <https://id.atlassian.com/manage-profile/security/api-tokens>.
- **To push test cases to Xray Cloud** (optional): an Xray API key, which is a client ID and a secret. A Jira admin creates it in Jira under Apps, Xray, API Keys.
- **A model**, in one of two ways:
  - In your IDE, the IDE's own model answers. That means GitHub Copilot in VS Code (agent mode), Claude Code or Cursor, and you need no API key.
  - From a terminal or CI, you need a model API key: `ANTHROPIC_API_KEY` for the default model. See [models.md](models.md).

## 1. Set up the project (1 minute)

In your project folder (a git checkout):

```bash
npx -y sf-agent-qa@next init
```

When it creates `agent-qa.yaml`, `init` asks two things: your Jira site (`acme` is enough for `https://acme.atlassian.net`) and the Xray project key (press Enter to skip). It then writes these files:

- `agent-qa.yaml`: settings only, never a secret;
- the MCP settings for VS Code, Claude Code and Cursor;
- the `.gitignore` line for `.agent-qa/`, which holds the vault and the runs.

An existing `agent-qa.yaml` is kept, and then nothing is asked (`--force` replaces it). It ends by printing the exact variables to set, in your shell's syntax. In CI, or with no terminal, it asks nothing: pass `--site` and `--xray-project` instead.

## 2. Give it your keys (5 minutes)

Secrets stay out of every file. `agent-qa.yaml` names environment variables such as `${env:ATLASSIAN_TOKEN}`, and Agent-QA reads them when it runs.

macOS and Linux:

```bash
export ATLASSIAN_EMAIL=you@example.com
export ATLASSIAN_TOKEN=...
export XRAY_CLIENT_ID=... XRAY_CLIENT_SECRET=...    # if you push to Xray
export ANTHROPIC_API_KEY=...                         # for terminal runs only
```

Windows (PowerShell):

```powershell
$env:ATLASSIAN_EMAIL = "you@example.com"
$env:ATLASSIAN_TOKEN = "..."
$env:XRAY_CLIENT_ID = "..."; $env:XRAY_CLIENT_SECRET = "..."    # if you push to Xray
$env:ANTHROPIC_API_KEY = "..."                                  # for terminal runs only
```

These last as long as the terminal does. **Your IDE has to see them too:** its Agent-QA server starts with the IDE's environment. So start the IDE from this same terminal (`code .`, `cursor .` or `claude`). An IDE started from the Start menu or the Dock doesn't see variables set in a terminal.

To keep them for good, set them at the user level instead, and restart the IDE:

- **Windows:** `setx ATLASSIAN_TOKEN "..."`, or System Properties, Environment Variables.
- **macOS and Linux:** your shell profile.

Agent-QA also reads `${keychain:NAME}` references from the OS keychain, under the service `sf-agent-qa`.

## 3. Check the setup (1 minute)

```bash
npx -y sf-agent-qa@next doctor
```

Each line is `ok`, `warn`, `FAIL` or `skip`, and every problem comes with a `fix:` line. These are the ones a fresh install meets most:

| doctor says | What to do |
|---|---|
| `Jira site: atlassian.site is still the placeholder` | `init` ran with nobody to ask. Set `atlassian.site` in `agent-qa.yaml`. |
| `Secrets: … Environment variable … is not set` | Set it as in step 2, in the terminal you run from. |
| `Vault key: … no key yet` (warn) | Nothing to do: the first run creates the key in your OS keychain. On a Linux machine with no keychain (a server, WSL, a container), set `AGENT_QA_VAULT_KEY` to the output of `openssl rand -base64 32`, and keep it. |
| `Models: no API key for anthropic` (warn) | Fine for IDE use. For terminal runs, set `ANTHROPIC_API_KEY`. |
| `Services: … UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `SELF_SIGNED_CERT_IN_CHAIN` | Your network re-signs HTTPS. See [Behind a company network](#behind-a-company-network). |
| `Services: … ENOTFOUND` | The host name didn't resolve: check the site in `agent-qa.yaml`, and the proxy. |
| `Services: … timed out after 5000 ms` | Usually a proxy: set `HTTPS_PROXY`. |

`doctor --offline` skips the network checks, and `doctor --json` prints the results for a script.

## 4. Your first run (2 minutes)

Pick a Jira story with a description, here `ABC-123`.

**In VS Code with Copilot** (agent mode):

1. Open `.vscode/mcp.json` and click Start above `agent-qa`.
2. In the chat, type `/agent-qa`, pick `mcp.agent-qa.test-cases`, and enter `{"key":"ABC-123"}`.

**In Claude Code**, run `/mcp__agent-qa__test-cases {"key":"ABC-123"}`. **In Cursor**, turn the server on in Settings, MCP, and ask: "start the agent-qa test-cases workflow for ABC-123". More in [ide.md](ide.md).

**From a terminal:**

```bash
npx -y sf-agent-qa@next run test-cases --key ABC-123
```

Agent-QA reads the story, masks personal data, and asks the model for test cases. Then it shows you the cases to review. Nothing goes to Xray until you say yes. The run's files are in `.agent-qa/runs/<date>-ABC-123-<id>/`, with `test-cases.md` to read and a cost report.

## Behind a company network

**npm can't download the package** (`npx` hangs or fails with a certificate error). Point npm at the proxy and the company certificate:

```bash
npm config set proxy http://proxy.example.com:8080
npm config set https-proxy http://proxy.example.com:8080
npm config set cafile /path/to/company-ca.pem
```

**doctor shows a certificate error** (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `SELF_SIGNED_CERT_IN_CHAIN`). Node doesn't trust the company certificate. You can fix this two ways:

- With Node 22.15 or later, run with `NODE_OPTIONS=--use-system-ca` (PowerShell: `$env:NODE_OPTIONS = "--use-system-ca"`). Node then uses the operating system's certificates.
- Or set `NODE_EXTRA_CA_CERTS` to the company CA file (`.pem`).

Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`: it turns off the certificate checks that protect your Jira and Xray tokens.

**In the IDE**, the server needs the same flag. Install the package into the project, then start it with `node` directly:

```bash
npm install --save-dev sf-agent-qa@next
```

```json
"agent-qa": {
  "type": "stdio",
  "command": "node",
  "args": ["--use-system-ca", "node_modules/sf-agent-qa/dist/cli/bin.js", "mcp"],
  "env": { "AGENT_QA_RUNS_DIR": "${workspaceFolder}/.agent-qa/runs" }
}
```

That is `.vscode/mcp.json`. `.mcp.json` (Claude Code) and `.cursor/mcp.json` take the same `command` and `args`.

**Only a proxy** (no re-signing): set `HTTPS_PROXY`, and `NO_PROXY` for hosts that skip it. Agent-QA and doctor use it for every service.

## On Windows

- **`npx : File …\npx.ps1 cannot be loaded because running scripts is disabled`.** PowerShell's execution policy blocks npm's script. Run `npx.cmd` instead of `npx`, or allow local scripts for your account: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **Building from a clone** (not needed to use Agent-QA) may fail with `Cannot read directory "../../..": Access is denied` on a locked-down machine. Use `npm run build:tsc` instead of `npm run build`.
- The vault key goes into Windows Credential Manager on the first run.

## How long it takes

Measured on a clean Linux container with npm reachable, on 9 November 2026, from the packed 2.0.0-alpha.2:

| Step | Time |
|---|---|
| `npm install` of the package (108 MB with its dependencies) | 5 to 11 s |
| `agent-qa init` | 1 s |
| `agent-qa doctor` | 1 s (each network check waits at most 5 s) |

The 10-minute goal leaves the rest for creating the API token and Xray key and for the first run. Not yet measured: Windows, and a company network. The release's install check in CI (Ubuntu and Windows) and the release live check will time those.
