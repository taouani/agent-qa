---
"sf-agent-qa": patch
---

doctor: when the project is a subfolder of a bigger git repo, the `.gitignore` files above it and the repo's `info/exclude` are read too. A new check fails when a vault file is already tracked by git (read from git's index, versions 2 to 4, without running git), and warns for tracked run or audit files.
