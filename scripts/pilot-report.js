#!/usr/bin/env node

/**
 * Pilot triage report — collects open `ready-for-pilot` issues, open PRs
 * claiming issues (blocklist), and the pilot's recent merge track record,
 * then outputs a markdown report on stdout for the pilot workflow.
 *
 * Tier classification is configurable: if `.github/pilot-tiers.json` exists
 * at the repo root, it's loaded as { tierName: regex[] }. Otherwise a
 * project-agnostic default is used (bug → docs → infra).
 *
 * If `scripts/pilot-report-extras.js` exists, this script imports it and
 * splices its `extrasMarkdown()` return value into the report — projects
 * that monitor their own KPIs or error logs can drop a custom module there
 * without forking this script.
 *
 * Required env:
 *   GH_TOKEN              — for the `gh` CLI (set by the workflow)
 * Optional env:
 *   PILOT_LABEL           — label on pilot-authored PRs (default: `pilot`)
 *   READY_LABEL           — label on actionable issues (default: `ready-for-pilot`)
 *   PILOT_AUTHOR          — github login of the pilot bot (default: empty,
 *                            disables the community-vs-self-filed distinction)
 *
 * Usage: node scripts/pilot-report.js > /tmp/pilot-report.md
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ISSUE_REF_RE = /(?:fixes|closes|resolves)\s+#(\d+)/gi;

const PILOT_LABEL = process.env.PILOT_LABEL || 'pilot';
const READY_LABEL = process.env.READY_LABEL || 'ready-for-pilot';
const PILOT_AUTHOR = process.env.PILOT_AUTHOR || '';

const DEFAULT_TIERS = {
  // Order matters: first match wins.
  '1': ['\\b(bug|broken|error|crash|fails?|exception|regression)\\b'],
  '2': ['\\b(a11y|accessib|keyboard|screen\\s*reader|voiceover|nvda|jaws|aria)\\b'],
  '3': ['\\b(ux|ui|usability|copy|label|tooltip|onboarding)\\b'],
  '4': ['\\b(perf|performance|slow|latency|memory|leak)\\b'],
  '5': ['\\b(deploy|ci|cd|infra|docker|build|release)\\b'],
};

function loadTierConfig() {
  const path = resolve(process.cwd(), '.github/pilot-tiers.json');
  if (!existsSync(path)) return DEFAULT_TIERS;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse .github/pilot-tiers.json: ${err.message}; falling back to defaults.`);
    return DEFAULT_TIERS;
  }
}

const TIERS = loadTierConfig();
const TIER_PATTERNS = Object.entries(TIERS).map(([tier, patterns]) => ({
  tier,
  re: new RegExp(patterns.join('|'), 'i'),
}));

function gh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    console.error(`gh ${args.join(' ')} failed:`, err.stderr?.toString() || err.message);
    return '';
  }
}

function ghJson(args) {
  const out = gh(args);
  if (!out) return [];
  try { return JSON.parse(out); } catch { return []; }
}

function linkedIssues(body) {
  if (!body) return [];
  const ids = new Set();
  for (const m of body.matchAll(ISSUE_REF_RE)) ids.add(Number(m[1]));
  return [...ids];
}

function classifyTier(issue) {
  const text = `${issue.title} ${issue.body || ''}`.toLowerCase();
  for (const { tier, re } of TIER_PATTERNS) {
    if (re.test(text)) return tier;
  }
  // Default tier = middle of the configured range.
  const tiers = Object.keys(TIERS).sort();
  return tiers[Math.floor(tiers.length / 2)] || '3';
}

function formatPilotTrackRecord(prs) {
  if (!prs.length) return '_No pilot PRs in the last 30 days._';

  const merged = prs.filter((p) => p.state === 'MERGED');
  const closed = prs.filter((p) => p.state === 'CLOSED');
  const open = prs.filter((p) => p.state === 'OPEN');
  const totalResolved = merged.length + closed.length;
  const mergeRate = totalResolved ? ((merged.length / totalResolved) * 100).toFixed(0) : 'N/A';

  const issueAttempts = new Map();
  for (const pr of prs) {
    for (const issueNum of linkedIssues(pr.body)) {
      if (!issueAttempts.has(issueNum)) issueAttempts.set(issueNum, []);
      issueAttempts.get(issueNum).push(pr);
    }
  }

  const loopedIssues = [];
  for (const [issueNum, attemptPrs] of issueAttempts) {
    const closedUnmerged = attemptPrs.filter((p) => p.state === 'CLOSED');
    if (closedUnmerged.length >= 2) {
      const prList = closedUnmerged.map((p) => `#${p.number}`).join(', ');
      loopedIssues.push(`- Issue #${issueNum}: ${closedUnmerged.length} closed-unmerged PRs (${prList}). **Do NOT re-attempt without new information from the reporter.**`);
    }
  }

  const lines = [
    `- Merged: ${merged.length} · Closed-unmerged: ${closed.length} · Open: ${open.length}`,
    `- Merge rate (of resolved): **${mergeRate}%**`,
  ];
  if (loopedIssues.length) {
    lines.push('', '### Looped issues (strong anti-signal)', ...loopedIssues);
  }
  return lines.join('\n');
}

function formatBlocklist(openPrs) {
  const blocked = new Set();
  const rows = [];
  for (const pr of openPrs) {
    const issues = linkedIssues(pr.body);
    for (const i of issues) blocked.add(i);
    const ref = issues.length ? issues.map((i) => `#${i}`).join(', ') : '_(no issue ref)_';
    const isPilot = (pr.labels || []).some((l) => l.name === PILOT_LABEL);
    const sourceTag = isPilot ? `\`${PILOT_LABEL}\`` : '_human_';
    const escapedTitle = pr.title.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
    rows.push(`| #${pr.number} | ${sourceTag} | ${escapedTitle} | ${ref} |`);
  }

  const marker = `<!-- PILOT_BLOCKLIST: ${[...blocked].sort((a, b) => a - b).join(',')} -->`;

  if (!openPrs.length) {
    return `${marker}\n_No open PRs claim any issue. Nothing is blocked._`;
  }

  const table = [
    '| Open PR | Source | Title | Linked issues |',
    '|---------|--------|-------|---------------|',
    ...rows,
  ].join('\n');

  const blockedList = blocked.size
    ? `**Issues blocked from re-picking:** ${[...blocked].sort((a, b) => a - b).map((i) => `#${i}`).join(', ')}`
    : '_No issues linked from open PRs._';

  return `${marker}\n\n${blockedList}\n\n${table}\n\n**Rule:** Do NOT open a PR that references any blocked issue — including issues already claimed by a human-authored PR. If the best signal points at a blocked issue, pick a different signal or SKIP.`;
}

function formatReadyIssues(issues, closedPilotPrs) {
  if (!issues.length) return `_No \`${READY_LABEL}\` issues today._`;

  const attemptedIssues = new Map();
  for (const pr of closedPilotPrs) {
    for (const issueNum of linkedIssues(pr.body)) {
      if (!attemptedIssues.has(issueNum)) attemptedIssues.set(issueNum, []);
      attemptedIssues.get(issueNum).push(pr.number);
    }
  }

  const byTier = new Map();
  for (const issue of issues) {
    const tier = classifyTier(issue);
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(issue);
  }

  const sections = [];
  for (const tier of [...byTier.keys()].sort()) {
    sections.push(`### Tier ${tier}`);
    const tierIssues = byTier.get(tier);
    // When PILOT_AUTHOR is configured, list community-authored issues first.
    const community = PILOT_AUTHOR
      ? tierIssues.filter((i) => i.author?.login !== PILOT_AUTHOR)
      : tierIssues;
    const selfFiled = PILOT_AUTHOR
      ? tierIssues.filter((i) => i.author?.login === PILOT_AUTHOR)
      : [];
    for (const issue of [...community, ...selfFiled]) {
      const attempted = attemptedIssues.get(issue.number);
      const attemptNote = attempted?.length
        ? ` — ⚠️ previously attempted in closed PRs: ${attempted.map((n) => `#${n}`).join(', ')}`
        : '';
      const authorTag = PILOT_AUTHOR && issue.author?.login === PILOT_AUTHOR
        ? ' _(self-filed)_'
        : ` (by @${issue.author?.login || 'unknown'})`;
      sections.push(`- #${issue.number}: ${issue.title}${authorTag}${attemptNote}`);
    }
  }
  return sections.join('\n');
}

async function loadExtras() {
  const path = resolve(process.cwd(), 'scripts/pilot-report-extras.js');
  if (!existsSync(path)) return '';
  try {
    const mod = await import(pathToFileURL(path).href);
    if (typeof mod.extrasMarkdown !== 'function') {
      console.error('pilot-report-extras.js does not export `extrasMarkdown()`; skipping.');
      return '';
    }
    return await mod.extrasMarkdown();
  } catch (err) {
    console.error(`pilot-report-extras.js failed: ${err.message}`);
    return `## Extras\n\n_Extras script threw: ${err.message}_`;
  }
}

async function main() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const pilotPrs = ghJson([
    'pr', 'list',
    '--label', PILOT_LABEL,
    '--state', 'all',
    '--limit', '50',
    '--json', 'number,title,state,body,createdAt,mergedAt,closedAt',
    '--search', `created:>=${thirtyDaysAgo.slice(0, 10)}`,
  ]);
  const closedPilotPrs = pilotPrs.filter((p) => p.state === 'CLOSED');

  // Blocklist needs every open PR that references an issue, not just
  // pilot-labelled ones, so maintainer-authored PRs also block.
  const allOpenPrs = ghJson([
    'pr', 'list',
    '--state', 'open',
    '--limit', '100',
    '--json', 'number,title,body,labels',
  ]);
  const openIssueLinkedPrs = allOpenPrs.filter((p) => linkedIssues(p.body).length > 0);

  const readyIssues = ghJson([
    'issue', 'list',
    '--state', 'open',
    '--label', READY_LABEL,
    '--limit', '30',
    '--json', 'number,title,body,createdAt,author',
  ]);

  const extras = await loadExtras();

  const report = `# Pilot Report — ${new Date().toISOString().slice(0, 10)}

${extras ? `${extras}\n\n` : ''}## Open PRs claiming issues (BLOCKLIST)

${formatBlocklist(openIssueLinkedPrs)}

## Pilot track record (last 30 days)

${formatPilotTrackRecord(pilotPrs)}

## Open \`${READY_LABEL}\` issues (tier-classified)

${formatReadyIssues(readyIssues, closedPilotPrs)}
`;

  process.stdout.write(report);
}

main().catch((err) => {
  console.error('pilot-report failed:', err.message);
  process.exit(1);
});
