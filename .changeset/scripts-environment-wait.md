---
"sf-agent-qa": patch
---

scripts: an environment failure (sign-in, the app, the network) no longer ends the run. The run waits while you fix it, then runs the same files again and goes on with the fix loop. On the last round, or if you say stop, it ends as `environment` as before. The IDE approval note now says plainly that the model's submit only opens your prompt.
