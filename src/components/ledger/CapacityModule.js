'use client'

// The Capacity module — FlowState's measurement flow, relocated into
// MyLedger as a section (KD2/KD6) rather than a standalone tool. Same calc
// engine (src/lib/flow/calc.js) and the same saveFlowNumbers/saveFlowInputs
// persistence calls FlowState always used (KTD2) — only the page chrome
// (hero, ShellHeader) is gone, since it now lives inside /ledger's own
// shell instead of owning one.

import { useEffect, useMemo, useState } from 'react'
import { C, SGD, parseMoney } from '@/lib/ledger/theme'
import {
  buildMonthlyFlow, quickLivingExpenses, detailedLivingExpenses,
  backSolveLivingExpenses, reconciliationGap, buildTwelveMonthSchedule,
  trueSavingsRate, cashSavingsRate, fixedCostRatio, runwayMonths,
  emergencyFundTarget, DEFAULT_MA_HEALTH_PREMIUM,
} from '@/lib/flow/calc'
import { loadMyNumbers, saveFlowNumbers, saveFlowInputs, loadFlowInputs } from '@/lib/shared/profile'
import { MoneyInput, NumberInput, PercentInput, SectionDivider, Segmented, Toggle } from '@/components/ledger/ui'
import CapacityResults from './CapacityResults'
import Button from '@/components/shared/Button'
import AutosaveIndicator from '@/components/shared/AutosaveIndicator'

const num = parseMoney
// parseMoney strips a leading "-" (built for money fields, never negative),
// so a share typed as "-20" reads as +20 and the "< 0" warning below never
// fires even though resolveSharePct correctly clamps it to 0% — Number()
// preserves the sign so the warning agrees with what's actually applied.
const numSigned = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
let lumpyCounter = 0
const nextLumpyId = () => { lumpyCounter += 1; return `lumpy-${lumpyCounter}` }

// Clamps a typed share % into [0,100], defaulting to 100 (i.e. "the whole
// thing") on anything unparseable — same safe pattern as HouseMuch's own
// resolveSharePct, using Number.isFinite rather than `|| 100` so an
// explicit 0% isn't silently coerced back up to 100%.
function resolveSharePct(pct) {
  const n = Number(pct)
  if (!Number.isFinite(n)) return 100
  return Math.min(100, Math.max(0, n))
}

const CATEGORY_FIELDS = [
  { key: 'food', label: 'Food & groceries' },
  { key: 'transport', label: 'Transport' },
  { key: 'utilities', label: 'Utilities' },
  { key: 'telco', label: 'Phone & internet' },
  { key: 'parents', label: 'Parents / family allowance' },
  { key: 'childcare', label: 'Childcare / school' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'shopping', label: 'Everything else' },
]

const MONTH_OPTIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  .map((label, value) => ({ label, value: String(value) }))

export default function CapacityModule() {
  // ─── You / income ───────────────────────────────────────────────────
  const [age, setAge] = useState('')
  const [salary, setSalary] = useState('')
  const [salaryPrefilled, setSalaryPrefilled] = useState(false)

  // ─── Housing ─────────────────────────────────────────────────────────
  const [hasHouse, setHasHouse] = useState(false)
  const [houseSource, setHouseSource] = useState('manual')
  const [outstandingBalance, setOutstandingBalance] = useState('') // the FULL loan, before any joint-loan share
  const [rate, setRate] = useState('2.60')
  const [monthlyInstalment, setMonthlyInstalment] = useState('') // the FULL instalment, before any joint-loan share
  const [cpfServicing, setCpfServicing] = useState('') // YOUR share only — CPF is never split by the ratio below
  const [hasJointLoan, setHasJointLoan] = useState(false)
  const [yourSharePct, setYourSharePct] = useState('50')

  // ─── Car ─────────────────────────────────────────────────────────────
  const [hasCar, setHasCar] = useState(false)
  const [carSource, setCarSource] = useState('manual')
  const [carInstalment, setCarInstalment] = useState('')

  // ─── Insurance ───────────────────────────────────────────────────────
  const [insuranceSource, setInsuranceSource] = useState('manual')
  const [insurancePremium, setInsurancePremium] = useState('')
  const [insuranceFrequency, setInsuranceFrequency] = useState('monthly') // 'monthly' | 'annual'
  const [maHealthPremium, setMaHealthPremium] = useState(String(DEFAULT_MA_HEALTH_PREMIUM))
  const [maHealthFrequency, setMaHealthFrequency] = useState('monthly')

  // ─── Investing ───────────────────────────────────────────────────────
  const [investSource, setInvestSource] = useState('manual')
  const [investMonthly, setInvestMonthly] = useState('')

  // ─── Tax ─────────────────────────────────────────────────────────────
  const [taxSource, setTaxSource] = useState('manual')
  const [annualTax, setAnnualTax] = useState('')

  // ─── Living expenses ─────────────────────────────────────────────────
  const [livingMode, setLivingMode] = useState('quick')
  const [quickAmount, setQuickAmount] = useState('')
  const [categories, setCategories] = useState(Object.fromEntries(CATEGORY_FIELDS.map(f => [f.key, ''])))
  const [backStart, setBackStart] = useState('')
  const [backEnd, setBackEnd] = useState('')
  const [backMonths, setBackMonths] = useState('12')
  const [showReconcile, setShowReconcile] = useState(false)

  // ─── Runway ──────────────────────────────────────────────────────────
  const [liquidSavings, setLiquidSavings] = useState('')

  // ─── Twelve-month planner ────────────────────────────────────────────
  const [taxPaymentMode, setTaxPaymentMode] = useState('lump') // 'lump' | 'monthly' (GIRO)
  const [taxDueMonth, setTaxDueMonth] = useState('3')
  const [lumpyItems, setLumpyItems] = useState([])

  const [calculated, setCalculated] = useState(false)
  const [restoredFromSave, setRestoredFromSave] = useState(false)
  const [hasRestored, setHasRestored] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  // Increments on every autosave — see the matching comment in
  // src/app/house/page.js for why a plain boolean isn't enough to keep
  // "Saved ✓" showing continuously through a fast typing burst.
  const [savedTick, setSavedTick] = useState(0)

  // On mount: if this profile has an autosaved Capacity session, restore
  // it exactly as typed and skip the cross-tool auto-fill entirely — an
  // autosave represents a deliberate edit (including any manual overrides
  // of a synced figure) and should win over guessing fresh from other
  // tools every time. Only a profile that's never opened this module
  // before falls through to the original auto-fill-from-other-tools
  // behavior. Nothing is sent anywhere; see src/lib/shared/profile.js.
  useEffect(() => {
    const saved = loadFlowInputs()
    if (saved) {
      if (saved.age != null) setAge(saved.age)
      if (saved.salary != null) setSalary(saved.salary)
      setSalaryPrefilled(!!saved.salaryPrefilled)
      setHasHouse(!!saved.hasHouse)
      setHouseSource(saved.houseSource || 'manual')
      setOutstandingBalance(saved.outstandingBalance || '')
      setRate(saved.rate || '2.60')
      setMonthlyInstalment(saved.monthlyInstalment || '')
      setCpfServicing(saved.cpfServicing || '')
      setHasJointLoan(!!saved.hasJointLoan)
      setYourSharePct(saved.yourSharePct || '50')
      setHasCar(!!saved.hasCar)
      setCarSource(saved.carSource || 'manual')
      setCarInstalment(saved.carInstalment || '')
      setInsuranceSource(saved.insuranceSource || 'manual')
      setInsurancePremium(saved.insurancePremium || '')
      setInsuranceFrequency(saved.insuranceFrequency || 'monthly')
      setMaHealthPremium(saved.maHealthPremium ?? String(DEFAULT_MA_HEALTH_PREMIUM))
      setMaHealthFrequency(saved.maHealthFrequency || 'monthly')
      setInvestSource(saved.investSource || 'manual')
      setInvestMonthly(saved.investMonthly || '')
      setTaxSource(saved.taxSource || 'manual')
      setAnnualTax(saved.annualTax || '')
      setLivingMode(saved.livingMode || 'quick')
      setQuickAmount(saved.quickAmount || '')
      setCategories(saved.categories || Object.fromEntries(CATEGORY_FIELDS.map(f => [f.key, ''])))
      setBackStart(saved.backStart || '')
      setBackEnd(saved.backEnd || '')
      setBackMonths(saved.backMonths || '12')
      setShowReconcile(!!saved.showReconcile)
      setLiquidSavings(saved.liquidSavings || '')
      setTaxPaymentMode(saved.taxPaymentMode || 'lump')
      setTaxDueMonth(saved.taxDueMonth || '3')
      setLumpyItems(Array.isArray(saved.lumpyItems) ? saved.lumpyItems : [])
      setRestoredFromSave(true)
      setHasRestored(true)
      return
    }

    const myNumbers = loadMyNumbers()
    const { house, drive, retire, insure, tax, etf } = myNumbers

    const knownSalary = retire?.salary || drive?.salary || 0
    if (knownSalary > 0) { setSalary(String(Math.round(knownSalary))); setSalaryPrefilled(true) }
    if (tax?.age) setAge(String(Math.round(tax.age)))

    if (house) {
      setHasHouse(true)
      setHouseSource('auto')
      if (house.outstandingBalance != null) setOutstandingBalance(String(Math.round(house.outstandingBalance)))
      if (house.rate != null) setRate(String(house.rate))
      if (house.monthlyInstalment != null) setMonthlyInstalment(String(Math.round(house.monthlyInstalment)))
      if (house.cpfServicing != null) setCpfServicing(String(Math.round(house.cpfServicing)))
    }
    if (drive?.monthlyInstalment) {
      setHasCar(true)
      setCarSource('auto')
      setCarInstalment(String(Math.round(drive.monthlyInstalment)))
    }
    if (insure?.monthlyPremium) {
      setInsuranceSource('auto')
      setInsurancePremium(String(Math.round(insure.monthlyPremium)))
      setInsuranceFrequency('monthly') // InsureCheck always syncs a monthly figure
    }
    if (etf?.monthlyContribution) {
      setInvestSource('auto')
      setInvestMonthly(String(Math.round(etf.monthlyContribution)))
    }
    if (tax?.annualTax != null) {
      setTaxSource('auto')
      setAnnualTax(String(Math.round(tax.annualTax)))
    }
    setHasRestored(true)
  }, [])

  // Autosave every keystroke, same as DriveReady's own persistence, just
  // scoped to whichever profile is active. Gated on hasRestored so this
  // can't fire (with blank defaults) before the restore effect above has
  // had a chance to apply.
  useEffect(() => {
    if (!hasRestored) return
    const ok = saveFlowInputs({
      age, salary, salaryPrefilled,
      hasHouse, houseSource, outstandingBalance, rate, monthlyInstalment, cpfServicing, hasJointLoan, yourSharePct,
      hasCar, carSource, carInstalment,
      insuranceSource, insurancePremium, insuranceFrequency, maHealthPremium, maHealthFrequency,
      investSource, investMonthly,
      taxSource, annualTax,
      livingMode, quickAmount, categories, backStart, backEnd, backMonths, showReconcile,
      liquidSavings,
      taxPaymentMode, taxDueMonth, lumpyItems,
    })
    // Only flash "Saved" when the write actually landed — see tax/page.js.
    if (ok) {
      setSavedTick(t => t + 1)
    }
  }, [
    hasRestored, age, salary, salaryPrefilled,
    hasHouse, houseSource, outstandingBalance, rate, monthlyInstalment, cpfServicing, hasJointLoan, yourSharePct,
    hasCar, carSource, carInstalment,
    insuranceSource, insurancePremium, insuranceFrequency, maHealthPremium, maHealthFrequency,
    investSource, investMonthly,
    taxSource, annualTax,
    livingMode, quickAmount, categories, backStart, backEnd, backMonths, showReconcile,
    liquidSavings,
    taxPaymentMode, taxDueMonth, lumpyItems,
  ])

  useEffect(() => {
    if (savedTick === 0) return
    setJustSaved(true)
    const t = setTimeout(() => setJustSaved(false), 1400)
    return () => clearTimeout(t)
  }, [savedTick])

  const isReady = num(age) > 0 && num(salary) > 0

  // A joint loan's FULL balance/instalment get scaled down to your share
  // here — cpfServicing is deliberately NEVER scaled, since CPF is
  // tracked per-person and is already meant to be entered as your own
  // share (the same reasoning HouseMuch and MyLedger use for their own
  // joint-loan handling).
  const houseShare = hasJointLoan ? resolveSharePct(yourSharePct) / 100 : 1
  const house = useMemo(() => hasHouse ? {
    outstandingBalance: num(outstandingBalance) * houseShare, rate: num(rate),
    monthlyInstalment: num(monthlyInstalment) * houseShare, cpfServicing: num(cpfServicing),
  } : null, [hasHouse, outstandingBalance, rate, monthlyInstalment, cpfServicing, houseShare])

  const car = useMemo(() => hasCar ? { monthlyInstalment: num(carInstalment) } : null, [hasCar, carInstalment])

  // Insurance is very often billed annually, not monthly — enter either
  // and the flow always works off the monthly-equivalent.
  const insurancePremiumMonthly = insuranceFrequency === 'annual' ? num(insurancePremium) / 12 : num(insurancePremium)
  const maHealthPremiumMonthly = maHealthFrequency === 'annual' ? num(maHealthPremium) / 12 : num(maHealthPremium)

  // Claimed living expenses, from whichever mode is active.
  const claimedLiving = useMemo(() => {
    if (livingMode === 'quick') return quickLivingExpenses(quickAmount)
    if (livingMode === 'detailed') return detailedLivingExpenses(categories)
    // 'backsolve' computes its own figure below, once we know cash income
    // and non-living outflow — see backSolvedLiving.
    return 0
  }, [livingMode, quickAmount, categories])

  // A preview flow at zero living expenses, purely to read off cash
  // income and non-living cash outflow for the back-solve calculation
  // and the reconciliation check.
  const previewFlow = useMemo(() => {
    if (!isReady) return null
    return buildMonthlyFlow({
      age: num(age), salary: num(salary), annualTax: taxSource === 'auto' ? num(annualTax) : null,
      house, car, insurancePremium: insurancePremiumMonthly, maHealthPremium: maHealthPremiumMonthly,
      investMonthly: num(investMonthly), livingExpenses: 0,
    })
  }, [isReady, age, salary, taxSource, annualTax, house, car, insurancePremiumMonthly, maHealthPremiumMonthly, investMonthly])

  // At zero living expenses, surplus = cash − every other cash outflow,
  // so the outflow itself is just their difference.
  const nonLivingCashOutflow = previewFlow ? previewFlow.cash - previewFlow.surplus : 0

  const backSolvedLiving = useMemo(() => {
    if (!previewFlow) return 0
    return backSolveLivingExpenses({
      startBalance: backStart, endBalance: backEnd, months: backMonths,
      monthlyCashIncome: previewFlow.cash, monthlyNonLivingOutflow: nonLivingCashOutflow,
    })
  }, [previewFlow, backStart, backEnd, backMonths, nonLivingCashOutflow])

  const livingExpenses = livingMode === 'backsolve' ? backSolvedLiving : claimedLiving

  const gap = (livingMode !== 'backsolve' && backStart !== '' && backEnd !== '')
    ? reconciliationGap(claimedLiving, backSolvedLiving) : 0

  const flow = useMemo(() => {
    if (!isReady) return null
    return buildMonthlyFlow({
      age: num(age), salary: num(salary), annualTax: taxSource === 'auto' ? num(annualTax) : null,
      house, car, insurancePremium: insurancePremiumMonthly, maHealthPremium: maHealthPremiumMonthly,
      investMonthly: num(investMonthly), livingExpenses,
    })
  }, [isReady, age, salary, taxSource, annualTax, house, car, insurancePremiumMonthly, maHealthPremiumMonthly, investMonthly, livingExpenses])

  const metrics = flow ? {
    trueSavings: trueSavingsRate(flow),
    cashSavings: cashSavingsRate(flow),
    fixedCost: fixedCostRatio(flow),
    runway: runwayMonths(flow, liquidSavings),
    emergencyFund: emergencyFundTarget(flow, num(liquidSavings)),
  } : null

  // Twelve-month schedule: base surplus is this typical month's, plus
  // every lumpy item — each one entered as a positive amount and tagged
  // either 'expense' (subtracts) or 'bonus' (adds), so the schedule gets
  // a correctly-signed number regardless of which the user picked.
  const items = useMemo(() => (
    lumpyItems.map(i => ({
      label: i.label, month: Number(i.month),
      amount: i.type === 'bonus' ? num(i.amount) : -num(i.amount),
    }))
  ), [lumpyItems])

  // Total of everything marked 'bonus' — feeds the CPF-annual-ceiling
  // insight in CapacityResults.js, which needs a positive annual figure.
  const annualBonusTotal = useMemo(() => (
    lumpyItems.filter(i => i.type === 'bonus').reduce((sum, i) => sum + num(i.amount), 0)
  ), [lumpyItems])

  // flow.surplus already has this month's tax provision (flow.tax.monthly)
  // subtracted — buildTwelveMonthSchedule does its OWN tax accounting
  // (spreading it via GIRO or dropping it as a lump sum in one month), so
  // the schedule needs a baseline with tax added back first. Passing
  // flow.surplus directly would double-subtract a full year of tax: once
  // already baked into every month's base, and again via the schedule's
  // own taxByMonth.
  const preTaxMonthlyBase = flow ? flow.surplus + flow.tax.monthly : 0

  const primarySchedule = flow ? buildTwelveMonthSchedule({
    baseMonthlySurplus: preTaxMonthlyBase, annualTax: flow.tax.monthly * 12,
    taxMode: taxPaymentMode === 'monthly' ? 'giro' : 'lump',
    taxDueMonth: num(taxDueMonth), lumpyItems: items, startBalance: num(liquidSavings),
  }) : null

  // Only worth showing an alternative when the primary plan is lump-sum
  // — someone already on GIRO has nothing to switch to.
  const altSchedule = (flow && taxPaymentMode === 'lump') ? buildTwelveMonthSchedule({
    baseMonthlySurplus: preTaxMonthlyBase, annualTax: flow.tax.monthly * 12,
    taxMode: 'giro', lumpyItems: items, startBalance: num(liquidSavings),
  }) : null

  // Write the measured monthly figures back to the shared store so the
  // rest of MyLedger's scenario engine picks them up — see
  // ledger/calc.js's calcInvestmentCapacity/buildCapacitySchedule and
  // scenario/adapt.js's buildRetireAssumptions (KD1/KTD1).
  useEffect(() => {
    if (!calculated || !flow) return
    saveFlowNumbers({
      livingExpenses: flow.nodes.living.value,
      monthlySurplus: flow.surplus,
      trueSavingsRate: metrics?.trueSavings ?? null,
      cashSavingsRate: metrics?.cashSavings ?? null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed off primitives via flow.nodes.living.value/flow.surplus, not the flow object identity (rebuilt every render)
  }, [calculated, flow?.nodes.living.value, flow?.surplus, metrics?.trueSavings, metrics?.cashSavings])

  const addLumpyItem = () => setLumpyItems(items => [...items, { id: nextLumpyId(), label: '', amount: '', month: '0', type: 'expense' }])
  const updateLumpyItem = (id, patch) => setLumpyItems(items => items.map(i => i.id === id ? { ...i, ...patch } : i))
  const removeLumpyItem = (id) => setLumpyItems(items => items.filter(i => i.id !== id))

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.rXL, padding: 22, boxShadow: C.shadow }}>
      {restoredFromSave && (
        <p style={{ margin: '0 0 14px', fontSize: C.xs, color: C.faint, textAlign: 'center' }}>
          Restored what you last saved to this profile — edit freely.
        </p>
      )}

      <SectionDivider label="You" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <NumberInput id="flow-age" label="Age" hint="Sets your CPF contribution rate and allocation" value={age} onChange={e => setAge(e.target.value)} />
        <MoneyInput id="flow-salary" label="Monthly gross salary" value={salary} onChange={e => { setSalary(e.target.value); setSalaryPrefilled(false) }} />
      </div>
      {salaryPrefilled && (
        <p style={{ marginTop: 10, fontSize: C.xs, color: C.faint }}>Salary prefilled from another ndtm tool on this browser — edit it freely.</p>
      )}

      <SectionDivider label="Mortgage" />
      <Toggle active={hasHouse} onClick={() => setHasHouse(h => !h)}>I have a mortgage</Toggle>
      {hasHouse && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginTop: 14 }}>
            <MoneyInput id="flow-house-balance" label="Full outstanding balance" hint="The whole loan, even if it's joint — the share toggle below scales it down" value={outstandingBalance} onChange={e => setOutstandingBalance(e.target.value)} />
            <PercentInput id="flow-house-rate" label="Interest rate (p.a.)" value={rate} onChange={e => setRate(e.target.value)} />
            <MoneyInput id="flow-house-instalment" label="Full monthly instalment" value={monthlyInstalment} onChange={e => setMonthlyInstalment(e.target.value)} />
            <MoneyInput id="flow-house-cpf" label="...of YOUR instalment, paid from CPF-OA" hint="Your own share only — CPF is tracked per-person and isn't split by the joint-loan ratio below" value={cpfServicing} onChange={e => setCpfServicing(e.target.value)} />
          </div>
          {houseSource === 'auto' && (
            <p style={{ marginTop: 8, fontSize: C.xs, color: C.faint }}>Synced from HouseMuch — edit freely, this won&apos;t change what&apos;s saved there.</p>
          )}

          <div style={{ marginTop: 14 }}>
            <Toggle active={hasJointLoan} onClick={() => setHasJointLoan(j => !j)}>This is a joint loan</Toggle>
            {hasJointLoan && houseSource === 'auto' && (
              <p style={{ marginTop: 8, fontSize: C.xs, color: C.redText, lineHeight: 1.5 }}>
                These figures were synced from HouseMuch, where they may already be scaled down to your share of a joint loan — turning this on could scale them down a second time. Only use this if the numbers above are the FULL household loan.
              </p>
            )}
            {hasJointLoan && (
              <div style={{ marginTop: 10, maxWidth: 320 }}>
                <Segmented
                  value={yourSharePct === '50' ? '50' : 'custom'}
                  onChange={v => setYourSharePct(v === '50' ? '50' : (yourSharePct === '50' ? '60' : yourSharePct))}
                  options={[{ value: '50', label: '50 / 50' }, { value: 'custom', label: 'Custom' }]}
                />
                {yourSharePct !== '50' && (
                  <div style={{ marginTop: 10, maxWidth: 160 }}>
                    <PercentInput id="flow-house-share" label="Your share" value={yourSharePct} onChange={e => setYourSharePct(e.target.value)} />
                  </div>
                )}
                {yourSharePct === '' ? (
                  <p style={{ marginTop: 8, fontSize: C.xs, color: C.redText, lineHeight: 1.5 }}>
                    Empty is treated as a 0% share — this house won&apos;t count toward your mortgage figures below until you enter a number.
                  </p>
                ) : (numSigned(yourSharePct) < 0 || numSigned(yourSharePct) > 100) && (
                  <p style={{ marginTop: 8, fontSize: C.xs, color: C.redText, lineHeight: 1.5 }}>
                    A share has to be between 0% and 100% — this will be treated as {numSigned(yourSharePct) > 100 ? '100%' : '0%'}.
                  </p>
                )}
                {num(outstandingBalance) > 0 && (
                  <p style={{ marginTop: 8, fontSize: C.xs, color: C.muted, lineHeight: 1.5 }}>
                    Your share: {SGD(num(outstandingBalance) * houseShare)} balance, {SGD(num(monthlyInstalment) * houseShare)}/mo instalment.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <SectionDivider label="Car" />
      <Toggle active={hasCar} onClick={() => setHasCar(c => !c)}>I have a car loan</Toggle>
      {hasCar && (
        <>
          <div style={{ marginTop: 14, maxWidth: 260 }}>
            <MoneyInput id="flow-car-instalment" label="Monthly instalment" value={carInstalment} onChange={e => setCarInstalment(e.target.value)} />
          </div>
          {carSource === 'auto' && (
            <p style={{ marginTop: 8, fontSize: C.xs, color: C.faint }}>Synced from DriveReady — edit freely.</p>
          )}
        </>
      )}

      <SectionDivider label="Insurance" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: C.sm, fontWeight: 600, color: C.primary }}>Life & CI premiums (cash)</span>
            <Segmented value={insuranceFrequency} onChange={setInsuranceFrequency} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }]} />
          </div>
          <MoneyInput
            id="flow-insurance" label={insuranceFrequency === 'annual' ? 'Annual amount' : 'Monthly amount'}
            hint={insuranceFrequency === 'annual' && num(insurancePremium) > 0 ? `≈ ${SGD(num(insurancePremium) / 12)}/month` : undefined}
            value={insurancePremium} onChange={e => setInsurancePremium(e.target.value)}
          />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: C.sm, fontWeight: 600, color: C.primary }}>Health insurance (from MediSave)</span>
            <Segmented value={maHealthFrequency} onChange={setMaHealthFrequency} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }]} />
          </div>
          <MoneyInput
            id="flow-ma-health" label={maHealthFrequency === 'annual' ? 'Annual amount' : 'Monthly amount'}
            hint={maHealthFrequency === 'annual' && num(maHealthPremium) > 0 ? `≈ ${SGD(num(maHealthPremium) / 12)}/month` : "An estimate — most Integrated Shield Plan premiums are paid from MediSave, not cash"}
            value={maHealthPremium} onChange={e => setMaHealthPremium(e.target.value)}
          />
        </div>
      </div>
      {insuranceSource === 'auto' && (
        <p style={{ marginTop: 8, fontSize: C.xs, color: C.faint }}>Cash premium synced from InsureCheck — edit freely.</p>
      )}

      <SectionDivider label="Investing" />
      <div style={{ maxWidth: 260 }}>
        <MoneyInput id="flow-invest" label="Monthly DCA / investing" value={investMonthly} onChange={e => setInvestMonthly(e.target.value)} />
      </div>
      {investSource === 'auto' && (
        <p style={{ marginTop: 8, fontSize: C.xs, color: C.faint }}>Synced from WhatETF — edit freely.</p>
      )}

      <SectionDivider label="Income tax" />
      {taxSource === 'auto' ? (
        <p style={{ fontSize: C.sm, color: C.muted, lineHeight: 1.6 }}>
          Using your exact figure from TaxWise ({SGD(num(annualTax))}/yr). <a href="/tax" style={{ color: C.accent }}>Update it there</a> if your income has changed.
        </p>
      ) : (
        <p style={{ fontSize: C.sm, color: C.muted, lineHeight: 1.6 }}>
          No TaxWise figure found — <a href="/tax" style={{ color: C.accent }}>run TaxWise</a> for your exact tax, or this will estimate it from your salary and age with no reliefs applied.
        </p>
      )}

      <SectionDivider label="Living expenses" />
      <Segmented
        value={livingMode} onChange={setLivingMode}
        options={[{ value: 'quick', label: 'Quick' }, { value: 'detailed', label: 'Detailed' }, { value: 'backsolve', label: "I don't know" }]}
      />
      {livingMode === 'quick' && (
        <div style={{ marginTop: 14, maxWidth: 260 }}>
          <MoneyInput id="flow-living-quick" label="Roughly everything else, per month" value={quickAmount} onChange={e => setQuickAmount(e.target.value)} />
        </div>
      )}
      {livingMode === 'detailed' && (
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
          {CATEGORY_FIELDS.map(f => (
            <MoneyInput key={f.key} id={`flow-cat-${f.key}`} label={f.label} value={categories[f.key]} onChange={e => setCategories(c => ({ ...c, [f.key]: e.target.value }))} />
          ))}
        </div>
      )}
      {livingMode === 'backsolve' && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: C.xs, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
            Nobody remembers what they actually spend — but a bank balance from a year ago and today pins it exactly. Whatever came in and isn&apos;t in the account went somewhere.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            <MoneyInput id="flow-back-start" label="Bank balance, a while ago" value={backStart} onChange={e => setBackStart(e.target.value)} />
            <MoneyInput id="flow-back-end" label="Bank balance, today" value={backEnd} onChange={e => setBackEnd(e.target.value)} />
            <NumberInput id="flow-back-months" label="Months between them" value={backMonths} onChange={e => setBackMonths(e.target.value)} />
          </div>
        </div>
      )}
      {livingMode !== 'backsolve' && (
        <div style={{ marginTop: 14 }}>
          <button
            type="button" onClick={() => setShowReconcile(s => !s)} aria-pressed={showReconcile}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
              background: showReconcile ? C.accentBg : C.bg, border: `1.5px solid ${showReconcile ? C.accent : C.border}`,
              borderRadius: 100, cursor: 'pointer', fontSize: C.xs, fontWeight: 700,
              color: showReconcile ? C.accent : C.muted, fontFamily: C.fontBody,
            }}
          >
            {showReconcile ? '− ' : '+ '} Check this against your bank balance
          </button>
          {showReconcile && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                <MoneyInput id="flow-back-start-2" label="Bank balance, a while ago" value={backStart} onChange={e => setBackStart(e.target.value)} />
                <MoneyInput id="flow-back-end-2" label="Bank balance, today" value={backEnd} onChange={e => setBackEnd(e.target.value)} />
                <NumberInput id="flow-back-months-2" label="Months between them" value={backMonths} onChange={e => setBackMonths(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      )}

      <SectionDivider label="Runway" />
      <div style={{ maxWidth: 260 }}>
        <MoneyInput id="flow-liquid" label="Liquid cash savings" hint="Not CPF, not invested — money you could spend today" value={liquidSavings} onChange={e => setLiquidSavings(e.target.value)} />
      </div>

      <SectionDivider label="The twelve-month plan" />
      <p style={{ marginTop: -8, marginBottom: 16, fontSize: C.xs, color: C.muted, lineHeight: 1.5 }}>
        Add anything lumpy — road tax, insurance renewals, travel, SRS top-ups, or a bonus. Mark each one as an expense or a bonus; a monthly average hides exactly the months that actually hurt.
      </p>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: C.sm, fontWeight: 600, color: C.primary, marginBottom: 10 }}>How do you pay income tax?</label>
        <Segmented
          value={taxPaymentMode} onChange={setTaxPaymentMode}
          options={[{ value: 'lump', label: 'One bill' }, { value: 'monthly', label: 'Monthly (GIRO)' }]}
        />
        {taxPaymentMode === 'monthly' && (
          <p style={{ marginTop: 8, fontSize: C.xs, color: C.muted, lineHeight: 1.5 }}>
            Spread evenly across all twelve months — no due-month needed.
          </p>
        )}
      </div>

      {taxPaymentMode === 'lump' && (
        <div style={{ maxWidth: 260, marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: C.sm, fontWeight: 600, color: C.primary, marginBottom: 7 }}>Income tax bill lands in</label>
          <select value={taxDueMonth} onChange={e => setTaxDueMonth(e.target.value)} style={{
            width: '100%', boxSizing: 'border-box', background: C.surface, border: `1.5px solid ${C.border}`,
            borderRadius: C.r, padding: '11px 12px', color: C.primary, fontSize: C.lg, fontFamily: C.fontMono, fontWeight: 500,
          }}>
            {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

      {lumpyItems.map(item => {
        const isBonus = item.type === 'bonus'
        return (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '2fr auto 1fr 1fr auto', gap: 10, marginBottom: 10, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: C.xs, fontWeight: 600, color: C.muted, marginBottom: 5 }}>What</label>
              <input value={item.label} onChange={e => updateLumpyItem(item.id, { label: e.target.value })} placeholder={isBonus ? 'Bonus' : 'Road tax'}
                style={{ width: '100%', boxSizing: 'border-box', background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: C.r, padding: '10px 12px', color: C.primary, fontSize: C.sm, fontFamily: C.fontBody }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: C.xs, fontWeight: 600, color: C.muted, marginBottom: 5 }}>Type</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button" onClick={() => updateLumpyItem(item.id, { type: 'expense' })} aria-pressed={!isBonus}
                  title="Expense — subtracts from your balance"
                  style={{
                    padding: '10px 10px', fontSize: 13, fontWeight: 700, borderRadius: C.r, cursor: 'pointer', fontFamily: C.fontBody,
                    background: !isBonus ? C.redBg : C.bg, border: `1.5px solid ${!isBonus ? C.red : C.border}`,
                    color: !isBonus ? C.redText : C.muted,
                  }}
                >−</button>
                <button
                  type="button" onClick={() => updateLumpyItem(item.id, { type: 'bonus' })} aria-pressed={isBonus}
                  title="Bonus / income — adds to your balance"
                  style={{
                    padding: '10px 10px', fontSize: 13, fontWeight: 700, borderRadius: C.r, cursor: 'pointer', fontFamily: C.fontBody,
                    background: isBonus ? C.greenBg : C.bg, border: `1.5px solid ${isBonus ? C.green : C.border}`,
                    color: isBonus ? C.greenText : C.muted,
                  }}
                >+</button>
              </div>
            </div>
            <MoneyInput id={`flow-lumpy-${item.id}`} label="Amount" value={item.amount} onChange={e => updateLumpyItem(item.id, { amount: e.target.value })} />
            <div>
              <label style={{ display: 'block', fontSize: C.xs, fontWeight: 600, color: C.muted, marginBottom: 5 }}>Month</label>
              <select value={item.month} onChange={e => updateLumpyItem(item.id, { month: e.target.value })} style={{
                width: '100%', boxSizing: 'border-box', background: C.surface, border: `1.5px solid ${C.border}`,
                borderRadius: C.r, padding: '10px 8px', color: C.primary, fontSize: C.sm, fontFamily: C.fontMono,
              }}>
                {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => removeLumpyItem(item.id)} aria-label="Remove"
              style={{ background: 'none', border: 'none', color: C.faint, fontSize: C.sm, cursor: 'pointer', padding: '10px 4px' }}>✕</button>
          </div>
        )
      })}
      <button type="button" onClick={addLumpyItem} style={{
        background: 'none', border: `1.5px dashed ${C.border}`, borderRadius: C.r, padding: '9px 14px',
        fontSize: C.xs, fontWeight: 700, color: C.muted, cursor: 'pointer', fontFamily: C.fontBody,
      }}>+ Add a lumpy item</button>

      <div style={{ marginTop: 24 }}>
        <Button variant="accent" fullWidth onClick={() => setCalculated(true)} disabled={!isReady}>
          {isReady ? 'Show me where it goes' : 'Enter your age and salary above'}
        </Button>
      </div>
      <AutosaveIndicator justSaved={justSaved} C={C} />

      {calculated && flow && (
        <>
          <p style={{ margin: '20px 0 0', fontSize: C.xs, color: C.faint, textAlign: 'center' }}>
            This report updates live as you edit anything above — no need to press the button again.
          </p>
          <CapacityResults
            flow={flow} metrics={metrics} primarySchedule={primarySchedule} altSchedule={altSchedule} taxPaymentMode={taxPaymentMode}
            liquidSavings={num(liquidSavings)} gap={gap}
            house={house} annualBonus={annualBonusTotal} salary={num(salary)} age={num(age)}
          />
        </>
      )}
    </div>
  )
}
