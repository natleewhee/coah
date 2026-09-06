// src/lib/calc.js
// Single source of truth for all cost calculations: ARF, PARF, COE rebate,
// government costs, depreciation, loan affordability.
// Pure functions — no React, no fetch. Covered by tests/calc.test.js.
//
// KEY LTA RULES:
// - ARF tiers effective Feb 2023: 100% on first $20k of OMV, 140% on next $20k,
//   190% on next $20k, 250% on next $20k, 320% above $80k.
// - PARF rebate (car deregistered at age ≤10yr): 75% of ARF at ≤5yr, stepping
//   down 5%/yr to 50% at 9–10yr, nil after 10yr. Capped at S$60,000 for cars
//   registered with COEs from the Feb 2023 second bidding onwards (Budget 2023).
// - COE rebate: unused months / 120 × COE paid.
// - EEAI (EV Early Adoption Incentive): 45% of ARF, capped at S$7,500,
//   pure EVs only.

import { C, RATE_TIERS } from './theme.js'

export { RATE_TIERS }

export const PARF_CAP = 60000

// MAS Total Debt Servicing Ratio: all monthly debt obligations (this loan's
// instalment plus any existing loans/credit facilities) capped at 55% of
// gross monthly income. This is a separate, harder constraint from the
// in-app 30%-of-take-home "comfort" verdict below — TDSR is what a bank
// actually checks before approving the loan, using gross income, not
// take-home, and counting every other debt obligation the borrower has.
export const TDSR_LIMIT = 0.55

// Shared with HouseMuch — a joint loan's TDSR apportionment isn't
// vertical-specific. Re-exported here (not just imported) so existing
// `import { resolveJointSharePct } from '@/lib/drive/calc'` call sites
// keep working unchanged.
export { resolveJointSharePct } from '../shared/jointShare.js'

// ─── COE FALLBACK CONSTANTS ──────────────────────────────────────────────────
// Updated manually after each LTA bidding (~2x/month).
// Used when the live data.gov.sg fetch hasn't completed yet or fails.
// Source: 2026-07 1st bidding exercise, from a user-provided LTA export
// (public/data/coe-history.json has the full series). That export is
// month-level only, so COE_FALLBACK_AS_OF below is the 1st of that month as
// a placeholder, not the exact bidding date.
export const COE_FALLBACK = { catA: 129000, catB: 130889 }
// Date this fallback pair was last updated from an actual LTA bidding result.
// Bidding happens ~2x/month, so treat this as stale after ~45 days — the UI
// uses isCoeFallbackStale() to warn when the constant above hasn't been
// refreshed in a while, since a silently-stale hardcoded number is worse
// than an explicit warning.
export const COE_FALLBACK_AS_OF = '2026-07-01' // Jul 2026 1st bidding (day approximated — source data is month-level only)

/**
 * Whether the hardcoded COE_FALLBACK pair is stale (bidding happens
 * ~2x/month, so treated as stale after ~45 days).
 * @param {Date} [now=new Date()] - The current date to check against.
 * @returns {boolean} True if COE_FALLBACK_AS_OF is more than 45 days old.
 */
export function isCoeFallbackStale(now = new Date()) {
  const ageDays = (now.getTime() - new Date(COE_FALLBACK_AS_OF).getTime()) / 86400000
  return ageDays > 45
}

/**
 * Additional Registration Fee on a tiered schedule of Open Market Value
 * (effective Feb 2023): 100% on the first $20k, 140% on the next $20k,
 * 190% on the next $20k, 250% on the next $20k, 320% above $80k.
 * @param {number} omv - Open Market Value in dollars.
 * @returns {number} Gross ARF in dollars.
 */
export function calcARF(omv) {
  if (omv <= 20000) return omv
  if (omv <= 40000) return 20000 + (omv - 20000) * 1.4
  if (omv <= 60000) return 20000 + 20000 * 1.4 + (omv - 40000) * 1.9
  if (omv <= 80000) return 20000 + 20000 * 1.4 + 20000 * 1.9 + (omv - 60000) * 2.5
  return 20000 + 20000 * 1.4 + 20000 * 1.9 + 20000 * 2.5 + (omv - 80000) * 3.2
}

/**
 * PARF rebate percentage by age at deregistration: 75% at ≤5yr, stepping
 * down 5%/yr to 50% at 9–10yr, nil after 10yr.
 * @param {number} ageYears - Vehicle age in years at deregistration.
 * @returns {number} PARF rebate rate as a decimal (e.g. 0.75 for 75%).
 */
export function parfPct(ageYears) {
  if (ageYears <= 5)  return 0.75
  if (ageYears <= 6)  return 0.70
  if (ageYears <= 7)  return 0.65
  if (ageYears <= 8)  return 0.60
  if (ageYears <= 9)  return 0.55
  if (ageYears <= 10) return 0.50
  return 0
}

/**
 * PARF rebate in dollars, capped at PARF_CAP (S$60,000, for cars
 * registered with COEs from the Feb 2023 second bidding onwards).
 * @param {number} netArf - Net ARF (after VES/EEAI) in dollars.
 * @param {number} ageYears - Vehicle age in years at deregistration.
 * @returns {number} PARF rebate in dollars.
 */
export function calcPARF(netArf, ageYears) {
  return Math.min(netArf * parfPct(ageYears), PARF_CAP)
}

/**
 * COE rebate for the unused portion of a COE's 120-month term.
 * @param {number} coePaid - COE premium paid, in dollars.
 * @param {number} monthsRemaining - Months remaining on the COE.
 * @returns {number} COE rebate in dollars, floored at 0.
 */
export function calcCOERebate(coePaid, monthsRemaining) {
  return Math.max(0, (monthsRemaining / 120) * coePaid)
}

// Type labels that contain "Electric" but describe a car that does NOT
// qualify for EEAI. A bare `type.includes('Electric')` would wrongly
// grant a hybrid up to $7,500 of rebate — today's dataset happens to
// label hybrids "SUV · Hybrid" so nothing misfires, but a single entry
// typed "Petrol-Electric Hybrid" (a common phrasing) would silently
// understate that car's ARF and its true cost.
const NON_EV_MARKERS = /hybrid|phev|e-power|plug-?in|mild/i

/**
 * Whether a car qualifies as a pure EV for EEAI purposes (fully electric
 * only — NOT hybrids, PHEVs, or e-Power). Tesla is always treated as pure
 * EV; otherwise the type field is checked against NON_EV_MARKERS to
 * avoid a bare "Electric" substring match wrongly granting EEAI to a
 * mislabeled hybrid.
 * @param {{rateTier?: string, type?: string}} car - The car record.
 * @returns {boolean} True if the car is a pure EV.
 */
export function isPureEV(car) {
  // EEAI applies to fully electric vehicles only — NOT hybrids, PHEVs, or e-Power
  // Tesla is always pure EV. Otherwise check the type field.
  if (car.rateTier === 'tesla') return true
  const type = car.type ?? ''
  if (NON_EV_MARKERS.test(type)) return false
  return type.includes('Electric')
}

// MAS LTV/COE-category threshold: OMV ≤ S$20,000 → Cat A, 70% max loan;
// above → Cat B, 60% max loan. This must be the ONLY place that decides
// loanCap/COE category from OMV — cars.json used to carry loanCap and coe
// as separately hand-maintained fields that could (and did, for 9 cars)
// disagree with each other and with the car's own OMV, silently telling a
// user they qualified for a loan a bank would reject. Every caller that
// needs either value should derive it from OMV via this function rather
// than trust a stored field.
/**
 * MAS LTV/COE-category threshold derived from OMV — the single source of
 * truth for whether a car is Cat A or Cat B, and its maximum loan
 * percentage. Every caller should derive this from OMV rather than trust
 * a separately stored field.
 * @param {?number} omv - Open Market Value in dollars.
 * @returns {{coe: string, loanCap: number}} 'Cat A' (≤$20,000 OMV, 70% max loan) or 'Cat B' (60% max loan).
 */
export function omvToLtv(omv) {
  const catA = (omv ?? 0) <= 20000
  return { coe: catA ? 'Cat A' : 'Cat B', loanCap: catA ? 70 : 60 }
}

// Minimum downpayment for a car at its own loanCap, rounded to cents rather
// than left as price × (1 − cap/100) — that form evaluates to
// 60000.00000000001 for a $200k car at 70%, which reads as "insufficient"
// for a downpayment of exactly the minimum. calc() and calcUsed() each
// inline this same rounding themselves (their return shape carries more
// than just this number), but every OTHER minDown check in the app —
// CarPicker's budget filter, coe-explained's demo — should call this
// instead of re-deriving the un-rounded, untoleranced version.
/**
 * Minimum downpayment for a car at a given loan cap, rounded to cents so
 * a downpayment of exactly the minimum doesn't read as insufficient due
 * to float arithmetic (e.g. 60000.00000000001).
 * @param {number} price - Car price in dollars.
 * @param {number} loanCap - Maximum loan percentage (e.g. 70 for 70%).
 * @returns {number} Minimum downpayment in dollars, rounded to cents.
 */
export function minDownFor(price, loanCap) {
  const maxLoan = price * (loanCap / 100)
  return Math.round((price - maxLoan) * 100) / 100
}

/**
 * Net ARF: gross ARF minus VES rebate/surcharge minus EEAI (EV Early
 * Adoption Incentive, pure EVs only — 45% of post-VES ARF, capped at $7,500).
 * @param {number} omv - Open Market Value in dollars.
 * @param {number} ves - VES rebate (positive) or surcharge (negative), in dollars.
 * @param {boolean} pureEV - Whether the car qualifies for EEAI.
 * @returns {{grossArf: number, vesAmount: number, eeai: number, netArf: number}} The ARF breakdown.
 */
export function calcNetARF(omv, ves, pureEV) {
  // Gross ARF → minus VES rebate/surcharge → minus EEAI for pure EVs only
  const grossArf = calcARF(omv || 0)
  const vesAmount = (ves ?? 0)
  const afterVES = Math.max(0, grossArf - vesAmount)
  const eeai = pureEV ? Math.min(afterVES * 0.45, 7500) : 0
  return { grossArf, vesAmount, eeai, netArf: Math.max(0, afterVES - eeai) }
}

/**
 * Resolves the COE premium to use — the live value when given, otherwise
 * the hardcoded COE_FALLBACK by the car's COE category.
 * @param {{coe: string}} car - The car record (needs its coe category).
 * @param {?number} liveCOEPremium - Live COE premium, or null/undefined to use the fallback.
 * @returns {number} COE premium in dollars.
 */
export function getCOEPremium(car, liveCOEPremium) {
  // Use live value if available, else use hardcoded fallback
  if (liveCOEPremium !== null && liveCOEPremium !== undefined) return liveCOEPremium
  return car.coe === 'Cat A' ? COE_FALLBACK.catA : COE_FALLBACK.catB
}

/**
 * All government-mandated costs for a car: net ARF, excise duty, COE,
 * and registration fee.
 * @param {object} car - The car record (omv, ves, coe, rateTier, type).
 * @param {?number} [liveCOEPremium=null] - Live COE premium override.
 * @returns {{grossArf: number, vesAmount: number, eeai: number, netArf: number, duty: number, regFee: number, coe: number, total: number}}
 *   The government-cost breakdown.
 */
export function calcGovtCosts(car, liveCOEPremium = null) {
  const pureEV = isPureEV(car)
  const ves = car.ves ?? 0
  const { grossArf, vesAmount, eeai, netArf } = calcNetARF(car.omv, ves, pureEV)
  const duty = car.omv * 0.308
  const regFee = 350
  const coe = getCOEPremium(car, liveCOEPremium)
  return { grossArf, vesAmount, eeai, netArf, duty, regFee, coe,
           total: car.omv + netArf + duty + regFee + coe }
}

const SGD = n => `S$${Math.round(n).toLocaleString('en-SG')}`

/**
 * Estimated distributor margin: car price minus all known government
 * costs. Teslas are handled specially (their published subtotal ex-COE
 * is shown as a fraction of price, not a margin). If price is at or
 * below government costs — typically because a seeded sticker price
 * predates the current COE level — flags the estimate as unreliable
 * rather than showing a misleading S$0.
 * @param {object} car - The car record (price, omv, ves, coe, rateTier, type, subtotalExCOE).
 * @param {?number} [liveCOEPremium=null] - Live COE premium override.
 * @returns {object} gap, gapPct, isTesla, govtCosts, label, sublabel, and (non-Tesla) unreliable,
 *   or (Tesla) isSubtotal.
 */
export function calcPriceGap(car, liveCOEPremium = null) {
  const isTesla = car.rateTier === 'tesla'
  const govtCosts = calcGovtCosts(car, liveCOEPremium)

  if (isTesla && car.subtotalExCOE) {
    // Tesla's vehicle subtotal (ex-COE) is their published price incl. GST.
    // It does NOT include excise duty, ARF, VES, EEAI — those are listed separately.
    // So we show it as a fraction of total car price, not as a "margin".
    const subtotalPct = (car.subtotalExCOE / car.price) * 100
    const govtPct = 100 - subtotalPct
    return {
      gap: car.subtotalExCOE, gapPct: subtotalPct, isTesla: true, govtCosts,
      label: 'Tesla vehicle price (ex-govt costs)',
      sublabel: `Tesla sells direct at a fixed global price. Vehicle subtotal ${SGD(car.subtotalExCOE)} (${subtotalPct.toFixed(0)}% of total price) — the remaining ${govtPct.toFixed(0)}% is ARF, COE, duty, and registration.`,
      isSubtotal: true,
    }
  }

  // Standard distributor margin calculation.
  //
  // When the listed price is BELOW total known government costs, the margin
  // can't be estimated — it would clamp to a misleading S$0. That happens
  // because our seeded sticker prices were captured when COE was lower than
  // the ~S$129-131k figure subtracted here, so price − govtCosts goes
  // negative. Rather than show a false S$0, flag it as not-estimable and
  // point the user at the price field (a real dealer quote at today's COE
  // makes the estimate work).
  const rawGap = car.price - govtCosts.total
  const unreliable = rawGap <= 0
  const gap = Math.max(0, rawGap)
  const gapPct = (gap / car.price) * 100
  return {
    gap, gapPct, unreliable, isTesla, govtCosts,
    label: isTesla ? 'Est. price above govt costs' : 'Est. distributor margin',
    sublabel: unreliable
      ? `This car's seeded price predates the current ${SGD(govtCosts.coe)} ${car.coe} COE, so a margin can't be estimated from it — enter your actual dealer quote above to see it.`
      : isTesla
      ? 'Tesla sells direct — no local distributor. Calculated from car price minus all known government costs.'
      : 'Estimated as car price minus OMV, ARF (net of EEAI for EVs), excise duty, GST, COE, and registration fee.',
  }
}

/**
 * Depreciation figures for a car at a given ownership year: PARF rebate,
 * COE rebate, resulting "paper value", and total/annual/monthly
 * depreciation. Returns a zeroed object if any input produces NaN (e.g. missing car fields).
 * @param {object} car - The car record (price, omv, ves, coe, rateTier, type).
 * @param {number} y - Ownership year to evaluate.
 * @param {?number} [liveCOEPremium=null] - Live COE premium override.
 * @returns {{grossArf: number, netArf: number, eeai: number, coePaid: number, parf: number, coeRebate: number, paperValue: number, totalDepr: number, annualDepr: number, monthlyDepr: number}}
 *   The depreciation breakdown.
 */
export function calcDepr(car, y, liveCOEPremium = null) {
  const pureEV = isPureEV(car)
  const ves = car.ves ?? 0
  const { grossArf, netArf, eeai } = calcNetARF(car.omv, ves, pureEV)
  const coe = getCOEPremium(car, liveCOEPremium)
  const parf = calcPARF(netArf, y)
  const coeR = calcCOERebate(coe, Math.max(0, 120 - y * 12))
  const paper = parf + coeR
  const totalDepr = car.price - paper
  // Safety: if any value is NaN (e.g. missing car fields), return zeroed object
  if (isNaN(totalDepr) || isNaN(parf) || isNaN(coeR)) {
    return { grossArf:0, netArf:0, eeai:0, coePaid:0, parf:0, coeRebate:0, paperValue:0,
             totalDepr:car.price||0, annualDepr:(car.price||0)/y, monthlyDepr:(car.price||0)/y/12 }
  }
  return { grossArf, netArf, eeai, coePaid:coe, parf, coeRebate:coeR, paperValue:paper,
           totalDepr, annualDepr:totalDepr/y, monthlyDepr:totalDepr/y/12 }
}

/**
 * Full affordability calculation for a car: loan sizing, monthly
 * instalment, comfort verdict (based on 80% take-home), TDSR (based on
 * gross salary plus existing debt), and a year-by-year cost-of-ownership
 * curve. Returns null on invalid inputs.
 * @param {number} salary - Gross monthly salary in dollars.
 * @param {number} down - Downpayment offered, in dollars.
 * @param {number} tenure - Loan tenure in years (1-10).
 * @param {object} car - The car record (price, loanCap, rateTier, coe, omv, ves, type).
 * @param {?object} [liveCOE=null] - Live COE premiums {catA, catB}, or null to use the fallback.
 * @param {number} [existingDebt=0] - Existing monthly debt obligations, in dollars.
 * @param {number} [mySharePct=100] - Your share (0-100) of this loan's instalment for TDSR purposes — see resolveJointSharePct(). 100 (the default) means you alone service the full instalment.
 * @returns {?object} The full affordability breakdown, or null if inputs are invalid.
 */
export function calc(salary, down, tenure, car, liveCOE = null, existingDebt = 0, mySharePct = 100) {
  // Coerce and validate inputs — reject non-numeric, non-positive, or absurd values
  salary = Number(salary)
  down   = Number(down)
  tenure = Number(tenure)
  existingDebt = Number(existingDebt)
  if (!Number.isFinite(existingDebt) || existingDebt < 0) existingDebt = 0
  mySharePct = Number(mySharePct)
  if (!Number.isFinite(mySharePct) || mySharePct <= 0 || mySharePct > 100) mySharePct = 100
  if (!car || !Number.isFinite(salary) || !Number.isFinite(down) || !Number.isFinite(tenure)) return null
  if (salary <= 0 || down <= 0 || tenure < 1 || tenure > 10) return null
  if (!Number.isFinite(car.price) || car.price <= 0) return null

  const tier = RATE_TIERS.find(t => t.id === car.rateTier) ?? RATE_TIERS[0]
  const maxLoan = car.price * (car.loanCap / 100)
  const minDown = minDownFor(car.price, car.loanCap)
  // Half-a-cent tolerance: nobody can be short by less than a cent, and
  // without it a downpayment derived by float arithmetic upstream can
  // land a fraction below the minimum and read as insufficient.
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
  const liveCOEPremium = liveCOE ? (car.coe === 'Cat A' ? liveCOE.catA : liveCOE.catB) : null
  const deprAtTenure = calcDepr(car, tenure, liveCOEPremium)
  const totalCoo = (canDown ? down : reqDown) + repay
  const extraDown = canDown ? Math.max(0, down - reqDown) : 0
  // Generate a point for every year 1..tenure for the ownership curve
  const allYears = Array.from({length: tenure}, (_, i) => i + 1)
  const coo = allYears.map(y => {
    const d = calcDepr(car, y, liveCOEPremium)
    const lp = monthly * y * 12
    const ip = (interest / months) * y * 12
    const du = canDown ? down : reqDown
    const cashOut = du + lp
    const paperValue = d.paperValue
    const sunkCost = cashOut - paperValue  // true money gone (can be negative early on)
    return { year:y, cashOut, downUsed:du, loanPaid:lp, interestPaid:ip,
             principalPaid:lp-ip, paperValue, parfNow:d.parf,
             coeRebateNow:d.coeRebate, sunkCost }
  })
  let verdict, vc, vcText, vbg, vborder
  if (!canDown)         { verdict='Insufficient Downpayment'; vc=C.red;    vcText=C.redText;   vbg=C.redBg;    vborder=C.red }
  else if (ratio<=0.30) { verdict='Affordable';               vc=C.green;  vcText=C.greenText; vbg=C.greenBg;  vborder=C.green }
  else if (ratio<=0.45) { verdict='Stretch';                  vc=C.amber;  vcText=C.amberText; vbg=C.amberBg;  vborder=C.amber }
  else                  { verdict='Out of Range';              vc=C.red;    vcText=C.redText;   vbg=C.redBg;    vborder=C.red }

  // TDSR uses GROSS monthly income (salary), not the 80%-take-home figure
  // the comfort verdict above is based on — and counts existing debt
  // obligations on top of only YOUR share of this loan's instalment
  // (mySharePct=100 unless it's a joint loan — see resolveJointSharePct()).
  const myMonthlyShare = monthly * (mySharePct / 100)
  const tdsr = (existingDebt + myMonthlyShare) / salary
  const tdsrExceeded = tdsr > TDSR_LIMIT

  return { car, tier, loan, maxLoan, reqDown, canDown, extraDown,
           shortfall:Math.max(0, reqDown-down),
           monthly, interest, repay, takeHome, ratio, months,
           verdict, vc, vcText, vbg, vborder,
           saving, coo, totalCoo, lcPct:car.loanCap/100, deprAtTenure,
           liveCOE: liveCOE !== null, liveCOEPremium,
           salary, down, tenure, existingDebt, mySharePct, myMonthlyShare, tdsr, tdsrExceeded }
}

/**
 * Reverse-solves the maximum affordable car price, given salary,
 * downpayment, and tenure, under both the comfort limit (30% of
 * take-home) and the TDSR limit — whichever binds — for both Cat A and Cat B.
 * @param {number} salary - Gross monthly salary in dollars.
 * @param {number} down - Downpayment available, in dollars.
 * @param {number} tenure - Loan tenure in years.
 * @param {number} [existingDebt=0] - Existing monthly debt obligations, in dollars.
 * @param {number} [mySharePct=100] - Your share (0-100) of the loan-to-be's instalment for TDSR purposes — see resolveJointSharePct(). 100 (the default) means you alone service the full instalment.
 * @returns {?{catA: number, catB: number, takeHome: number, maxMonthly: number, maxMonthlyComfort: number, maxMonthlyTdsr: number, tdsrBinding: boolean}}
 *   Affordable price ceilings for each COE category (rounded down to the nearest $1,000), or null if inputs are invalid.
 */
export function calcCeiling(salary, down, tenure, existingDebt = 0, mySharePct = 100) {
  salary = Number(salary); down = Number(down); tenure = Number(tenure)
  existingDebt = Number(existingDebt)
  if (!Number.isFinite(existingDebt) || existingDebt < 0) existingDebt = 0
  mySharePct = Number(mySharePct)
  if (!Number.isFinite(mySharePct) || mySharePct <= 0 || mySharePct > 100) mySharePct = 100
  if (!salary || salary <= 0 || !tenure || tenure < 1) return null
  const takeHome = salary * 0.80
  const maxMonthlyComfort = takeHome * 0.30
  // My TDSR budget (salary*TDSR_LIMIT - existingDebt) only has to cover MY
  // share of this loan's instalment, so the full instalment it buys can be
  // proportionally larger — divide back up by mySharePct to convert "my
  // share of the budget" into "full instalment this budget affords".
  const myTdsrBudget = Math.max(0, salary * TDSR_LIMIT - existingDebt)
  const maxMonthlyTdsr = myTdsrBudget / (mySharePct / 100)
  const maxMonthly = Math.min(maxMonthlyComfort, maxMonthlyTdsr)
  const tdsrBinding = maxMonthlyTdsr < maxMonthlyComfort
  const months = tenure * 12
  const rate = 0.0208
  const maxLoan = maxMonthly * months / (1 + rate * tenure)
  const affordA = Math.min(maxLoan / 0.70, down > 0 ? down / 0.30 : maxLoan / 0.70)
  const affordB = Math.min(maxLoan / 0.60, down > 0 ? down / 0.40 : maxLoan / 0.60)
  return { catA:Math.floor(affordA/1000)*1000, catB:Math.floor(affordB/1000)*1000,
           takeHome, maxMonthly, maxMonthlyComfort, maxMonthlyTdsr, tdsrBinding }
}
