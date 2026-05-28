#!/usr/bin/env node

/**
 * log-watch — generic "detector → idempotent GitHub issue" runner.
 *
 * Imports `scripts/log-watch-detector.js` (which the consumer repo provides)
 * and asks it whether to alert. If the detector says yes AND no open issue
 * already carries its dedup label, it opens one. Idempotent: while an issue
 * is open, the alert is suppressed — close the issue once the underlying
 * condition is resolved.
 *
 * The detector must default-export — or named-export `detect` —
 * an async function that returns either `null` (no alert) or:
 *
 *   {
 *     dedupLabel: string,   // e.g. 'data-loss'
 *     title: string,        // issue title
 *     body: string,         // issue body (markdown)
 *     labels?: string[],    // additional labels (defaults to ['ready-for-pilot'])
 *     color?: string,       // hex color for dedupLabel if it must be created
 *     description?: string, // label description
 *   }
 *
 * Required env:
 *   GH_TOKEN — for the `gh` CLI (set by the workflow)
 * Plus anything the detector reads from env (API URLs, tokens, etc.).
 *
 * Usage: node scripts/log-watch.js
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

async function loadDetector() {
  const path = resolve(process.cwd(), 'scripts/log-watch-detector.js');
  if (!existsSync(path)) {
    throw new Error('scripts/log-watch-detector.js not found. See examples/log-watch-detector-template.js.');
  }
  const mod = await import(pathToFileURL(path).href);
  const fn = mod.detect || mod.default;
  if (typeof fn !== 'function') {
    throw new Error('log-watch-detector.js must export `detect` or default-export a function.');
  }
  return fn;
}

function ensureLabel(name, color, description) {
  try {
    const args = ['label', 'create', name];
    if (color) args.push('--color', color);
    if (description) args.push('--description', description);
    gh(args);
  } catch { /* already exists */ }
}

async function main() {
  const detect = await loadDetector();
  const alert = await detect();
  if (!alert) {
    console.log('log-watch: no alert from detector.');
    return;
  }

  const { dedupLabel, title, body, labels = ['ready-for-pilot'], color = 'B60205', description } = alert;
  if (!dedupLabel || !title || !body) {
    throw new Error('Detector returned an alert object missing required fields (dedupLabel, title, body).');
  }

  // Idempotency: only one open issue per dedupLabel at a time.
  const open = JSON.parse(
    gh(['issue', 'list', '--label', dedupLabel, '--state', 'open', '--json', 'number']) || '[]',
  );
  if (open.length) {
    console.log(`log-watch: condition detected; issue #${open[0].number} already open for label \`${dedupLabel}\` — not duplicating.`);
    return;
  }

  ensureLabel(dedupLabel, color, description);
  for (const l of labels) ensureLabel(l);

  const args = ['issue', 'create', '--title', title, '--body', body, '--label', dedupLabel];
  for (const l of labels) { args.push('--label', l); }
  const out = gh(args);
  console.log(`log-watch: opened issue — ${out.trim()}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('log-watch failed:', err.message);
    process.exit(1);
  });
}
