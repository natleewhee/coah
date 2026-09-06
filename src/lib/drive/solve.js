// src/lib/solve.js
// "What would make this affordable?" — reverse-solves concrete adjustments
// (extra downpayment, shorter/longer tenure) against the real calc() engine,
// rather than hand-derived formulas that can drift from it. calc() is used
// as the oracle for every search here so these suggestions can never
// contradict the numbers shown elsewhere on the page.

import { calc, calcCeiling } from './calc.js'

const MAX_TENURE = 7 // matches the tenure slider's range in the UI

// A result only counts as "actually fixed" if it clears both the in-app
// comfort ratio AND the bank's TDSR ceiling — a scenario that's comfortable
// by our 30% heuristic but still fails TDSR (because of existing debt)
// isn't a real fix, since a bank could reject it regardless.
const passes = (r, targetRatio) => r && r.canDown && r.ratio <= targetRatio && !r.tdsrExceeded

// Binary-search the minimum extra downpayment (on top of `down`) needed to
// bring the burden ratio to `targetRatio` (and clear TDSR) at the current
// tenure. `calcFn` defaults to the new-car calc() but must be swapped for
// calcUsed() (src/lib/used-car.js) when solving for a used car — calc()
// reads car.loanCap directly and would silently produce NaN for a used-car
// object, which derives loanCap internally instead. Returns:
//   0     — already at or under the target
//   null  — unachievable via downpayment alone, even at down = car.price
//   n > 0 — extra S$ needed, rounded up to the nearest dollar
/**
 * Binary-searches the minimum extra downpayment (on top of `down`) needed
 * to bring the burden ratio to `targetRatio` (and clear TDSR) at the
 * current tenure, using `calcFn` as the oracle so results never
 * contradict the numbers shown elsewhere.
 * @param {number} salary - Gross monthly salary in dollars.
 * @param {number} down - Current downpayment offered, in dollars.
 * @param {number} tenure - Loan tenure in years.
 * @param {object} car - The car record.
 * @param {?object} liveCOE - Live COE premiums, or null.
 * @param {number} [existingDebt=0] - Existing monthly debt obligations, in dollars.
 * @param {number} [targetRatio=0.30] - Target monthly-instalment-to-take-home ratio.
 * @param {Function} [calcFn=calc] - The affordability function to use as the oracle
 *   (swap for calcUsed() when solving for a used car).
 * @param {number} [mySharePct=100] - Your share (0-100) of the loan's instalment for TDSR purposes.
 * @returns {?number} 0 if already at/under target, null if unachievable via downpayment
 *   alone (even at down = car.price), or the extra dollars needed (rounded up).
 */
export function solveExtraDownNeeded(salary, down, tenure, car, liveCOE, existingDebt = 0, targetRatio = 0.30, calcFn = calc, mySharePct = 100) {
  const current = calcFn(salary, down, tenure, car, liveCOE, existingDebt, mySharePct)
  if (!current) return null
  if (passes(current, targetRatio)) return 0

  const atMaxDown = calcFn(salary, car.price, tenure, car, liveCOE, existingDebt, mySharePct)
  if (!passes(atMaxDown, targetRatio)) return null

  let lo = down, hi = car.price
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const r = calcFn(salary, mid, tenure, car, liveCOE, existingDebt, mySharePct)
    if (passes(r, targetRatio)) hi = mid
    else lo = mid
  }
  return Math.max(0, Math.ceil(hi - down))
}

// Smallest tenure in [1, MAX_TENURE] that reaches `targetRatio` (and clears
// TDSR) at the current downpayment, or null if none of them do. See
// solveExtraDownNeeded's note on calcFn — for a used car this also
// implicitly respects the car's remaining-COE tenure cap, since calcUsed()
// clamps tenure internally and returns the clamped value in r.tenure.
/**
 * Finds the smallest tenure in [1, MAX_TENURE] that reaches `targetRatio`
 * (and clears TDSR) at the current downpayment. For a used car, `calcFn`
 * (calcUsed()) internally respects the car's remaining-COE tenure cap.
 * @param {number} salary - Gross monthly salary in dollars.
 * @param {number} down - Downpayment offered, in dollars.
 * @param {object} car - The car record.
 * @param {?object} liveCOE - Live COE premiums, or null.
 * @param {number} [existingDebt=0] - Existing monthly debt obligations, in dollars.
 * @param {number} [targetRatio=0.30] - Target monthly-instalment-to-take-home ratio.
 * @param {Function} [calcFn=calc] - The affordability function to use as the oracle.
 * @param {number} [mySharePct=100] - Your share (0-100) of the loan's instalment for TDSR purposes.
 * @returns {?number} The smallest passing tenure in years, or null if none do.
 */
export function solveMinTenureNeeded(salary, down, car, liveCOE, existingDebt = 0, targetRatio = 0.30, calcFn = calc, mySharePct = 100) {
  for (let t = 1; t <= MAX_TENURE; t++) {
    const r = calcFn(salary, down, t, car, liveCOE, existingDebt, mySharePct)
    if (passes(r, targetRatio)) return t
  }
  return null
}

// Bundles every adjustment path for a non-"Affordable" result, plus the
// existing affordability ceiling (max price at current inputs) so the UI can
// point at "cars under S$X" without hardcoding any specific model names.
// The ceiling always uses the new-car calcCeiling() regardless of calcFn,
// since "cars under S$X" is inherently a new-car-shopping suggestion.
/**
 * Bundles every adjustment path for a non-"Affordable" result (extra
 * downpayment needed, minimum tenure needed) plus the affordability
 * ceiling at current inputs, so the UI can point at "cars under S$X"
 * without hardcoding model names. The ceiling always uses the new-car
 * calcCeiling() regardless of calcFn, since it's inherently a
 * new-car-shopping suggestion.
 * @param {number} salary - Gross monthly salary in dollars.
 * @param {number} down - Downpayment offered, in dollars.
 * @param {number} tenure - Loan tenure in years.
 * @param {object} car - The car record.
 * @param {?object} liveCOE - Live COE premiums, or null.
 * @param {number} [existingDebt=0] - Existing monthly debt obligations, in dollars.
 * @param {Function} [calcFn=calc] - The affordability function to use as the oracle.
 * @param {number} [mySharePct=100] - Your share (0-100) of the loan's instalment for TDSR purposes.
 * @returns {{extraDown: (number|null), minTenure: (number|null), ceiling: (object|null)}}
 *   The bundled adjustment suggestions.
 */
export function suggestAdjustments(salary, down, tenure, car, liveCOE, existingDebt = 0, calcFn = calc, mySharePct = 100) {
  return {
    extraDown: solveExtraDownNeeded(salary, down, tenure, car, liveCOE, existingDebt, 0.30, calcFn, mySharePct),
    minTenure: solveMinTenureNeeded(salary, down, car, liveCOE, existingDebt, 0.30, calcFn, mySharePct),
    ceiling: calcCeiling(salary, down, tenure, existingDebt, mySharePct),
  }
}
