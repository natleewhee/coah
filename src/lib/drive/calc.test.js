// src/lib/drive/calc.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcARF, parfPct, calcPARF, calcCOERebate, isPureEV, calcNetARF,
  getCOEPremium, calcGovtCosts, calcPriceGap, calcDepr, calc, calcCeiling,
  isCoeFallbackStale, PARF_CAP, TDSR_LIMIT, COE_FALLBACK, COE_FALLBACK_AS_OF,
  omvToLtv, minDownFor, resolveJointSharePct,
} from './calc.js'

function approx(a, b, eps = 0.5) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`)
}

const CAR = {
  id: 'test', name: 'Test Car', short: 'Test',
  price: 200_000, omv: 40_000, coe: 'Cat A', loanCap: 70, rateTier: 'mass', ves: 0,
}

// ─── ARF tiers (LTA, effective Feb 2023) ─────────────────────────────────

test('calcARF applies 100% on the first $20k of OMV', () => {
  approx(calcARF(15_000), 15_000)
  approx(calcARF(20_000), 20_000)
})

test('calcARF steps through every published tier', () => {
  approx(calcARF(30_000), 20_000 + 10_000 * 1.4)                       // 34,000
  approx(calcARF(40_000), 20_000 + 20_000 * 1.4)                       // 48,000
  approx(calcARF(60_000), 48_000 + 20_000 * 1.9)                       // 86,000
  approx(calcARF(80_000), 86_000 + 20_000 * 2.5)                       // 136,000
  approx(calcARF(100_000), 136_000 + 20_000 * 3.2)                     // 200,000
})

test('calcARF is monotonic across tier boundaries', () => {
  let prev = -1
  for (let omv = 0; omv <= 120_000; omv += 5_000) {
    const arf = calcARF(omv)
    assert.ok(arf > prev, `ARF should rise with OMV, broke at ${omv}`)
    prev = arf
  }
})

// ─── PARF ────────────────────────────────────────────────────────────────

test('parfPct steps down 5 points a year from 75% to 50%', () => {
  assert.equal(parfPct(3), 0.75)
  assert.equal(parfPct(5), 0.75)
  assert.equal(parfPct(6), 0.70)
  assert.equal(parfPct(7), 0.65)
  assert.equal(parfPct(8), 0.60)
  assert.equal(parfPct(9), 0.55)
  assert.equal(parfPct(10), 0.50)
})

test('parfPct is nil beyond ten years — the COE expiry cliff', () => {
  assert.equal(parfPct(10.5), 0)
  assert.equal(parfPct(11), 0)
})

test('calcPARF is capped at the Budget 2023 ceiling', () => {
  approx(calcPARF(200_000, 5), PARF_CAP) // 75% of 200k = 150k, capped to 60k
  approx(calcPARF(40_000, 5), 30_000)    // 75% of 40k = 30k, under the cap
})

test('calcPARF is zero once the car is over ten years old', () => {
  approx(calcPARF(100_000, 11), 0)
})

// ─── COE rebate ──────────────────────────────────────────────────────────

test('calcCOERebate is pro-rated over the 120-month COE life', () => {
  approx(calcCOERebate(120_000, 60), 60_000)  // half the term left
  approx(calcCOERebate(120_000, 120), 120_000) // brand new
  approx(calcCOERebate(120_000, 0), 0)         // expired
})

test('calcCOERebate never goes negative on an overrun COE', () => {
  approx(calcCOERebate(120_000, -12), 0)
})

// ─── EV incentives ───────────────────────────────────────────────────────

test('isPureEV recognises Tesla and fully-electric types only', () => {
  assert.equal(isPureEV({ rateTier: 'tesla' }), true)
  assert.equal(isPureEV({ type: 'Electric SUV' }), true)
  assert.equal(isPureEV({ type: 'Electric Sedan' }), true)
  assert.equal(isPureEV({ type: 'Petrol' }), false)
  assert.equal(isPureEV({ type: 'SUV · Petrol' }), false)
  assert.equal(isPureEV({}), false)
})

test('isPureEV excludes hybrids that mention "Electric" in their type', () => {
  // EEAI is worth up to $7,500 off ARF, so a hybrid slipping through
  // here would understate its true cost. The dataset currently labels
  // hybrids "SUV · Hybrid", but these phrasings are common enough that
  // the guard has to be explicit rather than incidental.
  assert.equal(isPureEV({ type: 'Petrol-Electric Hybrid' }), false)
  assert.equal(isPureEV({ type: 'Electric Hybrid SUV' }), false)
  assert.equal(isPureEV({ type: 'Plug-in Electric Hybrid' }), false)
  assert.equal(isPureEV({ type: 'SUV · PHEV' }), false)
  assert.equal(isPureEV({ type: 'MPV · e-Power' }), false)
  assert.equal(isPureEV({ type: 'Mild Hybrid Electric' }), false)
})

test('a hybrid gets no EEAI discount on its ARF', () => {
  const hybrid = { omv: 40_000, type: 'Petrol-Electric Hybrid', ves: 0 }
  const g = calcNetARF(hybrid.omv, 0, isPureEV(hybrid))
  approx(g.eeai, 0)
  approx(g.netArf, calcARF(40_000))
})

test('calcNetARF applies EEAI at 45% of ARF for pure EVs', () => {
  // ARF on a $20k OMV is $20k; 45% = $9,000, above the $7,500 cap.
  const ev = calcNetARF(20_000, 0, true)
  approx(ev.eeai, 7_500)
  approx(ev.netArf, 12_500)
})

test('calcNetARF caps EEAI at $7,500', () => {
  const ev = calcNetARF(80_000, 0, true)
  approx(ev.eeai, 7_500, 0.01)
})

test('calcNetARF grants no EEAI to non-EVs', () => {
  const petrol = calcNetARF(20_000, 0, false)
  approx(petrol.eeai, 0)
  approx(petrol.netArf, 20_000)
})

test('calcNetARF subtracts the VES rebate before EEAI and floors at zero', () => {
  const r = calcNetARF(20_000, 25_000, false)
  approx(r.netArf, 0, 0.01)
})

// ─── Government costs ────────────────────────────────────────────────────

test('getCOEPremium prefers a live premium over the fallback', () => {
  assert.equal(getCOEPremium(CAR, 95_000), 95_000)
  assert.equal(getCOEPremium(CAR, null), COE_FALLBACK.catA)
  assert.equal(getCOEPremium({ ...CAR, coe: 'Cat B' }, null), COE_FALLBACK.catB)
})

test('getCOEPremium treats a live premium of zero as a real value, not missing', () => {
  assert.equal(getCOEPremium(CAR, 0), 0)
})

test('calcGovtCosts sums OMV, net ARF, duty, registration and COE', () => {
  const g = calcGovtCosts(CAR, 100_000)
  approx(g.duty, 40_000 * 0.308)
  assert.equal(g.regFee, 350)
  assert.equal(g.coe, 100_000)
  approx(g.total, CAR.omv + g.netArf + g.duty + g.regFee + g.coe)
})

// ─── Price gap ───────────────────────────────────────────────────────────

test('calcPriceGap flags an unreliable margin rather than clamping to zero', () => {
  // A seeded price well below current government costs can't yield a
  // meaningful margin — it must say so instead of showing $0.
  const cheap = { ...CAR, price: 50_000 }
  const gap = calcPriceGap(cheap, 130_000)
  assert.equal(gap.unreliable, true)
  assert.equal(gap.gap, 0)
  assert.match(gap.sublabel, /can't be estimated/)
})

test('calcPriceGap computes a normal distributor margin when the price supports it', () => {
  const gap = calcPriceGap({ ...CAR, price: 250_000 }, 100_000)
  assert.ok(!gap.unreliable)
  assert.ok(gap.gap > 0)
  approx(gap.gapPct, (gap.gap / 250_000) * 100)
})

test('calcPriceGap reports a Tesla subtotal rather than a margin', () => {
  const tesla = { ...CAR, rateTier: 'tesla', type: 'Electric', price: 250_000, subtotalExCOE: 90_000 }
  const gap = calcPriceGap(tesla, 100_000)
  assert.equal(gap.isTesla, true)
  assert.equal(gap.isSubtotal, true)
  approx(gap.gap, 90_000)
})

// ─── Depreciation ────────────────────────────────────────────────────────

test('calcDepr splits total depreciation into annual and monthly', () => {
  const d = calcDepr(CAR, 5, 100_000)
  approx(d.paperValue, d.parf + d.coeRebate)
  approx(d.totalDepr, CAR.price - d.paperValue)
  approx(d.annualDepr, d.totalDepr / 5)
  approx(d.monthlyDepr, d.totalDepr / 5 / 12)
})

test('calcDepr leaves no paper value at the ten-year COE cliff', () => {
  const d = calcDepr(CAR, 10, 100_000)
  approx(d.coeRebate, 0)      // no months left
  approx(d.parf, Math.min(d.netArf * 0.5, PARF_CAP))
})

test('calcDepr depreciates more the longer the car is held', () => {
  const short = calcDepr(CAR, 3, 100_000)
  const long = calcDepr(CAR, 8, 100_000)
  assert.ok(long.totalDepr > short.totalDepr)
  assert.ok(long.annualDepr < short.annualDepr, 'per-year cost falls with a longer hold')
})

test('calcDepr returns a zeroed shape rather than NaN for a malformed car', () => {
  const d = calcDepr({ price: 100_000 }, 5, 100_000)
  assert.ok(Number.isFinite(d.totalDepr))
  assert.ok(Number.isFinite(d.monthlyDepr))
})

// ─── Affordability ───────────────────────────────────────────────────────

test('calc rejects invalid or absurd inputs instead of returning garbage', () => {
  assert.equal(calc(0, 50_000, 5, CAR), null)
  assert.equal(calc(10_000, 0, 5, CAR), null)
  assert.equal(calc(10_000, 50_000, 0, CAR), null)
  assert.equal(calc(10_000, 50_000, 11, CAR), null)
  assert.equal(calc(10_000, 50_000, 5, null), null)
  assert.equal(calc('abc', 50_000, 5, CAR), null)
  assert.equal(calc(10_000, 50_000, 5, { ...CAR, price: 0 }), null)
})

test('calc caps the loan at the car loan-to-value limit', () => {
  const r = calc(20_000, 100_000, 5, CAR) // 70% cap on a $200k car = $140k
  approx(r.maxLoan, 140_000)
  approx(r.reqDown, 60_000)
  assert.equal(r.canDown, true)
  approx(r.loan, 100_000) // price − down, under the cap
})

test('calc accepts a downpayment of exactly the minimum', () => {
  // price × (1 − cap/100) evaluates to 60000.00000000001 in floating
  // point, which used to reject an exactly-minimum downpayment.
  const r = calc(20_000, 60_000, 5, CAR)
  assert.equal(r.canDown, true, 'exactly the minimum downpayment must be accepted')
  assert.equal(r.verdict !== 'Insufficient Downpayment', true)
  approx(r.shortfall, 0)
})

test('calc keeps minimum downpayment exact across loan caps and prices', () => {
  for (const loanCap of [50, 55, 60, 70, 75, 80]) {
    for (const price of [123_456, 200_000, 357_777, 890_123]) {
      const r = calc(20_000, price * (1 - loanCap / 100), 5, { ...CAR, price, loanCap })
      assert.ok(r.canDown, `min downpayment rejected at cap ${loanCap}, price ${price}`)
    }
  }
})

test('calc flags an insufficient downpayment', () => {
  const r = calc(20_000, 10_000, 5, CAR)
  assert.equal(r.canDown, false)
  assert.equal(r.verdict, 'Insufficient Downpayment')
  approx(r.shortfall, 60_000 - 10_000)
})

test('calc computes flat-rate interest and the monthly instalment', () => {
  const r = calc(20_000, 100_000, 5, CAR)
  approx(r.interest, r.loan * r.tier.rate * 5)
  approx(r.repay, r.loan + r.interest)
  approx(r.monthly, r.repay / 60)
})

test('calc grades affordability against 30% of take-home', () => {
  const affordable = calc(40_000, 100_000, 7, CAR)
  assert.ok(affordable.ratio <= 0.30)
  assert.equal(affordable.verdict, 'Affordable')

  // A much smaller downpayment forces a bigger loan on a modest salary.
  const stretched = calc(4_000, 60_000, 5, CAR)
  assert.ok(stretched.ratio > 0.30, `expected a stretched ratio, got ${stretched.ratio}`)
  assert.notEqual(stretched.verdict, 'Affordable')
})

test('calc verdict bands run Affordable → Stretch → Out of Range', () => {
  const seen = new Set()
  for (const salary of [3_000, 5_000, 8_000, 20_000, 60_000]) {
    const r = calc(salary, 60_000, 5, CAR)
    if (r) seen.add(r.verdict)
  }
  assert.ok(seen.has('Affordable'))
  assert.ok(seen.has('Stretch') || seen.has('Out of Range'))
})

test('calc uses gross income for TDSR, not the 80% take-home figure', () => {
  const r = calc(10_000, 100_000, 5, CAR, null, 2_000)
  approx(r.tdsr, (2_000 + r.monthly) / 10_000)
  approx(r.takeHome, 8_000)
  assert.equal(r.tdsrExceeded, r.tdsr > TDSR_LIMIT)
})

test('calc counts existing debt toward TDSR', () => {
  const clean = calc(10_000, 100_000, 5, CAR, null, 0)
  const indebted = calc(10_000, 100_000, 5, CAR, null, 3_000)
  assert.ok(indebted.tdsr > clean.tdsr)
})

test('calc ignores a negative existing-debt figure', () => {
  const r = calc(10_000, 100_000, 5, CAR, null, -5_000)
  assert.equal(r.existingDebt, 0)
})

test('calc builds one ownership-curve point per year', () => {
  const r = calc(20_000, 100_000, 7, CAR)
  assert.equal(r.coo.length, 7)
  assert.equal(r.coo[0].year, 1)
  assert.equal(r.coo[6].year, 7)
})

test('ownership curve sunk cost equals cash out minus paper value', () => {
  const r = calc(20_000, 100_000, 5, CAR)
  for (const point of r.coo) {
    approx(point.sunkCost, point.cashOut - point.paperValue)
    approx(point.cashOut, point.downUsed + point.loanPaid)
    approx(point.principalPaid, point.loanPaid - point.interestPaid)
  }
})

// ─── Affordability ceiling ───────────────────────────────────────────────

test('calcCeiling returns null without a salary or tenure', () => {
  assert.equal(calcCeiling(0, 50_000, 5), null)
  assert.equal(calcCeiling(10_000, 50_000, 0), null)
})

test('calcCeiling reports which constraint binds', () => {
  // Heavy existing debt makes TDSR the binding limit rather than the
  // in-app 30%-of-take-home comfort rule.
  const comfortBound = calcCeiling(10_000, 100_000, 7, 0)
  assert.equal(comfortBound.tdsrBinding, false)

  const tdsrBound = calcCeiling(10_000, 100_000, 7, 5_000)
  assert.equal(tdsrBound.tdsrBinding, true)
  assert.ok(tdsrBound.catA < comfortBound.catA)
})

test('calcCeiling allows a bigger Cat A car than Cat B at the same budget', () => {
  // Cat A permits a 70% loan against Cat B's 60%, so the same cash goes further.
  const c = calcCeiling(10_000, 100_000, 7, 0)
  assert.ok(c.catA > c.catB)
})

// ─── Data freshness ──────────────────────────────────────────────────────

test('isCoeFallbackStale flags a fallback older than the bidding window', () => {
  const justUpdated = new Date(new Date(COE_FALLBACK_AS_OF).getTime() + 10 * 86_400_000)
  assert.equal(isCoeFallbackStale(justUpdated), false)
  const longAfter = new Date(new Date(COE_FALLBACK_AS_OF).getTime() + 90 * 86_400_000)
  assert.equal(isCoeFallbackStale(longAfter), true)
})

// ─── omvToLtv / minDownFor ─────────────────────────────────────────────
// cars.json used to carry loanCap and coe as independently hand-maintained
// fields that could (and did, for over 50 cars) disagree with the car's own
// omv — silently telling a user they qualified for a 70% loan a bank would
// only give at 60%. omvToLtv is now the ONLY place that decision is made.

test('omvToLtv: Cat A / 70% loan at or below the S$20,000 threshold', () => {
  assert.deepEqual(omvToLtv(20000), { coe: 'Cat A', loanCap: 70 })
  assert.deepEqual(omvToLtv(15000), { coe: 'Cat A', loanCap: 70 })
})

test('omvToLtv: Cat B / 60% loan above the S$20,000 threshold', () => {
  assert.deepEqual(omvToLtv(20001), { coe: 'Cat B', loanCap: 60 })
  assert.deepEqual(omvToLtv(27152), { coe: 'Cat B', loanCap: 60 }) // real Corolla Altis omv
})

test('omvToLtv: missing/nullish omv does not throw and defaults to Cat A', () => {
  assert.deepEqual(omvToLtv(undefined), { coe: 'Cat A', loanCap: 70 })
  assert.deepEqual(omvToLtv(null), { coe: 'Cat A', loanCap: 70 })
})

test('minDownFor: exact minimum is not a fraction of a cent short (float-safety regression)', () => {
  // price * (1 - cap/100) evaluates to 60000.00000000001 for these inputs —
  // the bug calc()'s own minDown was fixed away from. minDownFor must not
  // reintroduce it for any other caller (CarPicker, used-car.js, ...).
  const minDown = minDownFor(200000, 70)
  assert.equal(minDown, 60000)
  assert.ok(60000 >= minDown - 0.005)
})

// ─── Joint loans / TDSR apportionment ────────────────────────────────────

test('resolveJointSharePct: income mode splits proportionally to gross income', () => {
  approx(resolveJointSharePct('income', 6000, 4000, null), 60, 0.01)
  approx(resolveJointSharePct('income', 4000, 4000, null), 50, 0.01)
  approx(resolveJointSharePct('income', 4000, 6000, null), 40, 0.01)
})

test('resolveJointSharePct: income mode with a zero/missing co-borrower income defaults to 100 (not a joint loan)', () => {
  assert.equal(resolveJointSharePct('income', 6000, 0, null), 100)
  assert.equal(resolveJointSharePct('income', 0, 0, null), 100)
})

test('resolveJointSharePct: manual mode uses the given percentage directly, clamped to 100', () => {
  assert.equal(resolveJointSharePct('manual', 6000, 4000, 30), 30)
  assert.equal(resolveJointSharePct('manual', 6000, 4000, 150), 100)
})

test('resolveJointSharePct: manual mode with a zero/invalid percentage defaults to 100', () => {
  assert.equal(resolveJointSharePct('manual', 6000, 4000, 0), 100)
  assert.equal(resolveJointSharePct('manual', 6000, 4000, NaN), 100)
})

test('calc: a joint loan counts only your share of the instalment toward your TDSR', () => {
  const solo = calc(6000, 60_000, 7, CAR)
  const joint = calc(6000, 60_000, 7, CAR, null, 0, 50)
  assert.equal(solo.monthly, joint.monthly) // the instalment itself is unaffected
  approx(joint.myMonthlyShare, solo.monthly * 0.5)
  approx(joint.tdsr, solo.tdsr * 0.5)
})

test('calc: mySharePct defaults to 100 (unchanged behavior for a non-joint loan)', () => {
  const withDefault = calc(6000, 60_000, 7, CAR)
  const explicit100 = calc(6000, 60_000, 7, CAR, null, 0, 100)
  assert.equal(withDefault.mySharePct, 100)
  assert.equal(withDefault.myMonthlyShare, withDefault.monthly)
  assert.deepEqual(withDefault, explicit100)
})

test('calcCeiling: a joint loan affords a proportionally higher full instalment for the same personal TDSR budget', () => {
  const solo = calcCeiling(6000, 60_000, 7)
  const joint = calcCeiling(6000, 60_000, 7, 0, 50) // your TDSR budget now only has to cover half the instalment
  approx(joint.maxMonthlyTdsr, solo.maxMonthlyTdsr * 2)
  assert.ok(joint.catA >= solo.catA)
})
