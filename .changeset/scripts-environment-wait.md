---
"sf-agent-qa": patch
---

scripts: an environment failure (sign-in, the app, the network) no longer ends the run. The run waits while you fix it, then runs the same files again and goes on with the fix loop. It ends as `environment`, as before, if you say stop or when no fix round would be left after the retry. The IDE approval note now says plainly that the model's submit only opens your prompt.
