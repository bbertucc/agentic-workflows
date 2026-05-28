/**
 * Template for scripts/log-watch-detector.js
 *
 * Copy this to scripts/log-watch-detector.js in your repo and customize the
 * `detect()` function. The log-watch workflow imports it every 2 hours; if
 * detect() returns an alert object, the workflow opens an idempotent issue.
 *
 * Contract:
 *   detect() returns `null` (no alert) OR an object:
 *     {
 *       dedupLabel: string,   // unique label keeping the alert idempotent
 *       title: string,        // GitHub issue title
 *       body: string,         // GitHub issue body (markdown)
 *       labels?: string[],    // additional labels (default ['ready-for-pilot'])
 *       color?: string,       // hex (no #) for dedupLabel if missing (default B60205)
 *       description?: string, // dedupLabel description if missing
 *     }
 *
 * The alert is suppressed while any open issue carries `dedupLabel`. Close
 * the issue once the underlying condition is resolved.
 */

export async function detect() {
  // Example: poll an admin API for write-path errors.
  const apiUrl = process.env.MY_API_URL;
  if (!apiUrl) return null;

  const res = await fetch(`${apiUrl}/admin/errors?window=2h`);
  if (!res.ok) {
    console.error(`detector: API returned ${res.status}; skipping run.`);
    return null;
  }
  const { errors = [] } = await res.json();

  // Only alert on write-path 5xx — the kind of error that means user data
  // may have failed to persist.
  const writeErrors = errors.filter((e) =>
    ['PUT', 'POST'].includes(e.method) && e.status >= 500
  );
  if (!writeErrors.length) return null;

  const total = writeErrors.reduce((n, e) => n + e.count, 0);
  return {
    dedupLabel: 'data-loss',
    title: `Data-loss alert: ${total} failed write(s) in the last 2h`,
    body: [
      '**Automated alert** raised by `log-watch`.',
      '',
      `Write requests are failing with 5xx in the last 2h:`,
      ...writeErrors.map((e) => `- \`${e.method} ${e.path}\` ×${e.count} — _${e.message}_`),
      '',
      '_Close this issue once the failure is fixed. While it stays open, log-watch suppresses duplicate alerts._',
    ].join('\n'),
    color: 'B60205',
    description: 'Server-side write failure — user data may not be saving',
  };
}
