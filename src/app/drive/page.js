'use client'

import { useState, useRef, useEffect } from 'react'
import { C, SGD, parseMoneyKM } from '@/lib/drive/theme'
import { calc, calcCeiling, COE_FALLBACK, COE_FALLBACK_AS_OF, isCoeFallbackStale, omvToLtv } from '@/lib/drive/calc'
import { COE_ENDPOINT, CAR_CATALOG_ENDPOINT } from '@/lib/drive/endpoints'
import { calcUsed } from '@/lib/drive/used-car'
import { useDebounce } from '@/lib/drive/hooks'
import {
  STORAGE_KEY, serializeToParams, deserializeFromParams,
  sanitizeState, deserializeFromJSON, mergeRestoredState,
} from '@/lib/drive/persist'
import { loadGarage, saveGarage, makeGarageEntry, addEntry, removeEntry, renameEntry, defaultEntryName } from '@/lib/drive/garage'
import { saveDriveNumbers, saveToolInputs, loadToolInputs } from '@/lib/shared/profile'
import { SectionDivider, MoneyInput } from '@/components/drive/ui'
import { CarPicker } from '@/components/drive/CarPicker'
import { UsedCarForm } from '@/components/drive/UsedCarForm'
import { ResultPanel } from '@/components/drive/ResultPanel'
import { AffordabilityCeilingCard } from '@/components/drive/AffordabilityCeilingCard'
import { GaragePanel } from '@/components/drive/GaragePanel'
import ShellHeader from '@/components/shared/ShellHeader'
import TrustBadges from '@/components/shared/TrustBadges'
import Button from '@/components/shared/Button'
import AutosaveIndicator from '@/components/shared/AutosaveIndicator'

// Car prices come from /public/data/cars.json (or Supabase, when
// configured), refreshed weekly by .github/workflows/refresh-data.yml —
// see src/app/drive/api/car-catalog/route.js. There is deliberately no
// live per-request fetch of the LTA PDF here: onemotoring.lta.gov.sg
// reliably blocks that kind of traffic (no browser-like headers, coming
// from a shared serverless IP range), so it never worked in practice —
// see the removal note in docs/architecture.md.
// COE premiums come from /drive/api/coe (live from data.gov.sg's mirror of LTA's COE dataset)

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function DriveReadyPage() {
  // ── Live data state ────────────────────────────────────────────────────────
  const [baseCars,    setBaseCars]    = useState([])  // loaded from /drive/api/car-catalog
  const [carsUpdatedAt, setCarsUpdatedAt] = useState(null)
  const [coeData,     setCoeData]     = useState(null)
  const [coeStatus,   setCoeStatus]   = useState(null)      // 'live' | 'no_key' | 'auth_rejected' | …
  const [coeLoading,  setCoeLoading]  = useState(true)

  // loanCap/coe are re-derived from omv here rather than trusted verbatim
  // from cars.json — those were separately hand-maintained fields that
  // could (and did, for 9 cars) disagree with the car's own OMV, which
  // silently told a user they qualified for a 70% loan a bank would only
  // give at 60%. This is the one point every car passes through, so it
  // can't drift again. See omvToLtv in calc.js.
  const allCars = baseCars.map(car => ({ ...car, ...omvToLtv(car.omv) }))

  const top5Cars = allCars.filter(c => c.top5).sort((a,b) => a.rank - b.rank)

  useEffect(() => {
    // 1. Load base car data (names, OMV, price, etc) — Supabase-backed when
    // configured, bundled JSON snapshot otherwise (see car-catalog/route.js)
    fetch(CAR_CATALOG_ENDPOINT)
      .then(r => r.json())
      .then(d => {
        if (d.cars?.length > 0) setBaseCars(d.cars)
        if (d.updatedAt) setCarsUpdatedAt(d.updatedAt)
      })
      .catch(() => {})

    // 2. Fetch live COE from data.gov.sg
    // Keep the failure status, don't swallow it — a missing key, a rejected
    // key and LTA being down are three different problems, and the strip
    // below (plus /drive/data-status) can only tell them apart if the
    // status code survives this far.
    fetch(COE_ENDPOINT)
      .then(r => r.json())
      .then(d => {
        setCoeStatus(d?.status ?? 'network_error')
        if (d.catA && d.catB) setCoeData(d)
      })
      .catch(() => setCoeStatus('network_error'))
      .finally(() => setCoeLoading(false))
  }, [])

  // ── Form state ────────────────────────────────────────────────────────────
  const [salaryRaw, setSalaryRaw] = useState('')
  const [salary,    setSalary]    = useState('')
  const [downRaw,   setDownRaw]   = useState('')
  const [down,      setDown]      = useState('')
  const [existingDebtRaw, setExistingDebtRaw] = useState('')
  const [existingDebt,    setExistingDebt]    = useState('')
  const [tenure,    setTenure]    = useState(7)
  const [mode,      setMode]      = useState('single')
  const [carA,      setCarA]      = useState(null)
  const [carB,      setCarB]      = useState(null)
  const [customPriceA, setCustomPriceA] = useState('')
  const [customPriceB, setCustomPriceB] = useState('')
  // New-vs-used per slot. Used-car scenarios are session-only right now —
  // not persisted to localStorage/URL/garage like new-car inputs are, since
  // that would mean extending every persistence schema (persist.js,
  // garage.js's restore path) for a manual multi-field form. A reasonable
  // scope cut, but a real one: reloading or sharing a link loses used-car
  // inputs even though it keeps new-car ones.
  const [conditionA, setConditionA] = useState('new') // 'new' | 'used'
  const [conditionB, setConditionB] = useState('new')
  const [usedCarA,   setUsedCarA]   = useState(null)
  const [usedCarB,   setUsedCarB]   = useState(null)
  const [calculated,setCalculated]= useState(false)
  const resultsRef = useRef(null)

  // ── Persistence: restore inputs from a shared URL (wins) or the last
  // session's localStorage (fallback) on mount, then keep both in sync as
  // inputs change. Car selections are stored as IDs and resolved against
  // allCars once it's loaded (see the effect below). `hasRestored` gates the
  // persist effect so it doesn't overwrite storage with blank initial state
  // before the restore effect has had a chance to apply it.
  const [hasRestored, setHasRestored] = useState(false)
  const [pendingCarIds, setPendingCarIds] = useState(null)
  const [justSaved, setJustSaved] = useState(false)
  // Increments on every autosave, unlike the justSaved boolean below —
  // a boolean set to `true` while already `true` is a no-op that wouldn't
  // re-arm the fade-out timer for back-to-back keystrokes.
  const [savedTick, setSavedTick] = useState(0)

  // Fully replaces the form state from a restored/loaded input snapshot —
  // shared by the mount-time restore effect below and the garage "load"
  // handler, so loading a saved scenario mid-session behaves identically to
  // restoring one on page load.
  const applyRestoredState = (restored) => {
    const salaryRawVal = restored.salaryRaw || ''
    const downRawVal = restored.downRaw || ''
    const existingDebtRawVal = restored.existingDebtRaw || ''
    setSalaryRaw(salaryRawVal); setSalary(salaryRawVal ? Number(salaryRawVal).toLocaleString('en-SG') : '')
    setDownRaw(downRawVal); setDown(downRawVal ? Number(downRawVal).toLocaleString('en-SG') : '')
    setExistingDebtRaw(existingDebtRawVal); setExistingDebt(existingDebtRawVal ? Number(existingDebtRawVal).toLocaleString('en-SG') : '')
    setTenure(restored.tenure || 7)
    setMode(restored.mode || 'single')
    setCustomPriceA(restored.customPriceA || '')
    setCustomPriceB(restored.customPriceB || '')
    setCalculated(!!restored.calculated)
    setPendingCarIds({ a: restored.carAId ?? null, b: restored.carBId ?? null })
  }

  useEffect(() => {
    // Profile-scoped storage is the source of truth, same as every other
    // tool — switching profiles must switch DriveReady's data too. A
    // one-time migration reads (and clears) the OLD global key so a
    // browser that already had DriveReady inputs doesn't lose them the
    // first time this ships, then never touches that key again.
    let fromStorage = sanitizeState(loadToolInputs('drive') || {})
    if (Object.keys(fromStorage).length === 0) {
      const legacy = deserializeFromJSON(window.localStorage.getItem(STORAGE_KEY))
      if (Object.keys(legacy).length > 0) {
        fromStorage = legacy
        window.localStorage.removeItem(STORAGE_KEY)
      }
    }
    const fromUrl = deserializeFromParams(new URLSearchParams(window.location.search))
    const restored = mergeRestoredState(fromStorage, fromUrl)
    if (Object.keys(restored).length > 0) applyRestoredState(restored)

    setHasRestored(true)
  }, [])

  // Resolve pending car IDs once the car list has loaded.
  useEffect(() => {
    if (!pendingCarIds || allCars.length === 0) return
    if (pendingCarIds.a) setCarA(allCars.find(c => c.id === pendingCarIds.a) ?? null)
    if (pendingCarIds.b) setCarB(allCars.find(c => c.id === pendingCarIds.b) ?? null)
    setPendingCarIds(null)
  }, [pendingCarIds, allCars])

  // Persist on every change, once initial restore has completed — scoped
  // to whichever profile is active, same as every other tool.
  useEffect(() => {
    if (!hasRestored) return
    const state = { salaryRaw, downRaw, existingDebtRaw, tenure, mode, carAId: carA?.id ?? null, carBId: carB?.id ?? null, customPriceA, customPriceB, calculated }
    const ok = saveToolInputs('drive', state)
    // Only flash "Saved" when the write actually landed — saveToolInputs
    // returns false on a silently-swallowed quota/private-browsing failure.
    if (ok) {
      setSavedTick(t => t + 1)
    }
    const params = serializeToParams(state)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [hasRestored, salaryRaw, downRaw, existingDebtRaw, tenure, mode, carA?.id, carB?.id, customPriceA, customPriceB, calculated])

  useEffect(() => {
    if (savedTick === 0) return
    setJustSaved(true)
    const t = setTimeout(() => setJustSaved(false), 1400)
    return () => clearTimeout(t)
  }, [savedTick])

  const dSalary = useDebounce(parseInt(salaryRaw||'0', 10), 120)
  const dDown   = useDebounce(parseInt(downRaw||'0',   10), 120)
  const dExistingDebt = useDebounce(parseInt(existingDebtRaw||'0', 10), 120)
  const dTenure = useDebounce(tenure, 80)

  // Pass live COE to calc so it uses real premiums when available
  const liveCOE = coeData ? { catA: coeData.catA.premium, catB: coeData.catB.premium } : null
  // Merge user-overridden prices into car objects before calculations (new-car
  // slots only — used-car forms already collect price directly).
  const effCarA = conditionA === 'used' ? usedCarA : (carA && customPriceA ? { ...carA, price: parseInt(customPriceA.replace(/,/g,''), 10) } : carA)
  const effCarB = conditionB === 'used' ? usedCarB : (carB && customPriceB ? { ...carB, price: parseInt(customPriceB.replace(/,/g,''), 10) } : carB)
  const calcForSlot = (condition, ...args) => condition === 'used' ? calcUsed(...args) : calc(...args)
  const rA = (calculated && effCarA)                      ? calcForSlot(conditionA, dSalary, dDown, dTenure, effCarA, liveCOE, dExistingDebt) : null
  const rB = (calculated && effCarB && mode==='compare')   ? calcForSlot(conditionB, dSalary, dDown, dTenure, effCarB, liveCOE, dExistingDebt) : null

  // Hand off this car's numbers so RetireWell can nudge against the
  // monthly cost and MyLedger can use it as a baseline module — stored
  // locally only. See src/lib/shared/profile.js.
  useEffect(() => {
    if (!rA) return
    saveDriveNumbers({
      monthlyInstalment: rA.monthly,
      carLabel: rA.car?.short || rA.car?.name || null,
      salary: rA.salary,
      loanOutstanding: rA.loan,
      // rA.tier.rate is a FLAT rate (how car loans in Singapore are
      // actually quoted) — NOT a reducing-balance annual rate like
      // house.rate. A flat rate applied to reducing-balance amortization
      // math would understate the effective rate by roughly half; no
      // current consumer does that (MyLedger only reads
      // monthlyInstalment for the car module, never this rate), but
      // don't wire this into amortization logic without converting it
      // first.
      rate: (rA.tier?.rate || 0) * 100,
      tenureRemaining: rA.tenure,
      carValue: rA.car?.price,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed off rA's own primitive fields, not `rA` itself (a new object every render, which would re-save on every keystroke instead of only when these actually change)
  }, [rA?.monthly, rA?.car?.short, rA?.car?.name, rA?.salary, rA?.loan, rA?.tier?.rate, rA?.tenure, rA?.car?.price])

  // Accepts "80k"/"1.2m" shorthand alongside plain digits. The displayed
  // field (salary/down/existingDebt) is left as literal typed text while
  // focused — reformatting it on every keystroke was the bug: converting
  // "1." to "1" the instant it's typed meant a "2" typed next appended to
  // "1" instead of "1.", turning "1.2m" into "12m". MoneyInput's onBlur
  // normalizes the display once typing is done; salaryRaw (used for calc,
  // persistence, URL-sync) is kept in sync live either way, always as a
  // plain digit string, same shape it's always been.
  const handleSalary = e => { const v=e.target.value; setSalary(v); const p=parseMoneyKM(v); setSalaryRaw(p!=null?String(p):'') }
  const handleDown   = e => { const v=e.target.value; setDown(v);   const p=parseMoneyKM(v); setDownRaw(p!=null?String(p):'') }
  const handleExistingDebt = e => { const v=e.target.value; setExistingDebt(v); const p=parseMoneyKM(v); setExistingDebtRaw(p!=null?String(p):'') }
  const isReady = salaryRaw && downRaw && effCarA && (mode==='single' || effCarB)
  // Garage saves rely on IDs to restore new-car selections — used-car
  // scenarios (manually entered, not persisted) can't round-trip through
  // that path, so saving is disabled while either slot is in used-car mode.
  const canSaveToGarage = conditionA === 'new' && (mode === 'single' || conditionB === 'new')

  const handleCalc = () => {
    setCalculated(true)
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 120)
  }

  // ── Garage: save/compare multiple calculated scenarios ─────────────────────
  const [garage, setGarage] = useState([])
  useEffect(() => {
    setGarage(loadGarage())
  }, [])

  const summarizeResult = r => r ? { name: r.car.name, price: r.car.price, monthly: r.monthly, totalCoo: r.totalCoo, verdict: r.verdict, tdsrExceeded: r.tdsrExceeded } : null

  const handleSaveToGarage = () => {
    const inputs = { salaryRaw, downRaw, existingDebtRaw, tenure, mode, carAId: carA?.id ?? null, carBId: carB?.id ?? null, customPriceA, customPriceB, calculated: true }
    const summary = { carA: summarizeResult(rA), carB: summarizeResult(rB) }
    const name = defaultEntryName(carA?.name, mode === 'compare' ? carB?.name : null)
    const next = addEntry(garage, makeGarageEntry({ name, inputs, summary }))
    setGarage(next)
    saveGarage(next)
  }

  const handleLoadFromGarage = entry => { applyRestoredState(entry.inputs) }

  const handleDeleteFromGarage = id => {
    const next = removeEntry(garage, id)
    setGarage(next)
    saveGarage(next)
  }

  const handleRenameInGarage = (id, name) => {
    const next = renameEntry(garage, id, name)
    setGarage(next)
    saveGarage(next)
  }

  const trackPct   = ((tenure-1)/6*100).toFixed(1)
  const trackStyle = `linear-gradient(90deg,${C.accent} ${trackPct}%,${C.border} ${trackPct}%)`

  return (
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',flexDirection:'column',fontFamily:C.fontBody}}>

      {/* ── STRUCTURED DATA ─── */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context':'https://schema.org','@type':'WebApplication',
        name:'DriveReady — nat does the math',url:'https://natdtm.vercel.app/drive',
        description:'Singapore car affordability calculator. Know your true monthly cost before you commit.',
        applicationCategory:'FinanceApplication',operatingSystem:'Web',
        offers:{'@type':'Offer',price:'0',priceCurrency:'SGD'},
        audience:{'@type':'Audience',geographicArea:{'@type':'Country',name:'Singapore'}}
      }) }} />

      <ShellHeader
        links={[
          { href: '/drive/renew-or-replace', label: 'Renew or Replace?' },
          { href: '/drive/the-math', label: 'The Math' },
        ]}
        step={
          coeLoading ? (
            <span style={{ fontSize: C.xs, color: C.faint }}>Fetching COE…</span>
          ) : coeData ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: C.xs, color: C.faint }}>Latest COE</span>
              <span style={{ fontSize: C.xs, background: C.accentBg, border: `1px solid ${C.accent}33`, borderRadius: 100, padding: '2px 10px', color: C.accentText, fontFamily: C.fontMono, fontWeight: 600 }}>A: {SGD(coeData.catA.premium)}</span>
              <span style={{ fontSize: C.xs, background: C.accentBg, border: `1px solid ${C.accent}33`, borderRadius: 100, padding: '2px 10px', color: C.accentText, fontFamily: C.fontMono, fontWeight: 600 }}>B: {SGD(coeData.catB.premium)}</span>
            </span>
          ) : (
            <span style={{ fontSize: C.xs, color: C.faint }}>Car prices indicative</span>
          )
        }
      />

      {/* ── HERO ── */}
      <div style={{background:C.ndtm,padding:'48px 32px 52px',textAlign:'center'}}>
        <div style={{fontFamily:C.fontNdtm,fontSize:10,fontWeight:600,color:'rgba(255,255,255,0.35)',letterSpacing:'0.18em',textTransform:'uppercase',marginBottom:14}}>Singapore Car Loan Calculator</div>
        <h1 style={{fontFamily:C.fontDisplay,fontSize:'clamp(30px, 5.5vw, 48px)',color:'#fff',marginBottom:10,lineHeight:1.2}}>Be Ready to Drive.</h1>
        <p style={{fontFamily:C.fontDisplay,fontSize:18,color:'rgba(255,255,255,0.5)',marginBottom:24,fontStyle:'italic'}}>Your salary, your cash, your real number. I&apos;ll do the math.</p>
        <TrustBadges tone="dark" items={['50+ SG models', 'True cost incl. depreciation', 'Zero data collected', 'Free, forever']} />
      </div>

      {/* ── MAS disclaimer ── */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'8px 24px',textAlign:'center'}}>
        <p style={{fontSize:11,color:C.faint,margin:0}}>
          Educational tool only · Not financial advice · Not affiliated with any insurer or MAS-licensed entity
        </p>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{flex:1,display:'flex',justifyContent:'center',padding:'32px 16px 80px'}}>
        <div style={{width:'100%',maxWidth:mode==='compare'?1140:660,transition:'max-width 0.4s ease'}}>

          <GaragePanel garage={garage} canSave={calculated && !!rA && canSaveToGarage}
            onSave={handleSaveToGarage} onLoad={handleLoadFromGarage}
            onDelete={handleDeleteFromGarage} onRename={handleRenameInGarage}/>

          {/* INPUT CARD */}
          <div style={{background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:C.rXL,boxShadow:C.shadowMd,overflow:'hidden',marginBottom:20}}>
            <div style={{padding:'22px 28px 18px',borderBottom:`1px solid ${C.border}`,background:C.bg,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
              <div>
                <div style={{fontSize:C.xs,fontWeight:700,color:C.accent,textTransform:'uppercase',letterSpacing:'0.14em',marginBottom:4}}>Step 1 — Your finances</div>
                <h2 style={{fontFamily:C.fontDisplay,fontSize:22,color:C.primary,lineHeight:1.1}}>Enter your details</h2>
              </div>
              <div style={{display:'flex',background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:C.r,padding:3}}>
                {['single','compare'].map(m => (
                  <button key={m} type="button" onClick={() => { setMode(m); setCalculated(false) }}
                    aria-pressed={mode===m}
                    style={{padding:'7px 16px',fontSize:C.xs,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',cursor:'pointer',borderRadius:6,border:'none',fontFamily:C.fontBody,background:mode===m?C.ndtm:'transparent',color:mode===m?'#fff':C.muted,transition:'all 0.2s',boxShadow:mode===m?'0 2px 8px rgba(0,0,0,0.35)':'none'}}>
                    {m==='single'?'Single Car':'Compare Two'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{padding:'22px 28px 26px'}}>
              <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:18,marginBottom:4}}>
                <MoneyInput id="salary-input" label="Monthly Gross Salary" value={salary} onChange={handleSalary}
                  hint={salaryRaw && parseInt(salaryRaw)>0
                    ? `Take-home after CPF: S$${Math.floor(parseInt(salaryRaw)*0.8).toLocaleString('en-SG')}/mo · 30% limit: S$${Math.floor(parseInt(salaryRaw)*0.8*0.3).toLocaleString('en-SG')}/mo`
                    : 'Your gross income before CPF deductions'}/>
                <MoneyInput id="down-input" label="Cash Downpayment" value={down} onChange={handleDown}
                  hint="More cash above the minimum means a smaller loan and less interest"/>
              </div>
              <div style={{marginTop:18}}>
                <MoneyInput id="debt-input" label="Existing Monthly Debt Payments (optional)" value={existingDebt} onChange={handleExistingDebt}
                  hint="Other loans, credit cards, etc. — counted against the bank's 55% TDSR limit alongside this car's instalment"/>
              </div>

              <SectionDivider label="Your budget range"/>
              <AffordabilityCeilingCard salary={dSalary} down={dDown} tenure={dTenure} existingDebt={dExistingDebt}/>

              <SectionDivider label="Loan tenure"/>
              <div style={{marginBottom:26}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                  <div>
                    <div style={{fontSize:C.sm,fontWeight:600,color:C.text}}>How many years to repay?</div>
                    {calculated && <div style={{fontSize:C.xs,color:C.muted,marginTop:2}}>Drag to update results live</div>}
                  </div>
                  <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                    <span style={{fontSize:C.hero,fontFamily:C.fontMono,fontWeight:500,color:C.primary,lineHeight:1}}>{tenure}</span>
                    <span style={{fontSize:C.sm,color:C.muted}}>year{tenure>1?'s':''}</span>
                  </div>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:8,padding:'0 10px'}}>
                  {[1,2,3,4,5,6,7].map(y => (
                    <button key={y} type="button" onClick={() => setTenure(y)}
                      aria-label={`Set loan tenure to ${y} year${y>1?'s':''}`} aria-pressed={tenure===y}
                      style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,cursor:'pointer',background:'none',border:'none',padding:'4px 2px'}}>
                      <div aria-hidden="true" style={{width:1,height:6,background:tenure===y?C.accent:C.border}}/>
                      <span style={{fontSize:C.xs,fontFamily:C.fontMono,color:tenure===y?C.accent:C.faint,fontWeight:tenure===y?700:400}}>{y}</span>
                    </button>
                  ))}
                </div>
                <input type="range" className="zz-slider" min={1} max={7} step={1} value={tenure}
                  onChange={e => setTenure(Number(e.target.value))}
                  aria-label="Loan tenure in years" aria-valuetext={`${tenure} year${tenure>1?'s':''}`}
                  style={{background:'transparent', '--slider-fill': trackStyle}}/>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}>
                  <span style={{fontSize:C.xs,color:C.muted}}>↑ Less total interest</span>
                  <span style={{fontSize:C.xs,color:C.muted}}>Lower monthly payment ↓</span>
                </div>
              </div>

              <SectionDivider label="Choose your car"/>
              <div style={{display:'grid',gridTemplateColumns:mode==='compare'?'minmax(0,1fr) minmax(0,1fr)':'minmax(0,1fr)',gap:28,marginBottom:4}}>
                <div>
                  <div style={{display:'flex',background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:C.r,padding:3,marginBottom:14,width:'fit-content'}}>
                    {['new','used'].map(cnd => (
                      <button key={cnd} type="button" aria-pressed={conditionA===cnd}
                        onClick={() => { setConditionA(cnd); setCalculated(false) }}
                        style={{padding:'6px 14px',fontSize:C.xs,fontWeight:700,letterSpacing:'0.04em',textTransform:'uppercase',cursor:'pointer',borderRadius:6,border:'none',fontFamily:C.fontBody,background:conditionA===cnd?C.primary:'transparent',color:conditionA===cnd?C.bg:C.muted,transition:'all 0.2s'}}>
                        {cnd==='new'?'New Car':'Used Car'}
                      </button>
                    ))}
                  </div>
                  {conditionA === 'new' ? (
                    <CarPicker value={carA} onChange={c => { setCarA(c); setCustomPriceA(''); setCalculated(false) }} slot="A"
                      ceiling={calcCeiling(dSalary, dDown, dTenure, dExistingDebt)} down={dDown}
                      allCars={allCars} top5Cars={top5Cars} coeData={liveCOE}
                      customPrice={customPriceA} onCustomPrice={v => { setCustomPriceA(v); setCalculated(false) }}/>
                  ) : (
                    <>
                      <UsedCarForm slot="A" onChange={c => { setUsedCarA(c); setCalculated(false) }}/>
                      <p style={{marginTop:8,fontSize:'10px',color:C.faint,lineHeight:1.5}}>Used-car inputs aren&apos;t saved to your garage or a shareable link yet — they reset if you leave the page.</p>
                    </>
                  )}
                </div>
                {mode==='compare' && (
                  <div>
                    <div style={{display:'flex',background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:C.r,padding:3,marginBottom:14,width:'fit-content'}}>
                      {['new','used'].map(cnd => (
                        <button key={cnd} type="button" aria-pressed={conditionB===cnd}
                          onClick={() => { setConditionB(cnd); setCalculated(false) }}
                          style={{padding:'6px 14px',fontSize:C.xs,fontWeight:700,letterSpacing:'0.04em',textTransform:'uppercase',cursor:'pointer',borderRadius:6,border:'none',fontFamily:C.fontBody,background:conditionB===cnd?C.primary:'transparent',color:conditionB===cnd?C.bg:C.muted,transition:'all 0.2s'}}>
                          {cnd==='new'?'New Car':'Used Car'}
                        </button>
                      ))}
                    </div>
                    {conditionB === 'new' ? (
                      <CarPicker value={carB} onChange={c => { setCarB(c); setCustomPriceB(''); setCalculated(false) }} slot="B"
                        ceiling={calcCeiling(dSalary, dDown, dTenure, dExistingDebt)} down={dDown}
                        allCars={allCars} top5Cars={top5Cars} coeData={liveCOE}
                        customPrice={customPriceB} onCustomPrice={v => { setCustomPriceB(v); setCalculated(false) }}/>
                    ) : (
                      <>
                        <UsedCarForm slot="B" onChange={c => { setUsedCarB(c); setCalculated(false) }}/>
                        <p style={{marginTop:8,fontSize:'10px',color:C.faint,lineHeight:1.5}}>Used-car inputs aren&apos;t saved to your garage or a shareable link yet — they reset if you leave the page.</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              <Button variant="dark" fullWidth onClick={handleCalc} disabled={!isReady}>
                {isReady
                  ? calculated
                    ? `↻  Recalculate${mode==='compare'?' comparison':''}`
                    : mode==='compare'
                      ? `Compare ${effCarA?.short??effCarA?.name} vs ${effCarB?.short??effCarB?.name}  →`
                      : `Check if I can afford the ${effCarA?.short??effCarA?.name}  →`
                  : 'Fill in all fields above to continue'}
              </Button>
              {calculated && <p style={{marginTop:8,textAlign:'center',fontSize:C.xs,color:C.muted}}>Results update live as you drag the tenure slider</p>}
              <AutosaveIndicator justSaved={justSaved} C={C} style={{ textAlign: 'center' }} />
              {/* COE used in calculation */}
              <div style={{marginTop:8,padding:'8px 12px',background:C.bg,borderRadius:C.r,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',gap:12,flexWrap:'wrap'}}>
                <span style={{fontSize:C.xs,color:C.faint}}>COE used in calculations:</span>
                {coeLoading
                  ? <span style={{fontSize:C.xs,color:C.faint}}>Fetching live COE…</span>
                  : coeData
                    ? <><span style={{fontSize:C.xs,fontFamily:C.fontMono,fontWeight:700,color:C.primary}}>Cat A: {SGD(coeData.catA.premium)}</span><span style={{fontSize:C.xs,color:C.faint}}>·</span><span style={{fontSize:C.xs,fontFamily:C.fontMono,fontWeight:700,color:C.primary}}>Cat B: {SGD(coeData.catB.premium)}</span><span style={{fontSize:C.xs,color:C.faint,fontSize:'10px'}}> · {coeData.month} · Live from LTA</span></>
                    : <><span style={{fontSize:C.xs,fontFamily:C.fontMono,fontWeight:700,color:C.amberText}}>Cat A: ~{SGD(COE_FALLBACK.catA)}</span><span style={{fontSize:C.xs,color:C.faint}}>·</span><span style={{fontSize:C.xs,fontFamily:C.fontMono,fontWeight:700,color:C.amberText}}>Cat B: ~{SGD(COE_FALLBACK.catB)}</span><span style={{fontSize:C.xs,color:C.amberText,fontSize:'10px'}}> · {isCoeFallbackStale() ? `⚠ Estimate may be outdated, as of ${COE_FALLBACK_AS_OF}` : `Estimated as of ${COE_FALLBACK_AS_OF} — live LTA data temporarily unavailable`}</span></>
                }
                {/* Always reachable, whether live or not — "is the feed
                    actually working?" should never require reading code. */}
                <a href="/drive/data-status" style={{fontSize:'10px',color:C.faint,textDecoration:'underline'}}>
                  {coeLoading ? 'Data status' : coeStatus === 'live' ? '✓ Live — data status' : 'Why? — data status'}
                </a>
              </div>
              <p style={{marginTop:6,textAlign:'center',fontSize:C.xs,color:C.faint}}>
                Prices indicative incl. COE{carsUpdatedAt ? ` · Car prices as of ${new Date(carsUpdatedAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''} · Figures based on latest applicable policies · Educational tool only
              </p>
            </div>
          </div>

          {/* RESULTS */}
          <div ref={resultsRef}>
            {mode==='single'
              ? <ResultPanel r={rA} tenure={dTenure} visible={!!rA}/>
              : (
                <div>
                  {(rA||rB) && (
                    <div style={{marginBottom:12,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                      <span style={{fontSize:C.sm,fontWeight:700,color:C.primary,fontFamily:C.fontDisplay,fontStyle:'italic'}}>Side-by-side comparison</span>
                      {rA&&rB&&rA.monthly&&rB.monthly && (
                        <div style={{display:'flex',alignItems:'center',gap:8,background:C.surface,border:`1px solid ${C.border}`,borderRadius:100,padding:'5px 14px',boxShadow:C.shadow}}>
                          <span style={{fontSize:C.xs,color:C.muted}}>Monthly diff:</span>
                          <span style={{fontSize:C.sm,fontFamily:C.fontMono,fontWeight:700,color:C.primary}}>{SGD(Math.abs(rA.monthly-rB.monthly))}/mo</span>
                          <span style={{fontSize:C.xs,color:C.accent,fontWeight:600}}>({rA.monthly<rB.monthly?`${rA.car.short} cheaper`:`${rB.car.short} cheaper`})</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:12,alignItems:'start'}}>
                    <ResultPanel r={rA} tenure={dTenure} visible={!!rA} slim/>
                    <ResultPanel r={rB} tenure={dTenure} visible={!!rB} slim/>
                  </div>
                  {rA&&rB&&rA.canDown&&rB.canDown && (
                    <div style={{marginTop:12,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:C.rL,padding:'20px 24px',boxShadow:C.shadowMd}}>
                      <div style={{fontFamily:C.fontDisplay,fontSize:20,color:C.primary,marginBottom:4}}>Total cost over {dTenure} years</div>
                      <p style={{fontSize:C.sm,color:C.muted,marginBottom:18}}>Downpayment + all monthly instalments combined</p>
                      {[{r:rA,slot:'A',color:C.ndtm},{r:rB,slot:'B',color:C.blue}].map(({r,slot,color}) => {
                        const maxTco = Math.max(rA.totalCoo, rB.totalCoo)
                        const pct = (r.totalCoo/maxTco)*100
                        const cheaper = r.totalCoo <= Math.min(rA.totalCoo,rB.totalCoo)
                        return (
                          <div key={slot} style={{marginBottom:16}}>
                            <div style={{display:'flex',justifyContent:'space-between',marginBottom:7,alignItems:'center'}}>
                              <div style={{display:'flex',alignItems:'center',gap:10}}>
                                <span style={{background:color,color:'#fff',fontSize:C.xs,fontWeight:700,borderRadius:4,padding:'2px 8px',fontFamily:C.fontMono}}>{slot}</span>
                                <span style={{fontSize:C.sm,fontWeight:600,color:C.text}}>{r.car.name}</span>
                                {cheaper && <span style={{fontSize:C.xs,fontWeight:700,color:C.accentText,background:C.accentBg,border:`1px solid ${C.accent}44`,borderRadius:100,padding:'1px 8px'}}>CHEAPER</span>}
                              </div>
                              <span style={{fontSize:C.lg,fontFamily:C.fontMono,fontWeight:700,color}}>{SGD(r.totalCoo)}</span>
                            </div>
                            <div style={{height:8,background:C.bg,borderRadius:4,overflow:'hidden',border:`1px solid ${C.border}`}}>
                              <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:4,transition:'width 1s cubic-bezier(0.16,1,0.3,1) 0.3s'}}/>
                            </div>
                          </div>
                        )
                      })}
                      <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div>
                          <div style={{fontSize:C.sm,fontWeight:600,color:C.text}}>Choosing {rA.totalCoo<=rB.totalCoo?rA.car.short:rB.car.short} saves you</div>
                          <div style={{fontSize:C.xs,color:C.muted,marginTop:2}}>over the full {dTenure}-year loan period</div>
                        </div>
                        <span style={{fontFamily:C.fontDisplay,fontSize:C.xxl,color:C.accent}}>{SGD(Math.abs(rA.totalCoo-rB.totalCoo))}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
      </div>

    </div>
  )
}
