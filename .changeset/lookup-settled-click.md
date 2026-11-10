---
"sf-agent-qa": patch
---

The Salesforce pack's `fillLookup` helper clicks a lookup result only once it has stayed the first match, unchanged, for 400 ms. Before, a click that landed while Lightning redrew the list could be lost, leaving the field on its previous record.
