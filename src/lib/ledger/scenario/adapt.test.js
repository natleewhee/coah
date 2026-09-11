// src/lib/ledger/scenario/adapt.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildScenarioBaseState, buildRetireAssumptions, resolveReference, staleSyncedSlots, SYNC_STALE_DAYS,
  toEngineMove, yearError, positionFromStore,
} from './adapt.js'
import { calcInvestmentCapacity, buildBaselineState } from '../calc.js'

const MY_NUMBERS = {
  retire: { salary: 8000, oaBalance: 100_000, saBalance: 80_000, maBalance: 40_000, investmentBalance: 60_000, monthlyContribution: 2000, savedAt: Date.now() },
  house: { propertyValue: 900_000, outstandingBalance: 400_000, rate: 2.8, tenureRemaining: 18, savedAt: Date.now() },
  flow: { livingExpenses: 3800 },
}

test('buildScenarioBaseState maps CPF, investments, and the property from the store', () => {
  const s = buildScenarioBaseState(MY_NUMBERS, { startingCash: 200_000 })
  assert.equal(s.startingOA, 100_000)
  assert.equal(s.startingSA, 80_000)
  assert.equal(s.investmentStart, 60_000)
  assert.equal(s.startingCash, 200_000)
  assert.deepEqual(s.property, { value: 900_000, mortgagePrincipal: 400_000, mortgageRatePct: 2.8, mortgageTenureYears: 18 })
})

test('buildScenarioBaseState yields a null property when no house slot is set', () => {
  const s = buildScenarioBaseState({ retire: MY_NUMBERS.retire }, {})
  assert.equal(s.property, null)
  assert.equal(s.startingCash, 0)
})

test('an entered position overrides the store field by field; blanks fall back to the store', () => {
  const s = buildScenarioBaseState(MY_NUMBERS, {
    cpfOa: '', cpfSa: '55000', cpfMa: '',       // SA overridden, OA/MA from store
    investments: '90000', cash: '30000',
    propertyValue: '1200000', mortgageBalance: '350000', mortgageRate: '3.1', mortgageYearsLeft: '12',
    carValue: '80000', loansMonthly: '900', loansYearsLeft: '4',
  })
  assert.equal(s.startingOA, 100_000)  // blank -> store
  assert.equal(s.startingSA, 55_000)   // overridden
  assert.equal(s.investmentStart, 90_000)
  assert.equal(s.startingCash, 30_000)
  assert.deepEqual(s.property, { value: 1_200_000, mortgagePrincipal: 350_000, mortgageRatePct: 3.1, mortgageTenureYears: 12 })
  assert.equal(s.carValue, 80_000)
  assert.deepEqual(s.currentLoans, { monthly: 900, yearsLeft: 4 })
})

test('buildScenarioBaseState still accepts the legacy { startingCash } alias', () => {
  const s = buildScenarioBaseState({}, { startingCash: 200_000 })
  assert.equal(s.startingCash, 200_000)
})

test('a fully-empty position with an empty store is all zeros and no property', () => {
  const s = buildScenarioBaseState({}, {})
  assert.equal(s.startingOA, 0)
  assert.equal(s.investmentStart, 0)
  assert.equal(s.startingCash, 0)
  assert.equal(s.property, null)
  assert.equal(s.carValue, 0)
  assert.deepEqual(s.currentLoans, { monthly: 0, yearsLeft: 0 })
})

test('positionFromStore pre-fills the editable fields from synced tool numbers', () => {
  const p = positionFromStore(MY_NUMBERS)
  assert.equal(p.cpfOa, '100000')
  assert.equal(p.investments, '60000')
  assert.equal(p.propertyValue, '900000')
  assert.equal(p.mortgageBalance, '400000')
  assert.equal(p.mortgageRate, '2.8')
  assert.equal(p.cash, '') // no source tool for cash
})

test('buildRetireAssumptions uses canonical investment capacity, ignoring RetireWell\'s own synced contribution (KD1)', () => {
  const expectedCapacity = calcInvestmentCapacity(buildBaselineState(MY_NUMBERS))
  const a = buildRetireAssumptions(MY_NUMBERS, { currentAge: 42, retirementAge: 65, lifeExpectancy: 92, swr: 3 })
  assert.equal(a.currentAge, 42)
  assert.equal(a.salary, 8000) // from the slot
  assert.equal(a.investmentMonthly, expectedCapacity) // canonical capacity, not the slot's monthlyContribution (2000)
  // A surface-typed investmentMonthly no longer overrides the canonical figure.
  const b = buildRetireAssumptions(MY_NUMBERS, { salary: 9500, investmentMonthly: 3000 })
  assert.equal(b.salary, 9500)
  assert.equal(b.investmentMonthly, expectedCapacity)
})

test('resolveReference uses FlowState living expenses when present, else the user field', () => {
  assert.deepEqual(resolveReference(MY_NUMBERS, 5000), { reference: 3800, source: 'flow' })
  assert.deepEqual(resolveReference({ flow: { livingExpenses: 0 } }, 4200), { reference: 4200, source: 'user' })
  assert.deepEqual(resolveReference({}, 0), { reference: 0, source: 'none' })
})

test('staleSyncedSlots flags a slot older than the window and ignores an unsynced one', () => {
  const old = Date.now() - (SYNC_STALE_DAYS + 30) * 86_400_000
  const flagged = staleSyncedSlots({
    retire: { savedAt: old },
    house: { savedAt: Date.now() },
    // drive: never synced
  })
  assert.equal(flagged.length, 1)
  assert.equal(flagged[0].slot, 'retire')
  assert.ok(flagged[0].months >= 6)
})

test('staleSyncedSlots is empty when everything synced is recent', () => {
  assert.deepEqual(staleSyncedSlots(MY_NUMBERS), [])
})

test('staleSyncedSlots skips a non-numeric / zero savedAt instead of throwing', () => {
  // A throw here would abort the page's mount effect and leave the whole
  // planner un-restored.
  assert.deepEqual(staleSyncedSlots({ retire: { savedAt: '2020-01-01' }, house: { savedAt: 0 }, drive: { savedAt: NaN } }), [])
})

// ─── surface → engine move mapping ───────────────────────────────────

test('yearError covers each validation branch', () => {
  assert.equal(yearError('', 25), 'Set a year')
  assert.equal(yearError(null, 25), 'Set a year')
  assert.equal(yearError('2.5', 25), 'Whole years only')
  assert.equal(yearError('-1', 25), 'Cannot be negative')
  assert.equal(yearError('25', 25), 'Before retirement (< 25)')
  assert.equal(yearError('24', 25), null)
  assert.equal(yearError('0', 25), null)
  assert.equal(yearError('30', 0), null) // retirement horizon unknown -> only shape is checked
})

test('toEngineMove renames and coerces each move type into the engine shape', () => {
  const carsById = { sealion7: { id: 'sealion7', price: 265388 } }

  const sell = toEngineMove({ type: 'sell-property', year: '3', inputs: { salePrice: '900,000', purchaseDate: '2016-01-01', saleDate: '' } })
  assert.equal(sell.year, 3)
  assert.equal(sell.inputs.salePrice, 900000)
  assert.equal(sell.inputs.saleDate, undefined) // '' -> undefined so the resolver's date guard fires
  assert.equal(sell.inputs.propertyType, 'private')

  const buy = toEngineMove({ type: 'buy-property', year: '5', inputs: { newPrice: '1.4m', newLoanAmount: '900k' } })
  assert.equal(buy.inputs.newPrice, 1400000)
  assert.equal(buy.inputs.newLoanAmount, 900000)

  const cash = toEngineMove({ type: 'cash-to-investments', year: '0', inputs: { amount: '150000' } })
  assert.deepEqual(cash.inputs, { amount: 150000, direction: 'in' })

  const car = toEngineMove({ type: 'buy-car', year: '2', inputs: { carId: 'sealion7', down: '120000', tenure: '7' } }, carsById, 12000)
  assert.equal(car.inputs.car.id, 'sealion7')
  assert.equal(car.inputs.salary, 12000)
  assert.equal(car.inputs.down, 120000)

  const carMiss = toEngineMove({ type: 'buy-car', year: '2', inputs: { carId: 'gone', down: '120000', tenure: '7' } }, carsById, 12000)
  assert.equal(carMiss.inputs.car, null) // unknown / stale carId -> null, resolver then warns

  const child = toEngineMove({ type: 'have-child', year: '4', inputs: { annualCost: '18000', supportYears: '', lumpYear: '' } })
  assert.equal(child.inputs.annualCost, 18000)
  assert.equal(child.inputs.supportYears, undefined)
  assert.equal(child.inputs.lumpYear, undefined)
})
