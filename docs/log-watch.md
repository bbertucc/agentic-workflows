# log-watch.yml — generic detector → idempotent issue

A scheduled "alarm" pattern. Every 2 hours, the workflow runs your detector script. If the detector returns an alert AND no open issue already carries the alert's dedup label, an issue is opened. While the issue stays open, further alerts are suppressed — close the issue once the underlying condition is resolved.

## Setup

The workflow is inert until you provide `scripts/log-watch-detector.js`. Copy `examples/log-watch-detector-template.js` to that path and customize.

## Detector contract

```js
// scripts/log-watch-detector.js
export async function detect() {
  // ... your check logic ...
  if (everythingFine) return null;

  return {
    dedupLabel: 'my-condition',   // unique label keeping the alert idempotent
    title: 'Something is wrong',
    body: '...markdown issue body...',
    labels: ['ready-for-pilot'],  // optional; defaults to ['ready-for-pilot']
    color: 'B60205',              // optional; hex for dedupLabel creation
    description: 'Auto-raised by log-watch',  // optional
  };
}
```

Return `null` when nothing's wrong. Return the alert object when it is.

## Idempotency

The runner queries open issues with `--label <dedupLabel>` before opening. If one exists, the run is a no-op. This means:

- The detector can fire repeatedly without spamming
- Closing the issue tells the system "fixed; resume alerting"
- One dedup label per condition (use different labels for different conditions)

## Example uses

- **Data-loss watch** — poll your admin API for write-path 5xx errors; alert if any.
- **Uptime check** — hit your health endpoint; alert if it's been down for N minutes.
- **Cost watch** — fetch your cloud billing; alert if today's spend exceeds a threshold.
- **Cert expiry** — check your TLS cert; alert at 30 days out.
- **Queue depth** — poll your job queue; alert if depth > N.

The pattern works for anything where "the right action is to file an issue and let humans / the pilot deal with it."

## Wiring into the pilot

If you label your alerts with `ready-for-pilot` (the default), the pilot's next run will see them in the report alongside human-filed issues. To make a particular alert outrank the issue queue:

1. Document the rule in `.github/PILOT_GUIDELINES.md`: e.g. "If an open issue has label `data-loss`, treat as severity 0 and fix or escalate."
2. Optionally surface the same signal in `scripts/pilot-report-extras.js` so the agent sees it as a prominent callout near the top of the report (not just buried in the issue list).

## Schedule

Default: `37 */2 * * *` (every 2 hours). Adjust the `cron:` in `log-watch.yml` directly.

## Custom env

The workflow doesn't know what env your detector needs. To pass secrets/config, edit `log-watch.yml`:

```yaml
- name: Run detector
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    MY_API_URL: ${{ secrets.MY_API_URL }}
    MY_API_TOKEN: ${{ secrets.MY_API_TOKEN }}
  run: node scripts/log-watch.js
```
