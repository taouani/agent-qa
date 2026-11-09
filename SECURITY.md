# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 2.x (`sf-agent-qa` on npm) | Yes: fixes go into the latest release |
| 2.0.0 prereleases (`alpha`, `rc`) | Only until 2.0.0 is out |
| v1 (the markdown prompt pack, `v1` branch) | No: frozen at `v1.0.0` |

## Reporting a vulnerability

Please report it privately, never in a public issue or pull request:

1. Open the repository's **Security** tab on GitHub.
2. Choose **Report a vulnerability**.

Include what you found, how to reproduce it, and what it lets an attacker do. Leave real personal data and real credentials out of the report: use made-up values.

You get an answer through that private report. When a fix is released, the advisory is published with credit to you, unless you'd rather not be named.

## What counts

The most important things are anything that:

- lets a real value (a name, email, phone number or ID) reach a model, or a file in the repo, unmasked;
- lets a model or a Jira, Confluence or repo text write somewhere without the person's yes or the policy's allow;
- exposes the vault, its key or a credential from the config;
- runs a command in the person's repo that the reviewed framework profile doesn't list.

[docs/security.md](docs/security.md) describes how Agent-QA handles data, and what it doesn't protect against.
