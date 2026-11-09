# Troubleshooting

Start with `agent-qa doctor` in your project folder. Each failing line ends with a `fix:` line, and most problems are found there. This page covers what doctor can't see, grouped by when you meet it.

## Installing

| You see | What to do |
|---|---|
| `npx : File …\npx.ps1 cannot be loaded because running scripts is disabled` (PowerShell) | Run `npx.cmd` instead of `npx`, or allow local scripts for your account: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| `npx` hangs, or fails with a certificate error | npm can't reach the registry through your company network. Set npm's proxy and CA file: [getting-started.md](getting-started.md#behind-a-company-network). |
| The install takes over a minute on Windows | That's npm on Windows (76 s measured, against 5 to 11 s on Linux). Install once in the project, `npm install --save-dev sf-agent-qa@next`, instead of `npx` each time. |
| `npm warn EBADENGINE Unsupported engine`, or a crash as it starts | Agent-QA needs Node.js 20 or later. Check with `node --version`. |

## Setting up

| doctor says | What to do |
|---|---|
| `atlassian.site is still the placeholder` | `init` ran with nobody to ask. Set `atlassian.site` in `agent-qa.yaml`, or run `init --force --site acme`. |
| `Environment variable … is not set` | Set it in the terminal you run from ([getting-started.md](getting-started.md#2-give-it-your-keys-5-minutes)). In an IDE, see [The IDE](#the-ide) below. |
| `Keychain entry … not found` | Store it: `agent-qa secret set NAME`. |
| `The OS keychain can't be used` or `didn't keep` | There is no keychain here (a Linux server, WSL, a container). Use `${env:NAME}` in `agent-qa.yaml` instead. |
| `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `SELF_SIGNED_CERT_IN_CHAIN` | Your network re-signs HTTPS. Use `NODE_OPTIONS=--use-system-ca` (Node 22.15 or later), or set `NODE_EXTRA_CA_CERTS` to the company CA file. Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`. |
| `ENOTFOUND` | The host name didn't resolve. Check the site in `agent-qa.yaml`, and the proxy. |
| `timed out after 5000 ms` | Usually a proxy: set `HTTPS_PROXY`, and `NO_PROXY` for hosts that skip it. |
| A schema line warning (`sf-agent-qa@… ` in the first line) | The `# yaml-language-server` line names another version. Change it to the version doctor names, so your editor checks the right keys. |
| `.agent-qa/` is not in `.gitignore`, or files under it are tracked | Do what the `fix:` line says. If a vault file was ever committed, its values are in git history: treat them as exposed. |

Every key of `agent-qa.yaml` is listed in [config.md](config.md).

## The vault key

The vault key encrypts each run's mapping of tokens back to real values. It lives in your OS keychain, or in `AGENT_QA_VAULT_KEY`.

- **On a Linux server, WSL or a container with no keychain,** the first run can't store the key. Set `AGENT_QA_VAULT_KEY` to the output of `openssl rand -base64 32`, and keep it as a secret.
- **`Another Agent-QA process is creating the vault key`.** Two runs started at once on a machine with no key yet, and one waited 4 minutes. If no other Agent-QA process is running, delete the lock file the message names and try again.
- **The key was lost or changed.** Old vaults can't be read, and repo path tokens change. Nothing else breaks: new runs work. A run that needs an old vault (a push from an earlier run, with `restoreOnWrite`) has to be redone.

## The IDE

- **The Agent-QA server doesn't start, or doesn't appear.** In VS Code, open `.vscode/mcp.json` and click Start above `agent-qa`. In Cursor, turn it on in Settings, MCP. Run `agent-qa init` again if the file is missing.
- **The server starts, but says a variable isn't set.** The server gets the IDE's environment, not your terminal's. Start the IDE from the terminal where the variables are set (`code .`, `cursor .` or `claude`), or set them at the user level and restart the IDE. Or keep them in the OS keychain instead, which the server reads however the IDE starts: `agent-qa secret set NAME`, and `${keychain:NAME}` in `agent-qa.yaml`.
- **Certificate errors only in the IDE.** The server needs `--use-system-ca` too: start it with `node` instead of `npx` ([getting-started.md](getting-started.md#behind-a-company-network)).
- **The model answers, but never asks you before a push.** In a host without MCP elicitation, the model asks you in chat. Answer there. To be asked by Agent-QA itself, use a host with elicitation, or the CLI ([security.md](security.md#writes)).

More in [ide.md](ide.md).

## Running

| You see | What to do |
|---|---|
| `Write to xray denied: …` in CI | In CI nobody can be asked, so `ask` is denied. Set `policy.writes.xray: allow` in `agent-qa.yaml` if CI should push, and pass `--accept push`. |
| Exit code 3 | The run is waiting for a person (a review or a yes). The CLI prints the command that answers it: `agent-qa run --resume <run id> --accept <step>` (or `--decline <step>`). You can also answer it in your IDE. When the message says only a host model can answer the step, continue the run in your IDE. |
| Exit code 2 | Bad setup or input: the message says which. Run `agent-qa doctor`. |
| A run stopped half way | Fix the cause, then `agent-qa run --resume <run id>` continues it from the last finished step. The run id is its folder name in `.agent-qa/runs/`, and the CLI prints it. |
| `Models: not in models.allowed` | Add the model to `models.allowed`, or pick one that is. |
| `Models: … it runs, untested` (warn) | It runs directly, but Agent-QA has only tested Anthropic's models. Routing it through OpenRouter or LiteLLM is the suggested way ([models.md](models.md)). |

## Salesforce sign-in

Each user signs in with the JWT bearer flow of your External Client App ([salesforce.md](salesforce.md)). The error names the OAuth code:

| Code | What it usually means |
|---|---|
| `invalid_app_access` | The user isn't assigned the permission set that carries the External Client App, and their profile isn't in the app's OAuth policies. |
| `invalid_grant` | The private key doesn't match the app's certificate, the username is wrong for this org, or the audience doesn't match the login host (`https://test.salesforce.com` for sandboxes). |
| `invalid_client` | The consumer key doesn't match an app in this org, or a new app hasn't propagated yet (up to 30 minutes). |
| `app_not_found` | The consumer key belongs to another org, or the username doesn't exist in this org. |
| `user_non_admin_approved` | The app still asks each user to approve it. Set its policy to "Admin approved users are pre-authorized". |
| `inactive_user`, `inactive_org` | The user, or the org, is inactive. |

`agent-qa doctor` signs in each configured user and shows these, without a browser.

## Building from a clone

On a locked-down Windows machine, `npm run build` can fail with `Cannot read directory "../../..": Access is denied`. Use `npm run build:tsc`. More in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Still stuck

Open an issue with the bug template: it asks for the version, the host, and `agent-qa doctor --json`. Leave real personal data and credentials out.
