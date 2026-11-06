---
"sf-agent-qa": minor
---

The `audit` workflow (slice 3, S3-5): a read-only architecture audit of the repo's own Playwright suite, ported from v1's audit-framework.

Agent-QA does the inventory itself. It counts the files by role (specs, steps, page objects, fixtures, other code, features, data, configs) with their lines, and lists the largest files and the entry points. Configs are never read. It also runs its code scan over every code file it can read, up to 400. The scan counts fixed waits, focus or skip, XPath, generated ids, record ids and org URLs.

The model reads a sample in full:
- every fixture;
- the ten largest files;
- a fixed draw of specs, page objects, step files and data.

It reports findings by area: layering, patterns, reuse, locators, waits, data, naming and scalability. Each finding cites evidence in the sample and has a severity, impact, risk of change and effort, and can name what it depends on.

Agent-QA then ranks the findings: high impact and low risk first, each one after the findings it depends on. It numbers them AF-001 onward, scores each area out of 10, and records the result as `audit@1`, which `refactor` will read. The harness gets an `audit` case.
