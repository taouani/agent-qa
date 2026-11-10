---
"sf-agent-qa": patch
---

The Salesforce pack's `fillLookup` helper clicks a lookup result only once the results have stopped redrawing. Before, a click that landed while Lightning redrew the list could be lost, leaving the field on its previous record.
