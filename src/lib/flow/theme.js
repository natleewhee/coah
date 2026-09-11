// src/lib/flow/theme.js
// FlowState uses the shared design tokens (src/lib/shared/theme.js) —
// `surface2` (one extra inset-panel shade) lives in the shared DARK/LIGHT
// dictionaries alongside it.
import { C as BASE, applyMode as applyBaseMode } from '../shared/theme.js'

export { SGD, parseMoney } from '../shared/theme.js'

export const C = { ...BASE }

/** @param {'light'|'dark'} mode */
export function applyMode(mode) {
  applyBaseMode(mode)
  Object.assign(C, BASE)
}
