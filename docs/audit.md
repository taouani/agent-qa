# Auditing a Playwright suite

The `audit` workflow is a repo-wide, read-only architecture audit of your Playwright suite. It changes nothing. Its report, `audit@1`, is what `refactor` plans from ([refactor.md](refactor.md)).

## Run it

```bash
agent-qa run audit
```

It takes no inputs. It needs a reviewed profile (`agent-qa.profile.json`).

## What it does

1. **Inventory.** Agent-QA counts the folder's files by role (specs, steps, page objects, fixtures, features, data, config) and their lines, and lists the largest files and the entry points. It reads up to 400 files. The rest are counted, not read. Configs and global setup are never read.
2. **Scan.** It runs its code scan over every code file it read: fixed waits, `page.pause()`, `.only` or `.skip`, XPath, generated ids, record ids, org URLs.
3. **Sample.** The model reads every fixture, the ten largest files, and a fixed draw of specs, page objects, step files and data, all masked. The sample is capped at 200,000 characters, and drawn files are dropped first, so in a large suite some areas may come out as not assessed.
4. **Findings.** The model reports findings by area: layering, patterns, reuse, locators, waits, data, naming and scalability. Each comes with evidence in the sample (a file and a line), a severity, its impact, the risk of changing it, the effort (roughly how many files) and what it depends on.

Agent-QA ranks the findings, high impact and low risk first, and numbers them `AF-001` onwards. It scores each area. An area the sample shows too little of gets no score, and is marked not assessed rather than guessed.
