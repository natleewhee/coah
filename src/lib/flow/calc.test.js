// src/lib/flow/calc.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  monthlyCpfSplit, splitMortgagePayment, quickLivingExpenses, detailedLivingExpenses,
  backSolveLivingExpenses, reconciliationGap, monthlyTaxProvision, buildMonthlyFlow,
  trueSavingsRate, cashSavingsRate, fixedCostRatio, runwayMonths,
  emergencyFundTarget, monthsToCloseEmergencyFundGap, DEFAULT_EMERGENCY_FUND_MONTHS,
  buildTwelveMonthSchedule, findTightestMonth, compareGiroToLump, FATE,
} from './calc.js'

function approx(a, b, eps = 0.5) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`)
}

// ─── CPF split ──────────────────────────────────────────────────────────

test('monthlyCpfSplit: employee + employer sums to the total CPF contribution', () => {
  const s = monthlyCpfSplit(8000, 35)
  approx(s.employee + s.employer, s.total)
  approx(s.oa + s.sa + s.ma, s.total)
})

test('monthlyCpfSplit: employer share is never negative even at odd ages', () => {
  for (const age of [22, 35, 56, 61, 66, 71, 90]) {
    const s = monthlyCpfSplit(8000, age)
    assert.ok(s.employer >= 0, `age ${age} employer=${s.employer}`)
  }
})

test('monthlyCpfSplit: zero salary is zero everywhere', () => {
  const s = monthlyCpfSplit(0, 35)
  assert.equal(s.total, 0)
  assert.equal(s.employee, 0)
  assert.equal(s.employer, 0)
})

// ─── Mortgage split ─────────────────────────────────────────────────────

test('splitMortgagePayment: interest + principal equals the instalment', () => {
  const m = splitMortgagePayment({ outstandingBalance: 400000, rate: 2.6, monthlyInstalment: 1815, cpfServicing: 1315 })
  approx(m.interest + m.principal, 1815)
})

test('splitMortgagePayment: cpf + cash legs equal interest and principal respectively', () => {
  const m = splitMortgagePayment({ outstandingBalance: 400000, rate: 2.6, monthlyInstalment: 1815, cpfServicing: 1315 })
  approx(m.cpfInterest + m.cashInterest, m.interest)
  approx(m.cpfPrincipal + m.cashPrincipal, m.principal)
})

test('splitMortgagePayment: cpfServicing of 0 puts the whole instalment on the cash leg', () => {
  const m = splitMortgagePayment({ outstandingBalance: 400000, rate: 2.6, monthlyInstalment: 1815, cpfServicing: 0 })
  approx(m.cpfInterest, 0)
  approx(m.cpfPrincipal, 0)
  approx(m.cashInterest, m.interest)
  approx(m.cashPrincipal, m.principal)
})

test('splitMortgagePayment: cpfServicing covering the WHOLE instalment puts nothing on cash', () => {
  const m = splitMortgagePayment({ outstandingBalance: 400000, rate: 2.6, monthlyInstalment: 1815, cpfServicing: 1815 })
  approx(m.cashInterest, 0)
  approx(m.cashPrincipal, 0)
})

test('splitMortgagePayment: cpfServicing greater than the instalment is clamped, not overcounted', () => {
  const m = splitMortgagePayment({ outstandingBalance: 400000, rate: 2.6, monthlyInstalment: 1815, cpfServicing: 99999 })
  approx(m.cpfInterest + m.cpfPrincipal, m.interest + m.principal)
  approx(m.cashInterest + m.cashPrincipal, 0)
})

test('splitMortgagePayment: zero outstanding balance means the whole instalment is principal', () => {
  const m = splitMortgagePayment({ outstandingBalance: 0, rate: 2.6, monthlyInstalment: 1815, cpfServicing: 0 })
  approx(m.interest, 0)
  approx(m.principal, 1815)
})

// ─── Living expenses ────────────────────────────────────────────────────

test('quickLivingExpenses: passes a positive number through, floors negatives at zero', () => {
  assert.equal(quickLivingExpenses(3200), 3200)
  assert.equal(quickLivingExpenses(-50), 0)
  assert.equal(quickLivingExpenses('abc'), 0)
})

test('detailedLivingExpenses: sums named categories', () => {
  const total = detailedLivingExpenses({ food: 800, transport: 300, utilities: 200 })
  assert.equal(total, 1300)
})

test('detailedLivingExpenses: ignores negative category values instead of subtracting them', () => {
  const total = detailedLivingExpenses({ food: 800, refund: -200 })
  assert.equal(total, 800)
})

test('backSolveLivingExpenses: a shrinking balance with known non-living outflow implies the rest is living', () => {
  // $6,400/mo cash income, balance fell $12,000 over 12 months (net outflow
  // averaging $1,000/mo beyond income), $1,680 known non-living outflow
  // (loans+insurance) — living must be income + implied shortfall - known.
  const living = backSolveLivingExpenses({
    startBalance: 20000, endBalance: 8000, months: 12,
    monthlyCashIncome: 6400, monthlyNonLivingOutflow: 1680,
  })
  // monthlyDelta = -1000; impliedTotalOutflow = 6400 - (-1000) = 7400
  // living = 7400 - 1680 = 5720
  approx(living, 5720)
})

test('backSolveLivingExpenses: a growing balance implies less living spend than income', () => {
  const living = backSolveLivingExpenses({
    startBalance: 8000, endBalance: 20000, months: 12,
    monthlyCashIncome: 6400, monthlyNonLivingOutflow: 1680,
  })
  approx(living, 3720)
})

test('backSolveLivingExpenses: never goes negative even if non-living outflow exceeds implied total', () => {
  const living = backSolveLivingExpenses({
    startBalance: 0, endBalance: 100000, months: 12,
    monthlyCashIncome: 1000, monthlyNonLivingOutflow: 5000,
  })
  assert.equal(living, 0)
})

test('reconciliationGap: zero when the claimed figure matches or exceeds the back-solved one', () => {
  assert.equal(reconciliationGap(3200, 3200), 0)
  assert.equal(reconciliationGap(4000, 3200), 0)
})

test('reconciliationGap: surfaces the unaccounted difference when back-solved exceeds claimed', () => {
  assert.equal(reconciliationGap(2100, 2900), 800)
})

// ─── Tax provision ──────────────────────────────────────────────────────

test('monthlyTaxProvision: prefers the exact TaxWise figure when synced', () => {
  const t = monthlyTaxProvision({ annualTax: 4800, salary: 8000, age: 35 })
  assert.equal(t.exact, true)
  approx(t.monthly, 400)
})

test('monthlyTaxProvision: estimates via calcTax when nothing is synced', () => {
  const t = monthlyTaxProvision({ annualTax: null, salary: 8000, age: 35 })
  assert.equal(t.exact, false)
  assert.ok(t.monthly > 0)
})

test('monthlyTaxProvision: zero salary/age with nothing synced is zero, not NaN', () => {
  const t = monthlyTaxProvision({ annualTax: null, salary: 0, age: 0 })
  assert.equal(t.monthly, 0)
  assert.equal(Number.isNaN(t.monthly), false)
})

// ─── Monthly flow: conservation and metrics ────────────────────────────

const PERSONA = {
  age: 35, salary: 8000, annualTax: 4569,
  house: { outstandingBalance: 400000, rate: 2.6, monthlyInstalment: 1815, cpfServicing: 1315 },
  car: null, insurancePremium: 280, investMonthly: 300, livingExpenses: 3200,
}

test('buildMonthlyFlow: every pass-through node conserves in = out', () => {
  const flow = buildMonthlyFlow(PERSONA)
  const inflow = {}, outflow = {}
  flow.links.forEach(l => {
    outflow[l.from] = (outflow[l.from] || 0) + l.value
    inflow[l.to] = (inflow[l.to] || 0) + l.value
  })
  for (const key of ['cpfTotal', 'cashTotal', 'oa', 'sa', 'ma', 'bank']) {
    approx(inflow[key] || 0, outflow[key] || 0, 0.05)
  }
})

test('buildMonthlyFlow: total comp in equals total comp out across every terminal node', () => {
  const flow = buildMonthlyFlow(PERSONA)
  const totalComp = flow.nodes.salary.value + flow.nodes.employer.value
  const terminals = ['oaGrow', 'saLock', 'maGrow', 'maHealth', 'taxNode', 'car', 'insurance', 'living', 'invest', 'surplus', 'equity', 'mortgageInterest']
  const sum = terminals.reduce((s, k) => s + (flow.nodes[k] ? flow.nodes[k].value : 0), 0)
  approx(sum, totalComp, 0.1)
})

test('buildMonthlyFlow: omits a house/car/insurance/invest node entirely when not present', () => {
  const flow = buildMonthlyFlow({ age: 35, salary: 8000, annualTax: 4569, livingExpenses: 3200 })
  assert.equal(flow.nodes.car, null)
  assert.equal(flow.nodes.insurance, null)
  assert.equal(flow.nodes.invest, null)
  assert.equal(flow.nodes.equity, null)
  assert.equal(flow.nodes.mortgageInterest, null)
  assert.ok(!flow.links.some(l => l.to === 'equity' || l.to === 'car'))
})

test('buildMonthlyFlow: a deficit month produces a negative surplus and drops the surplus link, not clamps it away', () => {
  const flow = buildMonthlyFlow({ ...PERSONA, livingExpenses: 20000 })
  assert.ok(flow.surplus < 0)
  assert.ok(!flow.links.some(l => l.to === 'surplus'))
  assert.equal(flow.nodes.surplus.fate, FATE.GONE)
})

test('trueSavingsRate: matches hand-computed kept+invested over total comp for the persona', () => {
  const flow = buildMonthlyFlow(PERSONA)
  const totalComp = flow.nodes.salary.value + flow.nodes.employer.value
  // Uses the RAW surplus (not Math.max(0, ...)) — trueSavingsRate counts a
  // negative surplus against the rate rather than dropping it, see the
  // deficit-specific regression test below.
  const kept = flow.nodes.oaGrow.value + flow.nodes.saLock.value + flow.nodes.maGrow.value
    + flow.nodes.equity.value + flow.surplus
  const invested = flow.nodes.invest.value
  approx(trueSavingsRate(flow), (kept + invested) / totalComp, 0.001)
})

test('trueSavingsRate: an overspending month is counted AGAINST the rate, not dropped from it entirely', () => {
  const breakeven = buildMonthlyFlow({ ...PERSONA, livingExpenses: 3200 + PERSONA.investMonthly + 0 })
  const overspending = buildMonthlyFlow({ ...PERSONA, livingExpenses: 20000 }) // flow.surplus < 0, per the test above
  assert.ok(overspending.surplus < 0, 'sanity check: this persona really is overspending')
  const overspendingRate = trueSavingsRate(overspending)
  const breakevenRate = trueSavingsRate(breakeven)
  assert.ok(
    overspendingRate < breakevenRate,
    `an overspending month (rate ${overspendingRate}) must show a LOWER true savings rate than a roughly-breakeven one (rate ${breakevenRate}) — previously they could come out equal because the negative surplus was silently dropped instead of subtracted`,
  )
  // The negative surplus should show up as a genuine subtraction, i.e. the
  // rate should be measurably less than 0 once spending is that far underwater.
  assert.ok(overspendingRate < 0, 'a large enough deficit should be able to push the true savings rate negative')
})

test('cashSavingsRate: is bounded between 0 and 1 even with a large deficit', () => {
  const flow = buildMonthlyFlow({ ...PERSONA, livingExpenses: 50000 })
  const rate = cashSavingsRate(flow)
  assert.ok(rate >= 0 && rate <= 1)
})

test('fixedCostRatio: excludes the CPF-funded leg of the mortgage — the whole point of the tool', () => {
  const flow = buildMonthlyFlow(PERSONA)
  const ratio = fixedCostRatio(flow)
  // A naive ratio using the FULL instalment would be far higher.
  const naiveRatio = (flow.mortgage.interest + flow.mortgage.principal + 280) / flow.cash
  assert.ok(ratio < naiveRatio)
})

test('runwayMonths: liquid savings divided by real monthly cash burn', () => {
  const flow = buildMonthlyFlow(PERSONA)
  const months = runwayMonths(flow, 6500)
  assert.ok(months > 0 && months < 3)
})

test('runwayMonths: zero burn returns Infinity rather than dividing by zero', () => {
  const flow = buildMonthlyFlow({ age: 35, salary: 8000, annualTax: 0, livingExpenses: 0 })
  assert.equal(runwayMonths(flow, 5000), Infinity)
})

// ─── Emergency fund sizing ──────────────────────────────────────────────

test('emergencyFundTarget: target is burn × targetMonths, default 6', () => {
  const flow = buildMonthlyFlow(PERSONA)
  const { burn, targetAmount } = emergencyFundTarget(flow, 0)
  approx(targetAmount, burn * DEFAULT_EMERGENCY_FUND_MONTHS)
})

test('emergencyFundTarget: gap is target minus current liquid savings, floored at zero', () => {
  const flow = buildMonthlyFlow(PERSONA)
  const under = emergencyFundTarget(flow, 0)
  assert.ok(under.gap > 0)
  approx(under.gap, under.targetAmount)

  const over = emergencyFundTarget(flow, under.targetAmount * 2)
  assert.equal(over.gap, 0, 'gap should floor at zero once savings exceed the target, not go negative')
})

test('emergencyFundTarget: honors a custom targetMonths', () => {
  const flow = buildMonthlyFlow(PERSONA)
  const threeMonth = emergencyFundTarget(flow, 0, 3)
  const sixMonth = emergencyFundTarget(flow, 0, 6)
  approx(sixMonth.targetAmount, threeMonth.targetAmount * 2)
})

test('emergencyFundTarget: zero burn returns a null target rather than 0 (nothing to insure against)', () => {
  const flow = buildMonthlyFlow({ age: 35, salary: 8000, annualTax: 0, livingExpenses: 0 })
  const result = emergencyFundTarget(flow, 5000)
  assert.equal(result.burn, 0)
  assert.equal(result.targetAmount, null)
  assert.equal(result.gap, 0)
})

test('monthsToCloseEmergencyFundGap: rounds up to the next whole month', () => {
  assert.equal(monthsToCloseEmergencyFundGap(2500, 1000), 3)
})

test('monthsToCloseEmergencyFundGap: zero gap needs zero months regardless of contribution', () => {
  assert.equal(monthsToCloseEmergencyFundGap(0, 500), 0)
  assert.equal(monthsToCloseEmergencyFundGap(0, 0), 0)
})

test('monthsToCloseEmergencyFundGap: a gap with zero/negative contribution never closes', () => {
  assert.equal(monthsToCloseEmergencyFundGap(1000, 0), Infinity)
  assert.equal(monthsToCloseEmergencyFundGap(1000, -50), Infinity)
})

// ─── Twelve-month schedule ──────────────────────────────────────────────

test('buildTwelveMonthSchedule: lump tax mode dents exactly one month by the full annual tax', () => {
  const schedule = buildTwelveMonthSchedule({ baseMonthlySurplus: 1000, annualTax: 4800, taxMode: 'lump', taxDueMonth: 3 })
  approx(schedule[3].net, 1000 - 4800)
  approx(schedule[0].net, 1000)
})

test('buildTwelveMonthSchedule: giro tax mode spreads the annual tax evenly across all twelve months', () => {
  const schedule = buildTwelveMonthSchedule({ baseMonthlySurplus: 1000, annualTax: 4800, taxMode: 'giro' })
  schedule.forEach(row => approx(row.net, 1000 - 400))
})

test('buildTwelveMonthSchedule: lumpy one-off items land only in their month', () => {
  const schedule = buildTwelveMonthSchedule({
    baseMonthlySurplus: 1000, annualTax: 0,
    lumpyItems: [{ label: 'Road tax', amount: -500, month: 1 }],
  })
  approx(schedule[1].net, 500)
  approx(schedule[0].net, 1000)
})

test('buildTwelveMonthSchedule: an everyMonth item recurs across all twelve rows', () => {
  const schedule = buildTwelveMonthSchedule({
    baseMonthlySurplus: 1000, annualTax: 0,
    lumpyItems: [{ label: 'Extra subscription', amount: -20, everyMonth: true }],
  })
  schedule.forEach(row => approx(row.net, 980))
})

test('findTightestMonth: identifies the lowest running balance and the shortfall if negative', () => {
  const schedule = buildTwelveMonthSchedule({ baseMonthlySurplus: 1000, annualTax: 12000, taxMode: 'lump', taxDueMonth: 4, startBalance: 3000 })
  const trough = findTightestMonth(schedule)
  assert.equal(trough.month, 4)
  assert.ok(trough.shortfall > 0)
})

test('findTightestMonth: shortfall is zero when the balance never goes negative', () => {
  const schedule = buildTwelveMonthSchedule({ baseMonthlySurplus: 5000, annualTax: 1200, taxMode: 'lump', taxDueMonth: 3, startBalance: 10000 })
  const trough = findTightestMonth(schedule)
  assert.equal(trough.shortfall, 0)
})

test('compareGiroToLump: both modes end the year at the identical balance — GIRO only reshapes the year, not the total', () => {
  const cmp = compareGiroToLump({ baseMonthlySurplus: 1200, annualTax: 4569, taxDueMonth: 3, startBalance: 5000 })
  approx(cmp.yearEndLump, cmp.yearEndGiro, 0.01)
})

// ─── Regression: buildMonthlyFlow's surplus feeding buildTwelveMonthSchedule
// must not double-count tax. flow.surplus already has this month's tax
// provision (flow.tax.monthly) subtracted — the schedule does its OWN tax
// accounting (GIRO or lump), so the caller (src/components/ledger/CapacityModule.js)
// must add tax.monthly back onto the base before handing it to the schedule, or a
// full year of tax gets subtracted twice: once already baked into every
// month's base, and again via the schedule's own taxByMonth.
test('flow.surplus fed into buildTwelveMonthSchedule without adding tax back double-counts a full year of tax (documents the bug the page.js fix avoids)', () => {
  const flow = buildMonthlyFlow(PERSONA)
  const buggySchedule = buildTwelveMonthSchedule({
    baseMonthlySurplus: flow.surplus, annualTax: flow.tax.monthly * 12,
    taxMode: 'lump', taxDueMonth: 3,
  })
  const correctSchedule = buildTwelveMonthSchedule({
    baseMonthlySurplus: flow.surplus + flow.tax.monthly, annualTax: flow.tax.monthly * 12,
    taxMode: 'lump', taxDueMonth: 3,
  })
  const buggyYearEnd = buggySchedule[11].balance
  const correctYearEnd = correctSchedule[11].balance
  // The buggy version is short by exactly one year of tax vs the correct one.
  approx(correctYearEnd - buggyYearEnd, flow.tax.monthly * 12, 0.01)
})

test('flow.surplus + tax.monthly fed into buildTwelveMonthSchedule reproduces the true annual surplus exactly once (no double-count)', () => {
  const flow = buildMonthlyFlow(PERSONA)
  const schedule = buildTwelveMonthSchedule({
    baseMonthlySurplus: flow.surplus + flow.tax.monthly, annualTax: flow.tax.monthly * 12,
    taxMode: 'giro', startBalance: 0,
  })
  // GIRO mode: every month nets to exactly flow.surplus (tax fully
  // smoothed away), so twelve months should sum to 12x the true monthly
  // surplus, not 12x surplus minus an extra year of tax.
  approx(schedule[11].balance, flow.surplus * 12, 0.05)
})

test('compareGiroToLump: GIRO never has a deeper trough than lump-sum for the same inputs', () => {
  const cmp = compareGiroToLump({ baseMonthlySurplus: 500, annualTax: 8000, taxDueMonth: 3, startBalance: 2000 })
  assert.ok(cmp.giroTrough.shortfall <= cmp.lumpTrough.shortfall)
})
