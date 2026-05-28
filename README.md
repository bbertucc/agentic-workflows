# agentic-workflows

GitHub Actions workflows for running [Claude Code](https://docs.claude.com/en/docs/claude-code) as an autonomous engineering teammate on your repo: PR reviewer, issue triager, daily pilot, and detector alarms — all powered by [`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action).

Originally extracted from [plato](https://github.com/1111philo/plato), where these workflows have been running in production against real users since 2025.

## What's in the box

| Workflow | Trigger | What it does |
|---|---|---|
| `code-review.yml` | PR opened/synchronized/ready | Skeptical code review on every commit; per-commit idempotent |
| `revise.yml` | Reviewer requests changes on bot-labeled PR | One-shot fixup commit |
| `issue-intake.yml` | Issue opened/reopened/commented | Triage → `ready-for-pilot`, `needs-info`, `needs-decomposition`, or close |
| `issue-intake-sweep.yml` | Every 6 hours | Backstop for failed intake runs |
| `needs-info-rescan.yml` | Daily | Catches reporter replies that didn't fire `issue_comment` |
| `pilot.yml` | Daily cron + manual | Picks one `ready-for-pilot` issue, opens a PR (or SKIPs) |
| `log-watch.yml` | Every 2 hours | Runs your detector script; opens an idempotent issue when it fires |

## Quickstart

1. **Use this repo as a template.** Click "Use this template" on GitHub, or copy the workflow files you want into your repo's `.github/workflows/`.

2. **Choose an auth mode** and add the secret(s) in repo Settings → Secrets and variables → Actions:
   - **Bedrock OIDC (preferred):** add `AWS_BEDROCK_ROLE_ARN` — an IAM role your repo can assume that has `bedrock:InvokeModel` on the model IDs you'll use. Requires Bedrock model access in `us-east-1`, `us-east-2`, and `us-west-2` (cross-region inference).
   - **Anthropic API:** add `ANTHROPIC_API_KEY`.

   If both are set, Bedrock wins. The workflow auto-detects.

3. **Set repo variables** (Settings → Secrets and variables → Actions → Variables). All optional with sensible defaults:

   | Variable | Default | Purpose |
   |---|---|---|
   | `PROJECT_NAME` | repo name | Friendly name used in agent prompts |
   | `TEST_COMMAND` | _(skip)_ | Shell to verify changes, e.g. `npm test` or `cd server && npm ci && npm test` |
   | `AWS_REGION` | `us-east-2` | Bedrock region |
   | `MODEL_REVIEW` | Sonnet 4.5 (Bedrock) | Reviewer model id |
   | `MODEL_INTAKE` | Haiku 4.5 (Bedrock) | Intake model id |
   | `MODEL_PILOT` | Sonnet 4.5 (Bedrock) | Pilot model id |
   | `MODEL_REVISE` | Haiku 4.5 (Bedrock) | Revise model id |
   | `PILOT_LABEL` | `pilot` | Label on pilot-authored PRs |
   | `READY_LABEL` | `ready-for-pilot` | Label on actionable issues |
   | `PILOT_AUTHOR` | _(none)_ | GitHub login of the pilot bot (enables the community-vs-self-filed distinction in reports) |

4. **(Optional) Drop in project files** the agents will read:
   - `.github/PILOT_GUIDELINES.md` — anti-goals, higher-risk surfaces, severity interrupts. See `examples/PILOT_GUIDELINES.md`.
   - `.github/pilot-tiers.json` — override the tier classifier regex. See `examples/pilot-tiers.json`.
   - `scripts/pilot-report-extras.js` — append KPI snapshots or custom monitors to the pilot's daily report. See `examples/pilot-report-extras-template.js`.
   - `scripts/log-watch-detector.js` — required for `log-watch.yml` to do anything. See `examples/log-watch-detector-template.js`.

5. **Merge a test PR** to verify code-review fires. Open a test issue to verify intake fires. The pilot will run on its next cron tick (or trigger via `gh workflow run pilot.yml`).

## Configuration reference

See [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md).

## Per-workflow deep dives

- [`docs/code-review.md`](docs/code-review.md)
- [`docs/issue-intake.md`](docs/issue-intake.md)
- [`docs/pilot.md`](docs/pilot.md)
- [`docs/log-watch.md`](docs/log-watch.md)
- [`docs/auth.md`](docs/auth.md) — Bedrock OIDC and Anthropic API setup

## Branch protection recommendation

If you use `code-review.yml` as a required check, also use it as a required reviewer. Combine with:

- Required PR + 1 approving review
- Required status check: `review` (or whatever your workflow's job is named)
- No force pushes, no deletion

Admins should be on the bypass list for emergencies.

## Cost notes

The default models are Bedrock cross-region inference profiles: Sonnet 4.5 for review/pilot, Haiku 4.5 for intake/revise. Haiku is ~3× cheaper and plenty for classification and mechanical fixups; if intake or revise quality regresses on your repo, swap to Sonnet in `MODEL_INTAKE` / `MODEL_REVISE`.

Wall-clock budgets via `timeout-minutes` on the review job (12 min) and `--max-turns` caps on the others bound spend per run.

## Origin

These workflows were extracted from [plato](https://github.com/1111philo/plato) — an open-source AI-powered microlearning platform. The original incident history that shaped each workflow (why the per-commit guard, why the dup-blocklist, why the data-loss interrupt) lives in [plato's `docs/AUTOMATION.md`](https://github.com/1111philo/plato/blob/main/docs/AUTOMATION.md).

## License

Copyright (C) 2026 University of Illinois Chicago.

Licensed under the [GNU Affero General Public License v3.0](LICENSE). If you modify these workflows and run them as part of a service made available over a network, you must offer the modified source to users of that service.
