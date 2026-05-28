# Contributing to agentic-workflows

Thanks for considering a contribution. This repo is a **template** — most of the surface area is GitHub Actions workflow YAML and a few small Node scripts. There's no build step and no runtime.

## What contributions help

- **Bug fixes** in the helper scripts (`scripts/*.js`) or the workflow YAML
- **Prompt improvements** for the agents (code-review, intake, pilot, revise) — informed by real failure modes you've seen on your repo
- **New examples** under `examples/` showing how to use the extension points (`pilot-report-extras.js`, `log-watch-detector.js`, `pilot-tiers.json`)
- **Doc fixes** — typos, broken links, anything that confused you on first read
- **New tier classifier presets** for languages/frameworks not covered by the default
- **Cross-platform fixes** — the cron parsers and a few `date -u -d` invocations have macOS-specific fallbacks; report Linux/Windows-runner breakage

## What's out of scope (for now)

- A second AI provider integration beyond Bedrock / Anthropic API (the workflows use `anthropics/claude-code-action` exclusively)
- A web UI for configuration — everything is repo secrets/variables
- Auto-detection of project type to pick a `TEST_COMMAND`

If you want one of these, open an issue first to discuss before opening a PR.

## Development setup

There's nothing to install. The scripts run with Node 20+ and require only `gh` (GitHub CLI). To test changes locally:

```bash
# Validate YAML syntax
for f in .github/workflows/*.yml; do
  python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "OK: $f" || echo "FAIL: $f"
done

# Validate JS syntax
for f in scripts/*.js examples/*.js; do
  node --check "$f" && echo "OK: $f"
done

# Dry-run a script against a real repo (requires `gh auth status` to be working):
cd /path/to/some/repo-with-issues
GH_TOKEN=$(gh auth token) node /path/to/agentic-workflows/scripts/intake-sweep.js
```

`scripts/pilot-report.js` writes to stdout; you can preview the report it would generate by running it inside a repo that has some open issues and PRs.

## Testing workflow changes end-to-end

The cleanest way to test a workflow change:

1. Fork this repo
2. Edit the workflow in your fork
3. Apply the workflow to a throwaway test repo via the "Use this template" flow (or copy files in)
4. Configure the secrets/variables (or skip auth secrets to fail fast)
5. Open a test issue or PR to trigger the workflow

The action itself logs verbosely (`show_full_output: true` is set on the agent steps), so failures are usually obvious in the Actions run.

## PR conventions

- **One thing per PR.** A workflow change and a doc change can ship together if the doc change *describes* the workflow change. Otherwise split them.
- **Update the docs alongside the code.** If you change a workflow's behavior, the relevant page in `docs/` and the entries in `README.md` / `CONFIGURATION.md` need to stay in sync. Doc-only or code-only PRs that should have updated the other side are likely to bounce.
- **Run the syntax checks above** before pushing.
- **Self-review the diff** before requesting review.
- **Keep prompts short and explicit.** Agent prompts are load-bearing — verbose hedging burns turns and confuses the model. If you add to a prompt, be ready to defend each sentence.

## Reporting bugs

Open an issue with:

- Which workflow / script the bug is in
- A pointer to a public Actions run that shows it (logs help enormously)
- What you expected vs. what happened
- Your auth mode (Bedrock OIDC or Anthropic API) and model IDs

For security issues (credential exposure, prompt-injection paths in the workflows, etc.), please contact the maintainer privately via GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) on this repo rather than opening a public issue.
