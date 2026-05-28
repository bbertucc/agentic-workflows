/**
 * Template for scripts/pilot-report-extras.js
 *
 * Copy this to scripts/pilot-report-extras.js in your repo and customize.
 * The pilot-report script imports it and splices the returned markdown into
 * each daily report. Use this to surface project-specific signals: KPI
 * snapshots, error monitors, severity interrupts, etc.
 *
 * Contract:
 *   export async function extrasMarkdown(): Promise<string>
 *
 * Return any markdown you want appended near the top of the report. Whatever
 * you put here becomes context the pilot agent sees.
 *
 * If you mark a section as a SEVERITY INTERRUPT and document the rule in
 * .github/PILOT_GUIDELINES.md, the agent will treat it as outranking the
 * issue queue. See plato's docs/AUTOMATION.md for the original pattern.
 */

export async function extrasMarkdown() {
  const apiUrl = process.env.MY_API_URL;
  if (!apiUrl) return '';

  // Example: fetch KPI snapshot from your admin API.
  const res = await fetch(`${apiUrl}/admin/stats`, {
    headers: { Authorization: `Bearer ${process.env.MY_API_TOKEN}` },
  });
  if (!res.ok) {
    return `## KPI snapshot\n\n_Stats API returned ${res.status}; skipped._`;
  }
  const stats = await res.json();

  return [
    '## KPI snapshot',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Total users | ${stats.totalUsers} |`,
    `| Active sessions (24h) | ${stats.activeSessions} |`,
    `| Error rate (last hour) | ${stats.errorRate}% |`,
  ].join('\n');
}
