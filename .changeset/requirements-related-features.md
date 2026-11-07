---
"sf-agent-qa": minor
---

`requirements` (and `test-cases` started from a key or JQL) now gives an issue with no acceptance criteria up to three related feature files of the repo: one that names the issue key, then those whose feature and scenario titles share words with its summary. They are found with no model, in the reviewed profile's folder, and masked, so an IDE and CI get the same context. A criterion the analysis takes from one is labelled with the file (`from` in `requirements@1`, "inferred from repo: …" in the markdown), and `test-cases` tells the model it isn't written in the issue. The host model is told not to read the repository itself.
