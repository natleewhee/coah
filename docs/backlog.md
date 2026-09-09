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

## Design taste (taste-skill audit, 2026-09-09)

Ran the anti-slop checklist from
[Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) against
all 8 verticals' landing pages (rendered at 1440px, light + dark). Not
bugs — these are "reads as templated/generic" findings, all evidenced
against the actual source, not just the rubric's hard-ban list.

- **The exact same hero shell is copy-pasted across 6 of 8 verticals.**
  `background: C.ndtm, padding: '48px 32px 52px', textAlign: 'center'`
  appears verbatim in `drive`, `house`, `flow`, `retire`, `tax`, and
  `ledger`'s `page.js` — same eyebrow-label-then-centered-h1-then-italic-
  subtext anatomy each time. `etf` and `insure` don't share the literal
  string but use the identical visual pattern with inline styles. This
  is precisely taste-skill's "no centered hero by default" ban, and
  it's systemic rather than one page's choice.
- **A single shared `TrustBadges` component renders an identical
  4-pill trust row under every hero**, ending in the same two pills
  verbatim every time: `'Zero data collected', 'Free, forever'`
  (`drive`, `house`, `flow`, `ledger`, `retire`, `tax` — see
  `src/app/*/page.js` call sites). `etf`/`insure` use their own
  4-pill row in the same slot (`No sign-up / No data stored / No ads /
  No commissions`). This is the generic SaaS "trust badge row" pattern
  the skill flags, repeated 8 times with only the words swapped.
- **Duplicate CTA copy template.** `etf` and `insure` both render
  `"Check my {noun} — it's free"` as their primary CTA
  (`src/app/etf/page.js:37`, `src/app/insure/page.js:87`) — same
  sentence shape, same em-dash, different noun.
- **~380 visible em-dashes in rendered copy**, not just comments —
  hero subtext, hints, disclaimers, CTA labels, error messages, right
  down to `data-status`'s own UI strings. Confirmed by reading the
  actual JSX text nodes, not a blind grep. taste-skill's hard ban is
  zero; going to zero site-wide is a copy-voice rewrite touching
  dozens of files, not a mechanical find-replace (an em-dash often
  needs restructuring the sentence, not just swapping punctuation).
- **`etf`'s "what you'll get" section is a literal 3-equal-column
  feature-card row** (Singapore Optimised / DCA Ready / Neutral Math,
  each an icon + heading + 2-line description) — the other explicitly
  banned pattern, on top of the centered hero above it.

Not flagged: no AI-purple gradients, no marquees, no Fraunces/Instrument
Serif — the Clay & Cream palette and Space Grotesk/Inter/JetBrains Mono
stack are genuinely distinctive, not defaults. The issue is structural
templating (hero/CTA/badge-row) and copy voice (em-dashes), not the
visual design system itself.

Fixing the hero/badge-row pattern means designing distinct anatomy per
vertical (or at least 2-3 hero shapes to rotate through) and is a real
design pass, not a quick edit — same caliber of change as MyLedger's
form restructure above. Fixing the em-dashes is mechanical but touches
copy voice across the whole site and shouldn't happen without a look at
the rewritten sentences.

## From earlier code review (2026-09-06)

- `.github/workflows/refresh-data.yml` uses `gh pr merge --admin` to
  bypass branch protection on its own weekly auto-merge PRs. Deliberate
  and already documented at length in the file's own header (bot PRs
  never trigger `pull_request`-scoped CI, so a required check could
  never appear on them) — not a bug, but worth tightening later if
  GitHub adds a narrower bypass mechanism (e.g. an allowlist scoped just
  to this bot) than blanket admin override.
