# pilot.yml — autonomous engineering agent

The pilot runs on a cron schedule, picks ONE actionable signal per run, and either opens a PR or SKIPs with a reason. SKIP is a valued outcome: a skipped day is better than a duplicate or misaligned PR.

## How it picks

The workflow first runs `scripts/pilot-report.js`, which produces a markdown report containing:

1. **Extras section** (only if `scripts/pilot-report-extras.js` exists) — your custom KPIs / monitors / severity interrupts.
2. **Open PRs claiming issues (BLOCKLIST)** — any open PR with `Fixes #N` / `Closes #N` / `Resolves #N` in its body. Includes human-authored PRs, not just pilot ones. The pilot is forbidden from picking any blocked issue.
3. **Pilot track record (last 30 days)** — merge rate, plus a **looped issues** list (any issue with ≥2 closed-unmerged pilot PRs). Looped issues are also forbidden.
4. **Open `ready-for-pilot` issues (tier-classified)** — the candidate pool.

Then the agent reads the report (plus `CLAUDE.md` and `.github/PILOT_GUIDELINES.md`) and applies a strict picking order:

1. Severity interrupt from extras (if your guidelines name one)
2. Community-authored `ready-for-pilot` issue (lowest tier number → oldest first)
3. Self-filed `ready-for-pilot` issue (if `PILOT_AUTHOR` is configured)
4. Extras signal — only when no actionable issues exist

**Volume is not a tie-breaker against authored issues.** A 50-line server error and a one-line community issue both count as "one signal"; the community issue wins because someone took the time to file it with context the bot doesn't have.

## Tier classification

Default tiers (used unless you provide `.github/pilot-tiers.json`):

| Tier | Default match |
|---|---|
| 1 | bug / broken / error / crash / fails / exception / regression |
| 2 | a11y / accessib / keyboard / screen reader / aria |
| 3 | ux / ui / usability / copy / label / tooltip / onboarding |
| 4 | perf / performance / slow / latency / memory / leak |
| 5 | deploy / ci / cd / infra / docker / build / release |

To customize, drop a `.github/pilot-tiers.json` matching `examples/pilot-tiers.json`:

```json
{
  "1": ["\\b(bug|broken|crash)\\b"],
  "2": ["\\b(a11y|aria)\\b"]
}
```

Order matters — first match wins. Issues that don't match any tier land in the middle of the configured range.

## Anti-loop machinery

Three layers prevent the pilot from spinning on bad issues:

1. **Pre-flight blocklist** — embedded as `<!-- PILOT_BLOCKLIST: 60,46 -->` in the report. The pilot is told never to pick a blocked issue.
2. **Post-action dup-check** — after the agent runs, the workflow checks any pilot-labeled PR created in the last 10 minutes. If it references a blocked issue, the PR is auto-closed with a comment.
3. **Auto-escalation** — when ≥2 closed-unmerged pilot PRs reference the same `ready-for-pilot` issue, the issue is relabeled to `needs-info` and a comment asks the reporter to clarify what's missing.

## Schedule

Default: weekday mornings, `11 16 * * 0-4` (Sun–Thu 11:11 AM ET). To change, edit the `cron:` line in `pilot.yml` directly — GitHub doesn't evaluate `vars.X` in cron expressions.

## Extras hook — custom signals

If your project has KPIs or error monitors you want the pilot to consider, write `scripts/pilot-report-extras.js`:

```js
export async function extrasMarkdown() {
  // ... your custom data fetch ...
  return `## My signals\n\n...markdown...`;
}
```

The returned markdown is spliced near the top of the report. Use it for:
- KPI snapshots ("on-target rate dropped to 60%")
- Error monitors ("23 unhandled exceptions in the last hour")
- Severity interrupts ("data-loss: write requests failing")

Then describe the interrupt rules in `.github/PILOT_GUIDELINES.md` so the agent knows what to do with the signals.

## PILOT_GUIDELINES.md

Drop this file in `.github/PILOT_GUIDELINES.md` to give the agent project-specific rules each run. See `examples/PILOT_GUIDELINES.md`. Suggested sections:

- **Anti-goals** — behaviors that must never appear in a PR
- **Higher-risk surfaces** — files where regressions break live users
- **Lower-risk surfaces** — preferred scope for picking
- **Severity interrupt** — what extras conditions outrank the issue queue
- **Strategic priorities** — tie-breaking beyond tiers

## SKIP outcomes

The agent is allowed (encouraged) to skip. Recognized formats:

- `SKIP: ESCALATING <signal> — needs maintainer` — severity interrupt fired but the agent can't safely fix in one PR
- `SKIP: all community ready-for-pilot issues are covered by open pilot PRs (#N, #M)` — blocklist ate every candidate
- `SKIP: no actionable signal today` — nothing meets the rules
- `SKIP: only candidate is an anti-goal (<describe>)` — loudest signal would force a bad fix

## Cost & turn budget

Default model: Sonnet 4.5 (via Bedrock cross-region inference profile). `--max-turns 50` caps each run; ≤4 turns for context, 1 for triage, ≤15 for implementation, ≤5 for verify+ship leaves headroom for fetch/edit churn.

## What the pilot will NOT do

- Won't commit directly to the default branch (must create a `pilot/YYYY-MM-DD-<slug>` branch first)
- Won't push without first creating a PR
- Won't pick blocked issues, looped issues, or anti-goal candidates
- Won't ship a PR without a Triage table and a User impact line in the body
