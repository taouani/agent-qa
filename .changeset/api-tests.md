---
"sf-agent-qa": minor
---

`scripts` writes API tests with `api: true`: Playwright request tests for cases that describe API behaviour. They send to paths under the config's baseURL and check status and body. They drive no browser, take no exploration and use no Salesforce UI helpers. The server refuses a draft that uses `page`, a locator, a full URL, or sends no request (S3-8).
