# code-review.yml

A skeptical PR reviewer powered by `claude-code-action`. Runs on every PR event (opened, synchronized, ready_for_review) and posts exactly one review per commit.

## Behavior

- **Per-commit idempotent.** Guard step queries existing reviews and skips if a `claude[bot]` review already exists for the current head sha. New commits get reviewed; re-running on the same commit doesn't double-post.
- **Draft PRs are skipped.** Workflow only fires when the PR is Ready. `workflow_dispatch` and the `ready_for_review` transition force a review even from Draft state. Matches the recommended PR flow (open as Draft for iteration; mark Ready when reviewable).
- **Dependabot PRs are skipped.** Lint/test jobs gate those.
- **Pre-built context dump.** Before invoking the agent, the workflow assembles `/tmp/review-context.md`: PR metadata, full diff vs. base, list of changed files, full source of each changed file (size-capped), and test output (if `TEST_COMMAND` is set). This saves the agent ~5–10 turns it would otherwise spend running `gh pr diff`, `git diff`, and `npm test`.
- **Verify step.** After the agent runs, the workflow re-queries reviews. If no `claude[bot]` review exists for HEAD, the job fails loudly. This is because `claude-code-action` can exit successfully without calling `gh pr review`, leaving the PR unreviewed and any required-check green.
- **Wall-clock budget.** `timeout-minutes: 12` bounds spend. (Turn caps were dropped because thorough reviews routinely hit them mid-investigation and exited without posting.)
- **`display_report` is disabled** in the action config. It auto-aggregates inline annotations into a review at session-end, which races with the explicit `gh pr review` call in the prompt and double-posts.

## Customizing the prompt

The reviewer prompt is inline in the workflow file. Common customizations:

- **Add "must flag" categories.** Edit the prompt's "What to look for" section.
- **Reference project docs.** The prompt already reads `CLAUDE.md`, `AGENTS.md`, `REVIEW.md`, and `CONTRIBUTING.md` if they exist. Add your own conventions there rather than editing the prompt.
- **Change tone.** Default is "skeptical." Edit the first line if you want a different stance.

## Live-user impact framing

Every review ends with a `User impact: low / medium / high` summary line. This was added because plato auto-deploys to production on merge to `main` — the review is the last human-free checkpoint. If your project doesn't auto-deploy on merge, this line is harmless context but you may want to drop it from the prompt.

## Fork PRs are not reviewed (intentional)

The workflow triggers on `pull_request`, **not** `pull_request_target`. This is a deliberate security choice: `pull_request_target` runs in the base-repo context with access to repo secrets and a privileged `GITHUB_TOKEN`, while checking out PR-author-controlled code — a classic exfiltration vector if any step ever evaluates that code.

Side effect: PRs from forks run without access to `AWS_BEDROCK_ROLE_ARN` / `ANTHROPIC_API_KEY`. The auth step proceeds with empty credentials, the agent step fails, and the verify step then fails the job loudly. The PR shows a failing `review` check.

For projects that accept fork contributions, options:

1. **Manually re-run review on each fork PR after a quick sanity check.** Trigger via `gh workflow run code-review.yml --ref <fork-branch> -f pr_number=<n>` from the base repo — `workflow_dispatch` runs in the base context and gets secrets, and the PR-fetch is from your own remote.
2. **Use a maintainer-mediated workflow.** Require fork PRs to be re-opened from a base-repo branch before the bot reviews.
3. **Do not use `pull_request_target` as a workaround.** It is not safe with the current claude-code-action tool permissions.

## Re-running on demand

```bash
gh workflow run code-review.yml --ref <branch> -f pr_number=<n>
```

The guard step still applies — it will skip if a review already exists for HEAD. To force a re-review, delete the existing review first via the GitHub UI.

## Required checks

If you make the `review` job a required status check on your default branch:

- The verify step's `exit 1` on missing review correctly fails the required check (rather than silently passing)
- Pair the status check with **Require review from Code Owners** + a humans-only CODEOWNERS file, so the bot's approving review can't satisfy a "1 approving review" rule on a pilot-authored PR. See the README's "Branch protection recommendation" section for the full set of settings.
- Admins should remain on the bypass list for emergencies
