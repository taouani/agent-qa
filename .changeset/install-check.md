---
"sf-agent-qa": patch
---

Each release is now checked as a new user installs it. CI packs the package, checks its files and size, and installs it into an empty project on Ubuntu and Windows. There it runs `--version`, `init`, `doctor --offline` and the offline harness. A stable release also moves `next` to it and deprecates the empty 0.0.0 placeholder.
