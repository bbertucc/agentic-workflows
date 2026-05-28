# Blake's Agentic Workflows

GitHub Actions workflows for running [Claude Code](https://docs.claude.com/en/docs/claude-code) as an autonomous engineering teammate on your repo: PR reviewer, issue triager, daily pilot, and detector alarms — all powered by [`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action).

Originally extracted from [plato](https://github.com/1111philo/plato), where these workflows have been running in production against real users since 2025.

## What's in the box

| Workflow | Trigger | What it does |
|---|---|---|
| `code-review.yml` | PR opened/synchronized/ready | Skeptical code review on every commit; per-commit idempotent |
| `revise.yml` | Reviewer requests changes on bot-labeled PR | One-shot fixup commit |
| `issue-intake.yml` | Issue opened/reopened/commented | Triage → `ready-for-pilot`, `needs-info`, `needs-decomposition`, or close |
| `issue-intake-sweep.yml` | Every 6 hours | Backstop for failed intake runs |
| `needs-info-rescan.yml` | Weekday mornings (Sun–Thu) | Catches reporter replies that didn't fire `issue_comment` |
| `pilot.yml` | Weekday mornings (Sun–Thu) + manual | Picks one `ready-for-pilot` issue, opens a PR (or SKIPs) |
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

If you use `code-review.yml` as a required check, you need to prevent the bot from self-approving pilot PRs. The `claude[bot]` account can post reviews, including approving ones — without extra config, an approving bot review can satisfy a "1 approving review required" rule on a pilot-authored PR, meaning the bot can effectively merge itself.

Set branch protection on your default branch with **all** of:

- **Require a pull request before merging** (always)
- **Require approvals** — set count to 1+
- **Require review from Code Owners** — and create a `CODEOWNERS` file listing only humans:
  ```
  # .github/CODEOWNERS
  * @your-github-username @another-maintainer
  ```
  This guarantees a human approval is needed regardless of what bots do.
- **Dismiss stale pull request approvals when new commits are pushed** — so the revise workflow's fixup commit invalidates any prior bot approval.
- **Require status checks to pass before merging**, with the `review` check (or whatever your code-review job is named) selected.
- **Do not allow bypassing the above settings** — except for repo admins explicitly added to the bypass list for emergencies.
- No force pushes, no deletion.

The combined effect: a pilot PR needs (a) a passing bot review (status check), (b) a human CODEOWNER approval, and any subsequent commit invalidates (b) so the human re-approves.

## Cost notes

The default models are Bedrock cross-region inference profiles: Sonnet 4.5 for review/pilot, Haiku 4.5 for intake/revise. Haiku is ~3× cheaper and plenty for classification and mechanical fixups; if intake or revise quality regresses on your repo, swap to Sonnet in `MODEL_INTAKE` / `MODEL_REVISE`.

Wall-clock budgets via `timeout-minutes` on the review job (12 min) and `--max-turns` caps on the others bound spend per run.

## Origin

These workflows were extracted from [plato](https://github.com/1111philo/plato) — an open-source AI-powered microlearning platform. The original incident history that shaped each workflow (why the per-commit guard, why the dup-blocklist, why the data-loss interrupt) lives in [plato's `docs/AUTOMATION.md`](https://github.com/1111philo/plato/blob/main/docs/AUTOMATION.md).

