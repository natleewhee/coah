// src/lib/shared/theme.js
// The design-token object and money helpers that every vertical's own
// theme.js used to carry a verbatim copy of. "Clay & Cream" palette —
// terracotta accent, warm neutrals — with dark and light variants.
//
// Literal hex, deliberately — NOT `var(--color-*)` strings. Components
// build alpha-transparent variants by string-concatenating a hex suffix
// straight onto these values (e.g. `${C.accent}44`), which only works
// with real hex. Kept in sync by hand with the `--color-*` / `--l-*`
// custom properties in src/app/globals.css.
//
// `accent` (clay/terracotta) is the BRAND/chrome color — CTAs, focus
// rings, active states. `amber` is a separate, more yellow-gold hue used
// for mid-severity warnings — kept clearly distinct from `accent`'s
// orange so the two never get confused in a severity ramp. `green` is
// SEMANTIC for positive financial outcomes.
//
// Mode switching: `C` is a single MUTABLE object (not reassigned) so the
// many `import { C } from '.../theme'` call sites across the app keep a
// live reference — applyMode() below does `Object.assign(C, ...)` in
// place, and every inline `style={{ color: C.text }}` read during a
// render after that picks up the new values. `ndtm`/`ndtmMid`/`ndtmLight`
// are deliberately NOT part of the swap: they're a fixed "always ink"
// panel tone `Button.js`'s `dark` variant relies on regardless of mode.
const SHARED = {
  ndtm: '#0d0a08', ndtmMid: '#0d0a08', ndtmLight: '#241a12',
  fontNdtm: "'Space Grotesk', 'Inter', -apple-system, sans-serif",
  fontDisplay: "'Space Grotesk', 'Inter', -apple-system, sans-serif",
  fontBody: "'Inter', -apple-system, 'Segoe UI', sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, monospace",
  xs: '11px', sm: '13px', base: '15px', lg: '17px', xl: '22px', xxl: '28px', hero: '38px',
  r: '10px', rL: '16px', rXL: '22px',
}

export const DARK = {
  ...SHARED,
  primary: '#f7f1ea',
  accent: '#e0763f', accentBg: '#2e1f16', accentText: '#f0a677', accentInk: '#2b1208',
  green: '#4caf7d', greenBg: '#16271f', greenText: '#8fd9b2',
  bg: '#17120f', surface: '#221b16', border: '#3a2f27',
  text: '#f7f1ea', muted: '#ab9a8c', faint: '#908173',
  red: '#e2564a', redBg: '#341714', redText: '#f2a99f',
  amber: '#d9a441', amberBg: '#2e2313', amberText: '#f0cf8f',
  blue: '#5b9bd1', blueBg: '#16232e', blueText: '#a8d0ee',
  iceBg: '#2a231c', iceText: '#a89886', surface2: '#2a2119',
  // Form-control outline. Distinct from `border` (a decorative hairline
  // between cards, deliberately low-contrast): an input's border is the
  // only thing that marks where the control is, so it has to clear
  // WCAG 1.4.11's 3:1 non-text minimum against both bg and surface.
  borderControl: '#75655a',
  shadow: '0 1px 3px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.25)',
  shadowMd: '0 2px 8px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.3)',
}

export const LIGHT = {
  ...SHARED,
  primary: '#2b2019',
  accent: '#ad4b25', accentBg: '#f6e6d8', accentText: '#8a3417', accentInk: '#fffaf6',
  green: '#2a7f51', greenBg: '#e6f5ec', greenText: '#1f6a41',
  bg: '#faf5ef', surface: '#ffffff', border: '#e8dccb',
  text: '#2b2019', muted: '#7e6e60', faint: '#816d5c',
  red: '#c94a3d', redBg: '#fbe8e5', redText: '#9c2f24',
  amber: '#926a1b', amberBg: '#f6ecd4', amberText: '#7a5713',
  blue: '#3574a8', blueBg: '#e6f0f8', blueText: '#204d6e',
  iceBg: '#f0e9df', iceText: '#76675a', surface2: '#f3ece2',
  borderControl: '#9c8a76',
  shadow: '0 1px 3px rgba(43,32,25,0.08), 0 4px 16px rgba(43,32,25,0.06)',
  shadowMd: '0 2px 8px rgba(43,32,25,0.1), 0 8px 24px rgba(43,32,25,0.08)',
}

// Mutable — see the block comment above for why this must stay one
// object identity rather than being reassigned.
export const C = { ...DARK }

/**
 * Switches the shared token object to light or dark values in place.
 * Vertical `theme.js` files that spread `{ ...BASE }` for their own `C`
 * export a matching `applyMode` that calls this and re-applies their own
 * extra keys — see src/lib/drive/theme.js for the pattern.
 * @param {'light'|'dark'} mode
 */
export function applyMode(mode) {
  Object.assign(C, mode === 'light' ? LIGHT : DARK)
}

/** Format a number as Singapore dollars, rounded, with thousands separators. */
export const SGD = (n) => `S$${Math.round(n || 0).toLocaleString('en-SG')}`

/**
 * Parse a money input string, honoring `k` (thousand) and `m` (million)
 * suffixes: `"800k"` → 800000, `"1.2m"` → 1200000. Strips currency
 * symbols, commas, and stray characters. Returns 0 for empty or
 * unparseable input.
 * @param {string|number|null|undefined} raw
 * @returns {number}
 */
export function parseMoney(raw) {
  if (raw == null) return 0
  let s = String(raw).trim().toLowerCase().replace(/,/g, '')
  if (!s) return 0
  let mult = 1
  if (s.endsWith('k')) { mult = 1_000; s = s.slice(0, -1) }
  else if (s.endsWith('m')) { mult = 1_000_000; s = s.slice(0, -1) }
  // Strip anything that isn't a digit or decimal point — a pasted
  // "$1,500,000" (leading $ survives the comma strip) or a
  // space-separated "1 500 000" would otherwise make parseFloat choke on
  // the first non-numeric character and silently truncate.
  s = s.replace(/[^0-9.]/g, '')
  if (!s) return 0
  const n = parseFloat(s)
  return Number.isFinite(n) ? n * mult : 0
}
