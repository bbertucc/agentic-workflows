# Configuration reference

All configuration is via GitHub repository **secrets** (sensitive) and **variables** (non-sensitive). Settings → Secrets and variables → Actions.

## Secrets

| Secret | Required? | Used by | Purpose |
|---|---|---|---|
| `AWS_BEDROCK_ROLE_ARN` | One of these | All AI workflows | IAM role assumed via OIDC for Bedrock |
| `ANTHROPIC_API_KEY` | One of these | All AI workflows | Anthropic API key (fallback when Bedrock role unset) |
| `GITHUB_TOKEN` | Auto | All | Provided by Actions; no setup needed |

If both auth secrets are set, the workflows use Bedrock. To switch to API mode, delete `AWS_BEDROCK_ROLE_ARN`.

## Variables

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `PROJECT_NAME` | `${{ github.event.repository.name }}` | All | Friendly name injected into agent prompts |
| `TEST_COMMAND` | _(empty — skip)_ | code-review, revise, pilot | Shell to run tests, e.g. `npm test` |
| `AWS_REGION` | `us-east-2` | All (when using Bedrock) | Bedrock region |
| `MODEL_REVIEW` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | code-review | Reviewer model id |
| `MODEL_INTAKE` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | issue-intake | Intake model id |
| `MODEL_PILOT` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | pilot | Pilot model id |
| `MODEL_REVISE` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | revise | Revise model id |
| `PILOT_LABEL` | `pilot` | pilot, revise | Label on pilot-authored PRs |
| `READY_LABEL` | `ready-for-pilot` | pilot only | Label the pilot looks for. **Intake hardcodes `ready-for-pilot`** — to rename across the suite, edit the `gh label create` lines and prompt references in `issue-intake.yml` as well. |
| `PILOT_AUTHOR` | _(empty)_ | pilot | GitHub login of the pilot bot (e.g. `my-project-pilot`); enables community-vs-self-filed distinction in reports |

### Anthropic API model IDs

When using `ANTHROPIC_API_KEY` instead of Bedrock, set the `MODEL_*` variables to API model IDs instead of Bedrock inference profile IDs:

- `claude-sonnet-4-5-20250929` (Sonnet 4.5)
- `claude-haiku-4-5-20251001` (Haiku 4.5)

## Optional repo files

These are checked into the consuming repo at the paths shown. The workflows look for them at runtime; absence is fine.

| Path | Read by | Purpose |
|---|---|---|
| `.github/PILOT_GUIDELINES.md` | pilot agent | Anti-goals, higher-risk surfaces, severity interrupts |
| `.github/pilot-tiers.json` | scripts/pilot-report.js | Tier-classifier regex override (`{ tier: regex[] }`) |
| `scripts/pilot-report-extras.js` | scripts/pilot-report.js | Appends custom markdown to the pilot's daily report |
| `scripts/log-watch-detector.js` | scripts/log-watch.js | Detector for log-watch — required for that workflow to do anything |
| `CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING.md` / `REVIEW.md` / `README.md` | All AI workflows | Project conventions; each agent reads whichever exist. Code-review also reads `REVIEW.md`; intake reads `README.md` for project overview |

## Cron schedules

GitHub doesn't expand `vars.X` in `cron:` expressions, so changing cadence means editing the workflow file directly. Current defaults:

- `pilot.yml` — `11 16 * * 0-4` (Sun–Thu 11:11 AM ET)
- `log-watch.yml` — `37 */2 * * *` (every 2 hours)
- `issue-intake-sweep.yml` — `23 */6 * * *` (every 6 hours)
- `needs-info-rescan.yml` — `0 13 * * 0-4` (Sun–Thu ~8 AM ET)

## Branch / label customization

If your repo already uses `pilot` or `ready-for-pilot` for something else, override via `PILOT_LABEL` / `READY_LABEL` variables. Workflows that create labels at runtime (`gh label create ... 2>/dev/null || true`) honor the configured names.
