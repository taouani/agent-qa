---
"sf-agent-qa": patch
---

`agent-qa secret set NAME` stores a key in the OS keychain from a hidden prompt (or piped in), and `agent-qa secret delete NAME` removes it. `init` now points `agent-qa.yaml` at the keychain (`${keychain:…}`) when it asks you at a terminal on macOS or Windows, so your IDE finds the keys however it is started; `--secrets env` keeps environment variables.
