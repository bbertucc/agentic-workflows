# issue-intake.yml + intake-sweep + needs-info-rescan

A three-workflow suite that triages every issue into an actionable state. The goal: every issue ends up with one of `ready-for-pilot`, `needs-info`, `needs-decomposition`, or closed-as-spam. No issue is left untagged.

## The three workflows

### `issue-intake.yml`

Runs on every new issue (`opened`), reopen, comment on a `needs-info` issue, and manual dispatch. Classifies the issue and applies a label (and a comment when soliciting more info).

**Outcomes:**
- **A. Already actionable** — names something concrete (exact string, error message, named component + observed-vs-expected). → `ready-for-pilot` + confirmation comment.
- **B. Needs info** — genuine but vague. → `needs-info` + ≤3 focused clarifying questions.
- **C. Spam / off-topic** — closed with a polite "reopen if we misread it" message.

**Bias toward B.** A false-positive `needs-info` is cheap (reporter clarifies); a false-positive `ready-for-pilot` fuels pilot loops on issues the agent doesn't understand.

**Re-run guard.** Handles reopens, comment replies on `needs-info`, and `needs-decomposition` → split-into-new-issues confirmation. See the prompt body for the full state machine.

### `issue-intake-sweep.yml`

Backstop. Runs every 6 hours. If an on-open intake run *failed* (e.g. a transient `claude-code-action` internal error), the issue is left with no intake label and silent. The sweep finds those gaps and re-dispatches intake on each. Self-healing.

**Why it exists.** plato lost the visibility of issue #193 to a transient action failure; the pilot only picks labeled issues, so the issue was invisible to the whole pipeline until a human noticed.

### `needs-info-rescan.yml`

Daily backstop for the `issue_comment` trigger. GitHub's `issue_comment` event isn't 100% reliable. This script lists open `needs-info` issues, finds any with a non-bot comment newer than the last `claude[bot]` comment, and re-dispatches intake on each.

## Labels

The workflows auto-create three labels:

| Label | Color | Meaning |
|---|---|---|
| `ready-for-pilot` | green | Triaged; enough info for the pilot or a human to act on |
| `needs-info` | purple | Agent asked the reporter for more details |
| `needs-decomposition` | yellow | Real request, too broad for one PR — split into smaller issues |

If you want different names, edit the `gh label create` lines and the prompt references. (The `READY_LABEL` variable only affects what the pilot looks for; intake doesn't currently honor it for the apply step — open issue if you need this.)

## Cost

Intake runs on **Haiku** by default. Classification + ≤3 questions is well within Haiku's reasoning headroom; Sonnet would be ~3× the cost for no quality gain. If your repo gets epic-length issues that need decomposition, you can swap to Sonnet via `MODEL_INTAKE`.

## What the agent will NOT do

These rules are baked into the intake prompt:

- Won't close issues except in outcome C (spam / off-topic). Low-effort or vague reports are NOT spam.
- Won't add labels other than the three intake labels.
- Won't engage bot-authored issues (filtered by the job's `if:` condition).
- Won't lecture or offer design opinions. This is intake, not review.
- Won't `@`-mention anyone.
- Won't look at other issues — sticks to the one it was triggered on.
- Won't ask the reporter to look at code ("which file is affected?") — that's the pilot's job.
