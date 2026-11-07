---
"sf-agent-qa": patch
---

`--push-from` (`casesRun`): two runs can no longer push the same reviewed cases at once, even from two processes (a claim file in the cases' run); the "already pushed" check searches every run, not the newest 200; a push whose cases partly failed can be pushed again (every case is sent, those already in Xray are updated); and an expired vault blocks the push only when `masking.restoreOnWrite` is on.
