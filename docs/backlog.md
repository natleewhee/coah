# Backlog

Informal running list of known issues and improvement ideas that came up
outside a formal plan (see `docs/plans/` for those). Not prioritized,
not scheduled — just things worth not forgetting. Move an item into a
proper plan doc when it's ready to be worked.

## UI/UX

Surfaced by a full audit of the rendered app (10 pages × light/dark ×
375/1440px) on 2026-09-08. The contrast, control-border, and
mode-reactive-token defects from that audit shipped in PR #11; these are
what's left.

- **MyLedger is a single ~9,200px page of ~20 inputs.** `/ledger`'s
  "Your current position" + assumptions form has no progressive
  disclosure — everything renders at once regardless of which fields the
  user actually needs. Needs a design decision (accordion sections? a
  stepper? collapse-by-default with synced-value previews?) before it's
  buildable, not a quick fix.
- **Assumption-bundle table doesn't reflow on mobile.** `/ledger`'s
  Conservative/Base/Optimistic grid is a fixed multi-column table that
  squashes at 375px. Needs a real mobile layout (stacked cards?), not
  just a breakpoint tweak.
- **Car names truncate in DriveReady's best-sellers list.** e.g. "Toyota
  Corol…" on the `/drive` step-1 car picker at 375px — truncating the
  one thing the user is choosing between. Needs either a layout change
  (wrap instead of truncate) or shorter display names.
- **~35 uses of 10-11px type in Drive and Flow.** Legible now that PR
  #11 fixed contrast, but under most mobile type-size guidelines (16px
  body / 12px floor is the usual recommendation). Broad pass, not a
  single fix.
- **DriveReady's header wraps to two rows at 375px.** The tool switcher
  + "Car prices indicative" + mode toggle + "Renew or Replace?" + "The
  Math" links don't fit one row on a small phone. Cosmetic crowding, not
  breaking, but inconsistent with how tight the rest of the mobile
  layout is.

## From earlier code review (2026-09-06)

- `.github/workflows/refresh-data.yml` uses `gh pr merge --admin` to
  bypass branch protection on its own weekly auto-merge PRs. Deliberate
  and already documented at length in the file's own header (bot PRs
  never trigger `pull_request`-scoped CI, so a required check could
  never appear on them) — not a bug, but worth tightening later if
  GitHub adds a narrower bypass mechanism (e.g. an allowlist scoped just
  to this bot) than blanket admin override.
