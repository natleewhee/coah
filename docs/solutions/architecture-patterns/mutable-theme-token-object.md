---
module: shared/theme, drive/theme, flow/Results, ledger/ui, drive/data-status
tags: [theme, light-dark-mode, mutable-object, module-scope, react]
problem_type: stale-value-after-mode-switch
severity: medium
resolution_type: fixed
---

# `C` is a single mutated object, not reassigned — module-scope reads of `C.*` freeze at import time

## Context

`src/lib/shared/theme.js` exports `C` as one object identity:
`export const C = { ...DARK }`. Switching light/dark mode does
`Object.assign(C, mode === 'light' ? LIGHT : DARK)` — it mutates `C`'s
properties in place rather than reassigning `C` to a new object. This
is deliberate: every `import { C } from '.../theme'` call site across
the app holds a live reference, and an inline JSX style like
`color: C.text` reads the current value on every render after a mode
switch, with no context provider needed.

## Guidance

This works perfectly for anything read **inside a render** (JSX inline
styles, a function body evaluated per call). It silently breaks for
anything that reads `C.*` **once, at module-evaluation time** — a
`const` built at the top of a file, outside any function or component.
That constant captures whichever mode's hex happened to be current when
the module first loaded (in practice: always dark, since SSR renders
dark first) and never sees a later `applyMode()` call, because nothing
re-runs module-level code on a mode switch.

Eight instances of this shipped before it was caught in one audit:
`RATE_TIERS`' swatch colors in `drive/theme.js`, `flow/Results.js`'s
table header/cell style objects, `ledger/ui.js`'s verdict-chip color
map, and the entire `drive/data-status` page (which additionally
compared `state.tone === OK` — an identity comparison against a color
*value*, which would have silently stopped matching the moment `OK`
became mode-reactive).

**Fix pattern, by shape:**
- A plain object literal → convert to a function: `const thStyle = () =>
  ({ color: C.faint, ... })`, call it at the JSX call site.
- An array of objects with a couple of color fields → getters:
  `{ id: 'ice', rate: 0.026, get color() { return C.iceText } }` — keeps
  non-color fields (`rate`, `id`) as plain values a calc engine can
  destructure normally.
- A lookup map keyed by a semantic name → store the **token name**
  (`'greenBg'`), not the hex, and resolve it against `C` at render:
  `C[entry.bg]`.
- A value used as a discriminant in `===` comparisons (a "state" or
  "tone") → must never be a color itself. Use a semantic string
  (`'ok'|'warn'|'bad'`) and resolve to a color only for display.

## Why This Matters

The bug is invisible in the common case: SSR always renders dark mode
first, so anything frozen at import time is *correct on first paint*
and only wrong after the user explicitly switches to light mode — which
a cursory glance, or a screenshot taken without toggling, will never
catch. Every one of the eight instances above passed code review and
shipped before the audit that found them, specifically because nobody
tested a mode switch on those particular components.

## When to Apply

Any time a new file does `import { C } from '.../theme'` and defines a
`const` or object literal at module scope (not inside a component body,
hook, or function) that reads `C.<colorOrShadowToken>`. Font sizes,
radii, and font-family tokens (`C.xs`, `C.r`, `C.fontMono`) are **not**
mode-reactive — they're identical in `LIGHT` and `DARK` — so freezing
those at import time is harmless; only the color/shadow keys that
differ between the two dictionaries need this treatment.

## Examples

See `src/lib/drive/theme.js` (`RATE_TIERS`, getters), `src/components/flow/Results.js`
(`thStyle`/`tdStyle`, functions), `src/components/ledger/ui.js` (`CHIP`,
token-name lookup), and `src/app/drive/data-status/page.js` (`TONES`
map + `toneColor()` resolver) for the four fix shapes above, all from
the same PR (#11) that found and fixed this pattern.
