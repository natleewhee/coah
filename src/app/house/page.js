'use client'

import { useEffect, useState } from 'react'
import { C, SGD, parseMoney } from '@/lib/house/theme'
import { calcSale, calcBSD } from '@/lib/house/calc'
import { resolveJointSharePct } from '@/lib/shared/jointShare'
import { saveHouseNumbers, saveToolInputs, loadToolInputs } from '@/lib/shared/profile'
import { MoneyInput, PercentInput, NumberInput, DateInput, Segmented, SectionDivider, FeeInput } from '@/components/house/ui'
import SaleResults from '@/components/house/SaleResults'
import NextPurchase from '@/components/house/NextPurchase'
import ShellHeader from '@/components/shared/ShellHeader'
import TrustBadges from '@/components/shared/TrustBadges'
import Button from '@/components/shared/Button'
import AutosaveIndicator from '@/components/shared/AutosaveIndicator'
import ExploreSection from '@/components/shared/ExploreSection'

const num = parseMoney
// parseMoney strips any leading "-" (it's built for money fields, which are
// never negative), so a share typed as "-20" would come out as +20 instead
// of being caught and clamped to 0% — Number() preserves the sign so the
// warning below and the value handed to calcSale agree with what
// resolveSharePct (house/calc.js) actually clamps.
const numSigned = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

export default function HouseMuchPage() {
  const [propertyType, setPropertyType] = useState('private')

  // Joint loan: what fraction of the property (and its loan) is yours.
  // Off by default (100% — today's behavior, unchanged for a sole owner).
  const [isJointLoan, setIsJointLoan] = useState(false)
  const [yourSharePct, setYourSharePct] = useState('50')
  // Alternate way to arrive at yourSharePct: MAS's actual income-weighted
  // TDSR apportionment (your share = your income ÷ combined income)
  // instead of typing a percentage directly. 'manual' (the default)
  // preserves today's behavior exactly — yourSharePct stays a direct,
  // user-typed value either way; 'income' mode just computes it FOR you.
  const [shareMode, setShareMode] = useState('manual') // 'manual' | 'income'
  const [myIncome, setMyIncome] = useState('')
  const [coBorrowerIncome, setCoBorrowerIncome] = useState('')
  // Person B's own CPF — separate from cpfOutlay (Person A's) below, since
  // CPF is tracked per person and must never be split by share. Blank/0
  // by default so a joint loan with only your own CPF known behaves
  // exactly as before this existed.
  const [personBCpfOutlay, setPersonBCpfOutlay] = useState('')
  const [personBCpfPrincipalOverride, setPersonBCpfPrincipalOverride] = useState('')
  const [personBCpfInterestOverride, setPersonBCpfInterestOverride] = useState('')
  // How to split the CASH proceeds (after CPF's already been refunded to
  // each owner's own CPF account) between the two of you. 'share' (the
  // default) splits by ownership share, same as everything else. 'outlay'
  // splits by how much cash each of you actually put in at purchase —
  // useful when the share on paper doesn't match who fronted the money.
  const [cashProceedsSplitMode, setCashProceedsSplitMode] = useState('share')

  // Purchase
  const [purchasePrice, setPurchasePrice] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [cpfOutlay, setCpfOutlay] = useState('')
  const [loanTaken, setLoanTaken] = useState('')
  const [mortgageRate, setMortgageRate] = useState('2.60')
  const [loanTenure, setLoanTenure] = useState('25')
  const [legalFeesAtPurchase, setLegalFeesAtPurchase] = useState('')
  const [agentFeeAtPurchaseMode, setAgentFeeAtPurchaseMode] = useState('manual')
  const [agentFeeAtPurchaseRaw, setAgentFeeAtPurchaseRaw] = useState('')
  const [sunkCost, setSunkCost] = useState('')
  // Of your CURRENT monthly instalment (not at purchase), how much is
  // paid via CPF OA rather than cash — optional, and only meaningful for
  // a mortgage you're still paying off. Not used in any profit/loss math
  // here; it exists purely to hand off to FlowState's cash-vs-CPF split
  // (see saveHouseNumbers below), which otherwise has no way to know.
  const [monthlyCpfServicing, setMonthlyCpfServicing] = useState('')

  // Sale
  const [salePrice, setSalePrice] = useState('')
  const [saleDate, setSaleDate] = useState('')
  const [agentFeeAtSaleMode, setAgentFeeAtSaleMode] = useState('1pct')
  const [agentFeeAtSaleRaw, setAgentFeeAtSaleRaw] = useState('')
  const [legalFeesAtSale, setLegalFeesAtSale] = useState('')

  // Overrides (raw strings; empty = use computed default)
  const [outstandingOverride, setOutstandingOverride] = useState('')
  const [totalInterestOverride, setTotalInterestOverride] = useState('')
  const [cpfPrincipalOverride, setCpfPrincipalOverride] = useState('')
  const [cpfInterestOverride, setCpfInterestOverride] = useState('')
  const [ssdOverride, setSsdOverride] = useState('')

  const [calculated, setCalculated] = useState(false)

  const [restoredFromSave, setRestoredFromSave] = useState(false)
  const [hasRestored, setHasRestored] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  // Increments on every autosave, unlike the justSaved boolean below —
  // a boolean can't tell "saved again while already showing Saved ✓"
  // apart from "no new save happened", since setJustSaved(true) while
  // already true is a no-op that doesn't re-run the timer effect. That
  // let the "Saved ✓" flash time out mid-typing during a fast typing
  // burst, even though saves were still landing. Keying the timer off
  // this ever-changing counter instead re-arms it on every save.
  const [savedTick, setSavedTick] = useState(0)

  // Restore whatever was last autosaved to this profile — scoped
  // per-profile, same as every other tool. Nothing else reads this;
  // it's purely for "here's what I typed last time."
  useEffect(() => {
    const saved = loadToolInputs('house')
    if (saved) {
      setPropertyType(saved.propertyType ?? 'private')
      setIsJointLoan(!!saved.isJointLoan)
      setYourSharePct(saved.yourSharePct ?? '50')
      setShareMode(saved.shareMode === 'income' ? 'income' : 'manual')
      setMyIncome(saved.myIncome ?? '')
      setCoBorrowerIncome(saved.coBorrowerIncome ?? '')
      setPersonBCpfOutlay(saved.personBCpfOutlay ?? '')
      setPersonBCpfPrincipalOverride(saved.personBCpfPrincipalOverride ?? '')
      setPersonBCpfInterestOverride(saved.personBCpfInterestOverride ?? '')
      setCashProceedsSplitMode(saved.cashProceedsSplitMode ?? 'share')
      setPurchasePrice(saved.purchasePrice ?? '')
      setPurchaseDate(saved.purchaseDate ?? '')
      setCpfOutlay(saved.cpfOutlay ?? '')
      setLoanTaken(saved.loanTaken ?? '')
      setMortgageRate(saved.mortgageRate ?? '2.60')
      setLoanTenure(saved.loanTenure ?? '25')
      setLegalFeesAtPurchase(saved.legalFeesAtPurchase ?? '')
      setAgentFeeAtPurchaseMode(saved.agentFeeAtPurchaseMode ?? 'manual')
      setAgentFeeAtPurchaseRaw(saved.agentFeeAtPurchaseRaw ?? '')
      setSunkCost(saved.sunkCost ?? '')
      setMonthlyCpfServicing(saved.monthlyCpfServicing ?? '')
      setSalePrice(saved.salePrice ?? '')
      setSaleDate(saved.saleDate ?? '')
      setAgentFeeAtSaleMode(saved.agentFeeAtSaleMode ?? '1pct')
      setAgentFeeAtSaleRaw(saved.agentFeeAtSaleRaw ?? '')
      setLegalFeesAtSale(saved.legalFeesAtSale ?? '')
      setOutstandingOverride(saved.outstandingOverride ?? '')
      setTotalInterestOverride(saved.totalInterestOverride ?? '')
      setCpfPrincipalOverride(saved.cpfPrincipalOverride ?? '')
      setCpfInterestOverride(saved.cpfInterestOverride ?? '')
      setSsdOverride(saved.ssdOverride ?? '')
      setRestoredFromSave(true)
    }
    setHasRestored(true)
  }, [])

  // Autosave every keystroke — same as DriveReady's own persistence, just
  // scoped to whichever profile is active instead of one global browser
  // key. Gated on hasRestored so this can't fire (with blank defaults)
  // before the restore effect above has had a chance to apply.
  useEffect(() => {
    if (!hasRestored) return
    const ok = saveToolInputs('house', {
      propertyType, isJointLoan, yourSharePct, shareMode, myIncome, coBorrowerIncome,
      personBCpfOutlay, personBCpfPrincipalOverride, personBCpfInterestOverride, cashProceedsSplitMode,
      purchasePrice, purchaseDate, cpfOutlay, loanTaken, mortgageRate, loanTenure,
      legalFeesAtPurchase, agentFeeAtPurchaseMode, agentFeeAtPurchaseRaw, sunkCost, monthlyCpfServicing,
      salePrice, saleDate, agentFeeAtSaleMode, agentFeeAtSaleRaw, legalFeesAtSale,
      outstandingOverride, totalInterestOverride, cpfPrincipalOverride, cpfInterestOverride, ssdOverride,
    })
    // Only flash "Saved" when the write actually landed — see tax/page.js.
    if (ok) {
      setSavedTick(t => t + 1)
    }
  }, [
    hasRestored, propertyType, isJointLoan, yourSharePct, shareMode, myIncome, coBorrowerIncome,
    personBCpfOutlay, personBCpfPrincipalOverride, personBCpfInterestOverride, cashProceedsSplitMode,
    purchasePrice, purchaseDate, cpfOutlay, loanTaken, mortgageRate, loanTenure,
    legalFeesAtPurchase, agentFeeAtPurchaseMode, agentFeeAtPurchaseRaw, sunkCost, monthlyCpfServicing,
    salePrice, saleDate, agentFeeAtSaleMode, agentFeeAtSaleRaw, legalFeesAtSale,
    outstandingOverride, totalInterestOverride, cpfPrincipalOverride, cpfInterestOverride, ssdOverride,
  ])

  useEffect(() => {
    if (savedTick === 0) return
    setJustSaved(true)
    const t = setTimeout(() => setJustSaved(false), 1400)
    return () => clearTimeout(t)
  }, [savedTick])

  const isReady = num(purchasePrice) > 0 && purchaseDate && num(salePrice) > 0 && saleDate

  const resolveFee = (mode, raw, base) => mode === '1pct' ? base * 0.01 : mode === '2pct' ? base * 0.02 : num(raw)
  const agentFeesAtPurchase = resolveFee(agentFeeAtPurchaseMode, agentFeeAtPurchaseRaw, num(purchasePrice))
  const agentCommission = resolveFee(agentFeeAtSaleMode, agentFeeAtSaleRaw, num(salePrice))

  // Live preview, updates as you type — shown before you even hit Calculate,
  // since this is now derived rather than something you enter directly.
  const bsdAtPurchasePreview = calcBSD(num(purchasePrice))
  const cashOutlayPreview = num(purchasePrice) + bsdAtPurchasePreview + num(legalFeesAtPurchase) + agentFeesAtPurchase
    - num(loanTaken) - num(cpfOutlay)

  // When shareMode is 'income', your share is DERIVED from gross incomes
  // (MAS's actual joint-TDSR apportionment) instead of the directly-typed
  // yourSharePct — see resolveJointSharePct. 'manual' mode (the default)
  // is exactly today's behavior: yourSharePct as typed.
  const effectiveSharePct = shareMode === 'income'
    ? resolveJointSharePct('income', numSigned(myIncome), numSigned(coBorrowerIncome), null)
    : numSigned(yourSharePct)

  const result = calculated && isReady ? calcSale({
    propertyType,
    purchasePrice: num(purchasePrice), purchaseDate,
    legalFeesAtPurchase: num(legalFeesAtPurchase), agentFeesAtPurchase,
    cpfOutlay: num(cpfOutlay),
    loanTaken: num(loanTaken), mortgageRate: num(mortgageRate), loanTenure: num(loanTenure),
    sunkCost: num(sunkCost),
    salePrice: num(salePrice), saleDate,
    agentCommission, legalFeesAtSale: num(legalFeesAtSale),
    outstandingBalanceOverride: outstandingOverride !== '' ? num(outstandingOverride) : null,
    totalInterestPaidOverride: totalInterestOverride !== '' ? num(totalInterestOverride) : null,
    cpfPrincipalOverride: cpfPrincipalOverride !== '' ? num(cpfPrincipalOverride) : null,
    cpfAccruedInterestOverride: cpfInterestOverride !== '' ? num(cpfInterestOverride) : null,
    ssdOverride: ssdOverride !== '' ? num(ssdOverride) : null,
    yourSharePct: isJointLoan ? effectiveSharePct : 100,
    personBCpfOutlay: isJointLoan ? num(personBCpfOutlay) : 0,
    personBCpfPrincipalOverride: isJointLoan && personBCpfPrincipalOverride !== '' ? num(personBCpfPrincipalOverride) : null,
    personBCpfAccruedInterestOverride: isJointLoan && personBCpfInterestOverride !== '' ? num(personBCpfInterestOverride) : null,
    cashProceedsSplitMode: isJointLoan ? cashProceedsSplitMode : 'share',
  }) : null

  const handleCalc = () => setCalculated(true)

  // Hand off this sale's numbers so RetireWell can offer a prefill and
  // MyLedger can use this mortgage as a baseline module — stored locally
  // only, same "no server" guarantee as the rest of this tool. See
  // src/lib/shared/profile.js.
  useEffect(() => {
    if (!result) return
    // For a joint loan, hand off YOUR share — RetireWell/MyLedger need
    // what actually counts against your own finances, not the full
    // household figures. propertyValue is scaled the same way as
    // outstandingBalance so MyLedger's (value − balance) equity math
    // comes out as YOUR share of equity, not your share of the debt
    // against the full household asset. salePrice stays the real,
    // full transaction price — it's describing the sale itself, not
    // your net worth. CPF refund is never scaled (see calcSale). Reuses
    // result.yourSharePct (already clamped to [0,100] inside calcSale)
    // rather than re-deriving it from the raw input here — recomputing
    // it separately would disagree with the already-clamped
    // yourOutstandingBalance/yourMonthlyInstalment above whenever the
    // typed share is out of range (e.g. "150").
    const share = result.yourSharePct / 100
    saveHouseNumbers({
      cashProceeds: result.yourCashProceeds,
      totalCPFRefund: result.totalCPFRefund,
      salePrice: result.salePrice,
      saleDate,
      outstandingBalance: result.yourOutstandingBalance,
      rate: num(mortgageRate),
      tenureRemaining: Math.max(0, num(loanTenure) - result.yearsHeld),
      monthlyInstalment: result.yourMonthlyInstalment,
      propertyValue: result.salePrice * share,
      propertyType,
      cpfServicing: monthlyCpfServicing !== '' ? num(monthlyCpfServicing) : null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed off result's own primitive fields, not `result` itself (a new object every render, which would re-save on every keystroke instead of only when these actually change)
  }, [
    result?.yourSharePct, result?.yourCashProceeds, result?.totalCPFRefund, result?.salePrice,
    result?.yourOutstandingBalance, result?.yearsHeld, result?.yourMonthlyInstalment,
    saleDate, mortgageRate, loanTenure, propertyType, monthlyCpfServicing,
  ])

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: C.fontBody }}>
      <ShellHeader title="HouseMuch" links={[{ href: '/house/the-math', label: 'The Math' }]} />

      {/* Hero */}
      <div style={{ background: C.ndtm, padding: '48px 32px 52px', textAlign: 'center' }}>
        <div style={{ fontFamily: C.fontNdtm, fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 14 }}>
          Singapore Property Profit/Loss Calculator
        </div>
        <h1 style={{ fontFamily: C.fontDisplay, fontSize: 'clamp(30px, 5.5vw, 48px)', color: '#fff', marginBottom: 10, lineHeight: 1.2 }}>
          What did this house really make you?
        </h1>
        <p style={{ fontFamily: C.fontDisplay, fontSize: 18, color: 'rgba(255,255,255,0.5)', marginBottom: 24, fontStyle: 'italic' }}>
          Sale price minus purchase price is a myth. I&apos;ll show you the real number — CPF and all.
        </p>
        <TrustBadges tone="dark" items={['CPF accrued interest, done right', 'BSD/SSD auto-computed', 'Zero data collected', 'Free, forever']} />
      </div>

      {/* Compliance line */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '8px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: C.faint, margin: 0 }}>
          Educational tool only · Not financial or legal advice · Not affiliated with HDB, CPF Board, or IRAS
        </p>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px' }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.rXL, padding: '28px 24px', boxShadow: C.shadow }}>

          {restoredFromSave && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: C.accentBg, border: `1px solid ${C.accent}55`, borderRadius: C.r, fontSize: C.xs, color: C.accent, fontWeight: 600 }}>
              Restored what you last saved to this profile — edit freely.
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: C.sm, fontWeight: 600, color: C.primary, marginBottom: 10 }}>Property type</label>
            <Segmented
              value={propertyType}
              onChange={v => { setPropertyType(v); setCalculated(false) }}
              options={[{ value: 'hdb', label: 'HDB' }, { value: 'private', label: 'Private' }]}
            />
            <p style={{ marginTop: 8, fontSize: C.xs, color: C.muted, lineHeight: 1.5 }}>
              {propertyType === 'hdb'
                ? 'HDB flats have a 5-year Minimum Occupation Period before you can sell. No Seller\'s Stamp Duty applies. If you received a CPF Housing Grant, fold it into "CPF used at purchase" below — it\'s refunded the same way as any other CPF principal.'
                : 'Private property may owe Seller\'s Stamp Duty if sold within 3 years of purchase.'}
            </p>
          </div>

          <SectionDivider label="The house you're selling" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <MoneyInput id="purchase-price" label="Purchase price" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} />
            <DateInput id="purchase-date" label="Purchase date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
            <MoneyInput id="cpf-outlay" label={isJointLoan ? "Person A's CPF used at purchase" : 'CPF used at purchase'} hint="The full amount withdrawn at the time of purchase — down payment plus any fees paid via CPF (stamp duty, legal, valuation). Not your current CPF principal, which is entered separately below if you're servicing your mortgage via CPF" value={cpfOutlay} onChange={e => setCpfOutlay(e.target.value)} />
            <MoneyInput
              id="cpf-interest-known" label={isJointLoan ? "Person A's CPF accrued interest today" : 'CPF accrued interest today'} hint="Optional — your CPF portal's Property panel shows this live, right now, regardless of when you bought. Leave blank to estimate."
              value={cpfInterestOverride} onChange={e => setCpfInterestOverride(e.target.value)}
            />
            <MoneyInput id="loan-taken" label="Loan taken" value={loanTaken} onChange={e => setLoanTaken(e.target.value)} />
            <PercentInput id="mortgage-rate" label="Mortgage rate (p.a.)" value={mortgageRate} onChange={e => setMortgageRate(e.target.value)} />
            <NumberInput id="loan-tenure" label="Loan tenure" value={loanTenure} onChange={e => setLoanTenure(e.target.value)} suffix="years" />
            <MoneyInput id="legal-fees-purchase" label="Legal fees at purchase" value={legalFeesAtPurchase} onChange={e => setLegalFeesAtPurchase(e.target.value)} />
            <FeeInput
              id="agent-fees-purchase" label="Agent fees at purchase" hint="Often S$0 — buyers don't usually pay an agent in SG"
              base={num(purchasePrice)} mode={agentFeeAtPurchaseMode} onModeChange={setAgentFeeAtPurchaseMode}
              value={agentFeeAtPurchaseRaw} onChange={e => setAgentFeeAtPurchaseRaw(e.target.value)}
            />
            <MoneyInput id="sunk-cost" label="Renovation / sunk costs" hint="Optional" value={sunkCost} onChange={e => setSunkCost(e.target.value)} />
            <MoneyInput
              id="monthly-cpf-servicing" label="...of your instalment, paid from CPF-OA" hint="Optional — only if you're still paying this mortgage off. Your own share only, same as above. Not used in the profit/loss above; only handed off to FlowState's cash-vs-CPF split."
              value={monthlyCpfServicing} onChange={e => setMonthlyCpfServicing(e.target.value)}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              type="button" onClick={() => setIsJointLoan(j => !j)} aria-pressed={isJointLoan}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
                background: isJointLoan ? C.accentBg : C.bg, border: `1.5px solid ${isJointLoan ? C.accent : C.border}`,
                borderRadius: 100, cursor: 'pointer', fontSize: C.xs, fontWeight: 700,
                color: isJointLoan ? C.accent : C.muted, fontFamily: C.fontBody,
              }}
            >
              {isJointLoan ? '✓ ' : ''} This is a joint loan
            </button>
            {isJointLoan && (
              <div style={{ marginTop: 12, maxWidth: 320 }}>
                <div style={{ fontSize: C.sm, fontWeight: 600, color: C.primary, marginBottom: 7 }}>Your share</div>
                <Segmented
                  value={shareMode === 'income' ? 'income' : (yourSharePct === '50' ? '50' : 'custom')}
                  onChange={v => {
                    if (v === 'income') { setShareMode('income'); return }
                    setShareMode('manual')
                    setYourSharePct(v === '50' ? '50' : (yourSharePct === '50' ? '60' : yourSharePct))
                  }}
                  options={[{ value: '50', label: '50 / 50' }, { value: 'custom', label: 'Custom' }, { value: 'income', label: 'By income' }]}
                />
                {shareMode === 'manual' && yourSharePct !== '50' && (
                  <div style={{ marginTop: 10, maxWidth: 160 }}>
                    <PercentInput id="your-share-pct" label="Your share" value={yourSharePct} onChange={e => setYourSharePct(e.target.value)} />
                  </div>
                )}
                {shareMode === 'income' && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                      <MoneyInput id="my-income" label="Your monthly gross income" value={myIncome} onChange={e => setMyIncome(e.target.value)} />
                      <MoneyInput id="co-borrower-income" label="Co-borrower's monthly gross income" value={coBorrowerIncome} onChange={e => setCoBorrowerIncome(e.target.value)} />
                    </div>
                    {(numSigned(myIncome) + numSigned(coBorrowerIncome)) > 0 && (
                      <p style={{ marginTop: 8, fontSize: C.xs, color: C.muted, lineHeight: 1.5 }}>
                        Your share: <strong style={{ color: C.accent, fontFamily: C.fontMono }}>{effectiveSharePct.toFixed(1)}%</strong> — your income ÷ combined income, the same apportionment a bank uses on a joint TDSR assessment.
                      </p>
                    )}
                  </div>
                )}
                {shareMode === 'manual' && yourSharePct === '' ? (
                  <p style={{ marginTop: 6, fontSize: C.xs, color: C.redText, lineHeight: 1.5 }}>
                    Empty is treated as a 0% share — your cash and profit/loss figures below will come out as zero until you enter a number.
                  </p>
                ) : shareMode === 'manual' && (numSigned(yourSharePct) < 0 || numSigned(yourSharePct) > 100) && (
                  <p style={{ marginTop: 6, fontSize: C.xs, color: C.redText, lineHeight: 1.5 }}>
                    A share has to be between 0% and 100% — this will be treated as {numSigned(yourSharePct) > 100 ? '100%' : '0%'}.
                  </p>
                )}
                <p style={{ marginTop: 8, fontSize: C.xs, color: C.muted, lineHeight: 1.5 }}>
                  Purchase price, loan, and stamp duty above should still be the real, full figures for the property — this only scales the profit/loss and cash figures below down to your share. Each of you tracks your own CPF below; on sale, it&apos;s refunded to each of you first, then what&apos;s left is split (see below).
                </p>
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: C.sm, fontWeight: 600, color: C.primary, marginBottom: 10 }}>Person B&apos;s CPF</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                    <MoneyInput id="person-b-cpf-outlay" label="Person B's CPF used at purchase" hint="Their own CPF withdrawn at purchase — down payment plus any fees paid via their CPF. Leave blank if only you used CPF." value={personBCpfOutlay} onChange={e => setPersonBCpfOutlay(e.target.value)} />
                    <MoneyInput id="person-b-cpf-interest-known" label="Person B's CPF accrued interest today" hint="Optional — from their CPF portal's Property panel. Leave blank to estimate." value={personBCpfInterestOverride} onChange={e => setPersonBCpfInterestOverride(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: C.sm, fontWeight: 600, color: C.primary, marginBottom: 7 }}>Split the cash proceeds by</div>
                  <Segmented
                    value={cashProceedsSplitMode}
                    onChange={setCashProceedsSplitMode}
                    options={[{ value: 'share', label: 'Ownership share' }, { value: 'outlay', label: 'Cash outlay at purchase' }]}
                  />
                  <p style={{ marginTop: 8, fontSize: C.xs, color: C.muted, lineHeight: 1.5 }}>
                    {cashProceedsSplitMode === 'outlay'
                      ? "CPF is refunded to each of you first, then what's left is split by how much cash each of you actually put in at purchase — not your ownership share."
                      : "CPF is refunded to each of you first, then what's left is split by your ownership share above."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {(num(purchasePrice) > 0 && (num(loanTaken) > 0 || num(cpfOutlay) > 0)) && (
            <div style={{ marginTop: 14, padding: '11px 14px', background: C.bg, border: `1px dashed ${C.border}`, borderRadius: C.r, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: C.xs, color: C.muted }}>
                Cash outlay, worked out from the above (incl. auto-computed BSD of {SGD(bsdAtPurchasePreview)})
              </span>
              <span style={{ fontFamily: C.fontMono, fontSize: C.base, fontWeight: 600, color: cashOutlayPreview < 0 ? C.redText : C.text }}>
                {SGD(cashOutlayPreview)}
              </span>
            </div>
          )}
          {num(purchasePrice) > 0 && num(loanTaken) + num(cpfOutlay) > 0 && cashOutlayPreview < 0 && (
            <p style={{ marginTop: 6, fontSize: C.xs, color: C.redText, lineHeight: 1.5 }}>
              That&apos;s negative — your loan + CPF add up to more than the price and fees combined. Double check those figures.
            </p>
          )}

          <SectionDivider label="Selling it" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <MoneyInput id="sale-price" label="Sale price" value={salePrice} onChange={e => setSalePrice(e.target.value)} />
            <DateInput id="sale-date" label="Sale date" hint="Or your expected date" value={saleDate} onChange={e => setSaleDate(e.target.value)} />
            <FeeInput
              id="agent-commission" label="Selling agent commission" hint="Typically 1–2% of sale price"
              base={num(salePrice)} mode={agentFeeAtSaleMode} onModeChange={setAgentFeeAtSaleMode}
              value={agentFeeAtSaleRaw} onChange={e => setAgentFeeAtSaleRaw(e.target.value)}
            />
            <MoneyInput id="legal-fees-sale" label="Legal fees at sale" value={legalFeesAtSale} onChange={e => setLegalFeesAtSale(e.target.value)} />
          </div>

          <div style={{ marginTop: 24 }}>
            <Button variant="accent" fullWidth onClick={handleCalc} disabled={!isReady}>
              {isReady ? 'Calculate my true profit/loss' : 'Fill in the fields above'}
            </Button>
          </div>
          <AutosaveIndicator justSaved={justSaved} C={C} />
        </div>

        {result && (
          <>
            <SaleResults
              result={result}
              outstandingOverride={outstandingOverride} onOutstandingOverride={e => setOutstandingOverride(e.target.value)}
              totalInterestOverride={totalInterestOverride} onTotalInterestOverride={e => setTotalInterestOverride(e.target.value)}
              cpfPrincipalOverride={cpfPrincipalOverride} onCpfPrincipalOverride={e => setCpfPrincipalOverride(e.target.value)}
              cpfInterestOverride={cpfInterestOverride} onCpfInterestOverride={e => setCpfInterestOverride(e.target.value)}
              ssdOverride={ssdOverride} onSsdOverride={e => setSsdOverride(e.target.value)}
              personBCpfPrincipalOverride={personBCpfPrincipalOverride} onPersonBCpfPrincipalOverride={e => setPersonBCpfPrincipalOverride(e.target.value)}
              personBCpfInterestOverride={personBCpfInterestOverride} onPersonBCpfInterestOverride={e => setPersonBCpfInterestOverride(e.target.value)}
            />

            <div style={{ marginTop: 32, background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.rXL, padding: '4px 24px', boxShadow: C.shadow }}>
              <ExploreSection title="Planning to buy your next place?" defaultOpen={false}>
                <NextPurchase saleResult={result} />
              </ExploreSection>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
