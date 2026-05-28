# PILOT_GUIDELINES.md template

Copy this to `.github/PILOT_GUIDELINES.md` in your repo. The pilot agent reads
it each run. Use it to encode project-specific rules that you'd otherwise have
to bake into the workflow YAML.

## Anti-goals (hard rules — never violate)

List behaviors the pilot must never introduce, even if a signal seems to ask
for it. Be specific. Example (from plato):

- **Never introduce hard cutoffs on user sessions.** Our product's UX
  philosophy is "move people, not force people."
- **Never tighten timeout/rate-limit constants** as a fix for over-target
  KPIs. Tune the underlying experience instead.
- **Never claim issues labeled `extension-point`** — those change the
  public plugin contract and require maintainer judgment.

## Higher-risk surfaces — narrow scope, avoid when possible

List files/paths where regressions break live users. The pilot will weight
risk against signal value before picking. Example:

- `server/routes/sessions.js` — in-flight session state
- `server/routes/auth.js`, JWT/refresh-token handling — a bug logs everyone out
- Anything in `migrations/` or that touches the database schema

## Lower-risk surfaces — prefer these when picking scope

- UI copy, labels, aria attributes, CSS
- Admin-only pages
- Tests, logging, observability

## Severity interrupt

Document any signal that should outrank the entire issue queue. The pilot
checks `/tmp/pilot-report.md` extras for these. Example:

> If extras shows a `data-loss` alert (write requests failing server-side),
> treat as severity 0: fix it or SKIP with `SKIP: ESCALATING …`. Never
> defer silently.

## Strategic priorities

If you want tie-breaking beyond the configured tiers, write it here. Example:

> Work that serves end users directly beats work that cleans up infra. When
> a high-count infra error and a concrete UX bug are both available, pick
> the UX bug.
