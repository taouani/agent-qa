# Kept and runnable rates

Agent-QA tracks two numbers that show whether it saves your team time. Both come from your own runs, in `.agent-qa/runs/`.

- **Kept rate.** This is the share of generated test cases that people kept as written when they reviewed them in `test-cases`. Edited and dropped cases count against it. A review taken with `--yes` doesn't count, because nobody looked at those cases.
- **Runnable rate.** This is the share of generated tests that pass, and then pass again in the stability runs, in `scripts`. Each test case counts once, judged by its latest finished run. Some cases are left out of the rate:
  - a case that stopped on a real defect in your app;
  - a case where the environment failed (sign-in, the network, the app was down);
  - a case that passed once but was never run again.

  None of these is the generated test's fault.

The targets are **95% kept** and **90% runnable**. They apply after the first release, so 2.0.0 reports the numbers and doesn't wait for them.

## See them

```bash
npx agent-qa report            # overall, then the last 8 weeks
npx agent-qa report --weeks 12
npx agent-qa report --json     # for a spreadsheet or your own chart
```

## The dashboard

```bash
npx agent-qa report --html                 # writes .agent-qa/report.html
npx agent-qa report --html rates.html      # or a file you name
```

This writes one HTML file that opens in any browser, offline. It has no script and makes no network call. It shows:

- the kept and runnable rates against their targets, as tiles and as a week-by-week chart (at least 26 weeks);
- the last `agent-qa harness` run, if one was saved in `.agent-qa/harness/last-report.json`;
- how many values masking replaced, by detector (counts only, never a value);
- the latest runs and what each one cost.

The file sits in `.agent-qa/`, so git leaves it out. It holds run ids, Jira keys and test case counts, so share it only where those may go.

Each week is an ISO week, Monday to Sunday in UTC, and a run counts in the week it was saved. Each week's runnable rate judges every case by its latest run in that week. That way a week shows what the team got that week, not where the suite stands now. Harness runs (`agent-qa harness`) never count, because they live in their own folder.

## Collect them over 4 to 6 sprints

1. **Keep the run folders.** `.agent-qa/` stays out of git (`agent-qa doctor` checks this), so the numbers live on the machine that ran the workflows. In CI, keep `.agent-qa/runs/` as a build artifact, or run `agent-qa report --json` at the end of the job and keep its output.
2. **Review for real.** Only a reviewed `test-cases` run counts toward the kept rate. A run with `--yes` is left out on purpose.
3. **Let `scripts` finish its stability runs.** A case that passed once and stopped there is left out as "passed once but wasn't run again", so it says nothing either way.
4. **Read the weeks, not just the total.** A rising kept rate after a prompt or profile change is the signal. If the runnable rate drops in one week, look at that week's `scripts-run.md` files for the failing cases.
5. **After 4 to 6 sprints**, compare the totals with the targets. If they fall short, the edited and dropped counts (kept) and the unstable and failing counts (runnable) show where the time goes.
