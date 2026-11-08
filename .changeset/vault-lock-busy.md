---
"sf-agent-qa": patch
---

The vault key lock copes with a file Windows reports busy (`EPERM`, `EBUSY`, `EACCES`, for example while an antivirus scan holds it): taking over a stale lock and removing one's own lock are retried briefly, instead of the lock being left for minutes or a waiter giving up.
