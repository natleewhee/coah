// src/lib/used-car.js
// Affordability + depreciation math for buying a USED car, as a drop-in
// counterpart to calc()/calcDepr() in src/lib/calc.js — calcUsed() returns
// the same shape as calc() so it can feed the existing ResultPanel with
// minimal changes, and calcUsedDepr() mirrors calcDepr()'s signature.
//
// The key difference from a new car: the COE isn't fresh. A used car
// already has `ageNow` years on it and only `monthsRemaining` of its COE
// left, so:
// - PARF is computed off the car's TOTAL age (ageNow + years held), not
//   years-since-new — and stops being available once that total age
//   exceeds 10 years (the car must be deregistered, no more PARF).
// - The COE rebate is computed off the ACTUAL months remaining at each
//   point, not a fresh 120-month clock.
// - There's no ARF/duty/registration fee to pay up front — the asking
//   price already reflects the car's remaining COE + PARF-eligible value,
//   which is also why the "distributor margin" framing used for new cars
//   doesn't apply here (see DepreciationCard's isUsed branch).
// - The loan can't outlive the car's remaining COE, so tenure is clamped to
//   whatever's left (and to the same 7-year UI maximum as new-car loans).

import { C, RATE_TIERS } from './theme.js'
import {
  isPureEV, calcNetARF, getCOEPremium, calcPARF, calcCOERebate, TDSR_LIMIT, omvToLtv, minDownFor,
} from './calc.js'

/**
 * Depreciation figures for a used car at ownership year `y`, mirroring
 * calcDepr()'s signature but computing PARF off the car's TOTAL age
 * (ageNow + y, cut off once it exceeds 10 years) and COE rebate off the
 * actual months remaining at that point (not a fresh 120-month clock).
 * @param {object} usedCar - The used car record (price, omv, ves, ageNow, monthsRemaining, coe).
 * @param {number} y - Years of further ownership to evaluate.
 * @param {?number} [liveCOEPremium=null] - Live COE premium override.
 * @returns {{grossArf: number, netArf: number, eeai: number, coePaid: number, parf: number, coeRebate: number, paperValue: number, totalDepr: number, annualDepr: number, monthlyDepr: number}}
 *   The depreciation breakdown.
 */
export function calcUsedDepr(usedCar, y, liveCOEPremium = null) {
  const pureEV = isPureEV(usedCar)
  const ves = usedCar.ves ?? 0
  const { grossArf, netArf, eeai } = calcNetARF(usedCar.omv, ves, pureEV)
  const coe = getCOEPremium(usedCar, liveCOEPremium)
  const ageAtY = usedCar.ageNow + y
  const monthsRemainingAtY = Math.max(0, usedCar.monthsRemaining - y * 12)
  // Once total age exceeds 10 years the car must be deregistered with no
  // PARF rebate left — matches calcPARF/parfPct's own cutoff, made explicit
  // here since ageAtY can exceed that range for a used car in ways a fresh
  // new-car purchase (calcDepr) never has to check.
  const parf = ageAtY <= 10 ? calcPARF(netArf, ageAtY) : 0
  const coeR = calcCOERebate(coe, monthsRemainingAtY)
  const paper = parf + coeR
  const totalDepr = usedCar.price - paper
  if (isNaN(totalDepr) || isNaN(parf) || isNaN(coeR)) {
    return { grossArf:0, netArf:0, eeai:0, coePaid:0, parf:0, coeRebate:0, paperValue:0,
             totalDepr:usedCar.price||0, annualDepr:(usedCar.price||0)/y, monthlyDepr:(usedCar.price||0)/y/12 }
  }
  return { grossArf, netArf, eeai, coePaid:coe, parf, coeRebate:coeR, paperValue:paper,
           totalDepr, annualDepr:totalDepr/y, monthlyDepr:totalDepr/y/12 }
}

/**
 * Full affordability calculation for a used car — a drop-in counterpart
 * to calc() returning the same result shape. Loan tenure is clamped to
 * whatever's left of the car's COE (and to the 7-year UI maximum), since
 * a loan can't outlive the car's remaining COE; there's no ARF/duty/
 * registration fee up front (the asking price already reflects the
 * car's remaining COE + PARF-eligible value). Returns null on invalid inputs.
 * @param {number} salary - Gross monthly salary in dollars.
 * @param {number} down - Downpayment offered, in dollars.
 * @param {number} tenure - Requested loan tenure in years, clamped to the car's remaining COE and 7.
 * @param {object} usedCar - The used car record (price, omv, ves, rateTier, ageNow, monthsRemaining).
 * @param {?object} [liveCOE=null] - Live COE premiums {catA, catB}, or null to use the fallback.
 * @param {number} [existingDebt=0] - Existing monthly debt obligations, in dollars.
 * @param {number} [mySharePct=100] - Your share (0-100) of this loan's instalment for TDSR purposes — see resolveJointSharePct() in calc.js. 100 (the default) means you alone service the full instalment.
 * @returns {?object} The full affordability breakdown (same shape as calc(), plus
 *   requestedTenure, maxTenureFromCoe, tenureClamped), or null if inputs are invalid.
 */
export function calcUsed(salary, down, tenure, usedCar, liveCOE = null, existingDebt = 0, mySharePct = 100) {
  salary = Number(salary)
  down   = Number(down)
  tenure = Number(tenure)
  existingDebt = Number(existingDebt)
  if (!Number.isFinite(existingDebt) || existingDebt < 0) existingDebt = 0
  mySharePct = Number(mySharePct)
  if (!Number.isFinite(mySharePct) || mySharePct <= 0 || mySharePct > 100) mySharePct = 100
  if (!usedCar || !Number.isFinite(salary) || !Number.isFinite(down) || !Number.isFinite(tenure)) return null
  if (salary <= 0 || down <= 0 || tenure < 1) return null
  if (!Number.isFinite(usedCar.price) || usedCar.price <= 0) return null
  if (!Number.isFinite(usedCar.monthsRemaining) || usedCar.monthsRemaining <= 0) return null
  if (!Number.isFinite(usedCar.ageNow) || usedCar.ageNow < 0) return null

  // Loan tenure can't outlive the car's remaining COE, and the UI's tenure
  // slider only goes up to 7 regardless.
  const maxTenureFromCoe = Math.max(1, Math.floor(usedCar.monthsRemaining / 12))
  const requestedTenure = tenure
  tenure = Math.min(tenure, maxTenureFromCoe, 7)

  const tier = RATE_TIERS.find(t => t.id === usedCar.rateTier) ?? RATE_TIERS[0]
  const { loanCap, coe: coeCategory } = omvToLtv(usedCar.omv)
  const car = { ...usedCar, loanCap, coe: coeCategory, isUsed: true }

  const maxLoan = car.price * (loanCap / 100)
  const minDown = minDownFor(car.price, loanCap)
  const canDown = down >= minDown - 0.005
  const loan = canDown ? Math.min(Math.max(0, car.price - down), maxLoan) : maxLoan
  const reqDown = minDown
  const months = tenure * 12
  const interest = loan * tier.rate * tenure
  const repay = loan + interest
  const monthly = repay / months
  const takeHome = salary * 0.80
  const ratio = monthly / takeHome
  const saving = loan * 0.026 * tenure - interest
  const liveCOEPremium = liveCOE ? (coeCategory === 'Cat A' ? liveCOE.catA : liveCOE.catB) : null
  const deprAtTenure = calcUsedDepr(car, tenure, liveCOEPremium)
  const totalCoo = (canDown ? down : reqDown) + repay
  const extraDown = canDown ? Math.max(0, down - reqDown) : 0

  const allYears = Array.from({length: tenure}, (_, i) => i + 1)
  const coo = allYears.map(y => {
    const d = calcUsedDepr(car, y, liveCOEPremium)
    const lp = monthly * y * 12
    const ip = (interest / months) * y * 12
    const du = canDown ? down : reqDown
    const cashOut = du + lp
    const paperValue = d.paperValue
    const sunkCost = cashOut - paperValue
    return { year:y, cashOut, downUsed:du, loanPaid:lp, interestPaid:ip,
             principalPaid:lp-ip, paperValue, parfNow:d.parf,
             coeRebateNow:d.coeRebate, sunkCost }
  })

  let verdict, vc, vcText, vbg, vborder
  if (!canDown)         { verdict='Insufficient Downpayment'; vc=C.red;    vcText=C.redText;   vbg=C.redBg;    vborder=C.red }
  else if (ratio<=0.30) { verdict='Affordable';               vc=C.accent; vcText=C.accentText;vbg=C.accentBg; vborder=C.accent }
  else if (ratio<=0.45) { verdict='Stretch';                  vc=C.amber;  vcText=C.amberText; vbg=C.amberBg;  vborder=C.amber }
  else                  { verdict='Out of Range';              vc=C.red;    vcText=C.redText;   vbg=C.redBg;    vborder=C.red }

  const myMonthlyShare = monthly * (mySharePct / 100)
  const tdsr = (existingDebt + myMonthlyShare) / salary
  const tdsrExceeded = tdsr > TDSR_LIMIT

  return { car, tier, loan, maxLoan, reqDown, canDown, extraDown,
           shortfall: Math.max(0, reqDown - down),
           monthly, interest, repay, takeHome, ratio, months,
           verdict, vc, vcText, vbg, vborder,
           saving, coo, totalCoo, lcPct: loanCap / 100, deprAtTenure,
           liveCOE: liveCOE !== null, liveCOEPremium,
           salary, down, tenure, existingDebt, mySharePct, myMonthlyShare, tdsr, tdsrExceeded,
           requestedTenure, maxTenureFromCoe, tenureClamped: tenure !== requestedTenure }
}
