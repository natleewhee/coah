'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  calcRenewOption, calcBuyNewOption, calcBuyUsedOption, getVerdict,
  calcARF, calcPARF, calcCOERebate, getAnnualMaintenance,
  MAINTENANCE_BY_BRAND
} from './renew-math'
import { COE_FALLBACK } from '@/lib/drive/calc'
import { COE_ENDPOINT } from '@/lib/drive/endpoints'
import ShellHeader from '@/components/shared/ShellHeader'
import { C } from '@/lib/drive/theme'

const SGD = n => `S$${Math.round(Math.abs(n)).toLocaleString('en-SG')}`
// Reuses the same fallback constant as the main calculator (src/lib/calc.js)
// instead of keeping a second copy that can drift out of sync with it.
const PQP_FALLBACK = COE_FALLBACK
const BRAND_OPTIONS = Object.entries(MAINTENANCE_BY_BRAND)
  .sort((a,b) => a[1].label.localeCompare(b[1].label))
  .map(([key,val]) => ({ key, label: val.label }))

// ─── SMALL UI COMPONENTS ─────────────────────────────────────────────────────
function Label({ children }) {
  return <div style={{fontSize:C.xs,fontWeight:700,color:C.primary,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>{children}</div>
}
function Hint({ children }) {
  return <div style={{fontSize:'10px',color:C.faint,marginBottom:6,lineHeight:1.5}}>{children}</div>
}
function MoneyInput({ label, hint, value, onChange, placeholder='0' }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <Label>{label}</Label>
      {hint && <Hint>{hint}</Hint>}
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'10px 14px',border:`1.5px solid ${focused?C.accent:C.borderControl}`,borderRadius:C.rL,background:C.surface,boxShadow:focused?`0 0 0 3px ${C.accentBg}`:'none',transition:'all 0.15s'}}>
        <span style={{fontSize:C.sm,color:C.faint,flexShrink:0}}>S$</span>
        <input type="text" value={value} placeholder={placeholder}
          onChange={e=>onChange(e.target.value.replace(/[^0-9]/g,''))}
          onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
          style={{flex:1,minWidth:0,border:'none',outline:'none',fontSize:C.sm,fontFamily:C.fontMono,fontWeight:600,color:C.primary,background:'transparent',padding:0}}/>
      </div>
    </div>
  )
}
function Slider({ label, hint, value, onChange, min, max, step=1, unit='' }) {
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
        <Label>{label}</Label>
        <span style={{fontSize:C.sm,fontFamily:C.fontMono,fontWeight:700,color:C.primary}}>{value}{unit}</span>
      </div>
      {hint && <Hint>{hint}</Hint>}
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(Number(e.target.value))}
        style={{width:'100%',accentColor:C.accent}}/>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:'10px',color:C.faint,marginTop:2}}>
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  )
}
function BrandSelect({ value, onChange }) {
  return (
    <div>
      <Label>Brand</Label>
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{width:'100%',padding:'10px 14px',border:`1.5px solid ${C.border}`,borderRadius:C.rL,fontSize:C.sm,color:C.primary,fontFamily:C.fontBody,background:C.surface,outline:'none'}}>
        {BRAND_OPTIONS.map(b=><option key={b.key} value={b.key}>{b.label}</option>)}
      </select>
    </div>
  )
}
function Card({ children, highlight=false }) {
  return (
    <div style={{background:C.surface,border:`1.5px solid ${highlight?C.accent:C.border}`,borderRadius:C.rL,padding:20,boxShadow:C.shadow}}>
      {children}
    </div>
  )
}
function SectionTitle({ children }) {
  return <div style={{fontFamily:C.fontDisplay,fontSize:16,color:C.primary,marginBottom:16}}>{children}</div>
}

// ─── RESULT CARD ─────────────────────────────────────────────────────────────
function ResultCard({ result, isWinner }) {
  const LABELS = { renew:'Renew', new:'Buy New', used:'Buy Used' }
  const ICONS = { renew:'↻', new:'🚗', used:'🔄' }
  const label = result.type === 'renew'
    ? `Renew ${result.renewYears} years`
    : result.type === 'new' ? 'Buy new' : 'Buy used'

  return (
    <div style={{background:C.surface,border:`2px solid ${isWinner?C.accent:C.border}`,borderRadius:C.rL,overflow:'hidden',boxShadow:isWinner?`0 0 0 3px ${C.accentBg},${C.shadow}`:C.shadow}}>
      <div style={{padding:'12px 16px',background:isWinner?C.accentBg:C.bg,borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{fontWeight:700,fontSize:C.sm,color:isWinner?C.accentText:C.muted}}>{label}</div>
        {isWinner && <span style={{fontSize:C.xs,fontWeight:700,color:C.accent,background:C.surface,border:`1px solid ${C.accent}55`,borderRadius:100,padding:'2px 10px'}}>Cheapest</span>}
      </div>
      <div style={{padding:16}}>
        {/* Annual cost — the headline */}
        <div style={{marginBottom:14,padding:'12px 14px',background:isWinner?C.accentBg:C.bg,borderRadius:C.r}}>
          <div style={{fontSize:C.xs,color:C.muted,marginBottom:2}}>Annual cost</div>
          <div style={{fontFamily:C.fontMono,fontSize:C.xl,fontWeight:700,color:isWinner?C.accent:C.primary}}>{SGD(result.annual)}<span style={{fontSize:C.xs,fontWeight:400,color:C.faint}}> /year</span></div>
        </div>
        {/* Total cost secondary */}
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.border}`}}>
          <span style={{fontSize:C.xs,color:C.muted}}>Total over {result.renewYears || result.usefulYears?.toFixed(0) || result.years} years</span>
          <span style={{fontSize:C.sm,fontFamily:C.fontMono,fontWeight:700,color:C.text}}>{SGD(result.totalCost)}</span>
        </div>
        {/* Breakdown */}
        <div style={{display:'flex',flexDirection:'column',gap:5}}>
          {result.type === 'renew' && <>
            <Row k={`COE renewal (${result.renewYears===5?'50%':'100%'} of PQP)`} v={SGD(result.breakdown.renewalCost)} />
            <Row k="Scrap value given up" v={SGD(result.breakdown.opportunityCost)} />
            <Row k={`Maintenance (${result.renewYears}yr)`} v={SGD(result.breakdown.maintenance)} />
            <Row k="Recovery at end (PARF)" v={`−${SGD(result.breakdown.recoveryAtEnd)}`} positive />
          </>}
          {result.type === 'new' && <>
            <Row k="Downpayment" v={SGD(result.breakdown.downpayment)} />
            <Row k="Loan + interest" v={SGD(result.breakdown.instalments)} />
            <Row k={`Maintenance (${result.years}yr)`} v={SGD(result.breakdown.maintenance)} />
            <Row k="Recovery at end (PARF+COE)" v={`−${SGD(result.breakdown.recoveryAtEnd)}`} positive />
          </>}
          {result.type === 'used' && <>
            <Row k="Purchase price" v={SGD(result.breakdown.purchasePrice)} />
            <Row k={`Maintenance (${result.usefulYears?.toFixed(0)}yr)`} v={SGD(result.breakdown.maintenance)} />
            <Row k="Recovery at end (PARF)" v={`−${SGD(result.breakdown.recoveryAtEnd)}`} positive />
            <div style={{marginTop:6,padding:'7px 10px',background:C.blueBg,borderRadius:C.r,fontSize:C.xs,color:C.blueText}}>
              Cost per remaining COE year: <strong>{SGD(result.costPerCOEYear)}/yr</strong>
            </div>
          </>}
          {result.type === 'new' && result.monthly > 0 && (
            <div style={{marginTop:6,padding:'7px 10px',background:result.canAfford?C.accentBg:C.amberBg,borderRadius:C.r,fontSize:C.xs,color:result.canAfford?C.accentText:C.amberText}}>
              Monthly: <strong>{SGD(result.monthly)}</strong>{result.ratio?` · ${(result.ratio*100).toFixed(0)}% of take-home`:''}
            </div>
          )}
        </div>
        {/* Warnings */}
        {result.finalCoe && (
          <div style={{marginTop:10,padding:'8px 10px',background:C.amberBg,borderRadius:C.r,fontSize:C.xs,color:C.amberText,lineHeight:1.5}}>
            ⚠ After 5 years, this car must be deregistered. Budget for a replacement — this cost is not included above.
          </div>
        )}
        {result.batteryRisk && (
          <div style={{marginTop:8,padding:'8px 10px',background:C.amberBg,borderRadius:C.r,fontSize:C.xs,color:C.amberText,lineHeight:1.5}}>
            ⚡ EV battery risk at age {result.endAge} — potential S$15k–30k replacement cost not included.
          </div>
        )}
      </div>
    </div>
  )
}
function Row({ k, v, positive }) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',fontSize:C.xs}}>
      <span style={{color:C.muted}}>{k}</span>
      <span style={{fontFamily:C.fontMono,fontWeight:600,color:positive?C.accent:C.text}}>{v}</span>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function RenewOrReplacePage() {
  const [pqp, setPqp]         = useState(PQP_FALLBACK)
  const [pqpLive, setPqpLive] = useState(false)

  // Current car
  const [carAge,       setCarAge]       = useState(7)
  const [monthsLeft,   setMonthsLeft]   = useState(36)
  const [brandKey,     setBrandKey]     = useState('toyota')
  const [omvRaw,       setOmvRaw]       = useState('27000')
  const [pqpOverride,  setPqpOverride]  = useState('')
  const [coeType,      setCoeType]      = useState('catA')
  const [isEVCurrent,  setIsEVCurrent]  = useState(false)
  const [maintOverride,setMaintOverride]= useState('')

  // New car
  const [newPrice,     setNewPrice]     = useState('200000')
  const [newOmvRaw,    setNewOmvRaw]    = useState('27000')
  const [newIsEV,      setNewIsEV]      = useState(false)
  const [newBrand,     setNewBrand]     = useState('toyota')
  const [newCoeType,   setNewCoeType]   = useState('catA')
  const [salary,       setSalary]       = useState('')
  const [downpayment,  setDownpayment]  = useState('')
  const [tenure,       setTenure]       = useState(7)
  const [loanCap,      setLoanCap]      = useState(70)

  // Used car
  const [usedPrice,    setUsedPrice]    = useState('80000')
  const [usedAge,      setUsedAge]      = useState(5)
  const [usedMonths,   setUsedMonths]   = useState(60)
  const [usedMileage,  setUsedMileage]  = useState(60000)
  const [usedBrand,    setUsedBrand]    = useState('toyota')
  const [usedOmvRaw,   setUsedOmvRaw]   = useState('27000')

  // Which options to show
  const [showRenew5,   setShowRenew5]   = useState(true)
  const [showRenew10,  setShowRenew10]  = useState(true)
  const [showNew,      setShowNew]      = useState(true)
  const [showUsed,     setShowUsed]     = useState(false)

  const [results, setResults] = useState(null)

  useEffect(() => {
    fetch(COE_ENDPOINT).then(r=>r.json()).then(d=>{
      if (d.catA && d.catB) { setPqp({ catA:d.catA.premium, catB:d.catB.premium }); setPqpLive(true) }
    }).catch(()=>{})
  }, [])

  const activePQP = pqpOverride ? parseInt(pqpOverride,10) : pqp[coeType]
  const omv = parseInt(omvRaw||'0', 10)
  const arf = calcARF(omv)
  const eeai = isEVCurrent ? Math.min(arf*0.45, 7500) : 0
  const netArf = Math.max(0, arf - eeai)
  const parfNow = calcPARF(netArf, carAge)
  const coeRebateNow = calcCOERebate(activePQP, monthsLeft)
  const customMaint = maintOverride ? parseInt(maintOverride,10) : null

  const comparisionYears = 10 // align all options to 10-year horizon where possible

  const calculate = useCallback(() => {
    const opts = []

    const baseRenewInputs = {
      carAge, monthsRemaining: monthsLeft, pqp: activePQP,
      omv, ves: 0, isEV: isEVCurrent, brandKey, customMaintenance: customMaint,
    }

    if (showRenew5)  opts.push({ ...calcRenewOption({...baseRenewInputs, renewYears:5}),  typeLabel:'Renew 5 years'  })
    if (showRenew10) opts.push({ ...calcRenewOption({...baseRenewInputs, renewYears:10}), typeLabel:'Renew 10 years' })

    if (showNew) {
      const rateTier = newIsEV ? (newBrand==='tesla'?'tesla':'green') : 'ice'
      opts.push({
        ...calcBuyNewOption({
          price: parseInt(newPrice||'200000',10),
          omv: parseInt(newOmvRaw||'27000',10),
          ves: 0, isEV: newIsEV,
          salary: parseInt(salary||'0',10),
          downpayment: parseInt(downpayment||'0',10),
          tenure, loanCap, rateTier,
          brandKey: newBrand, years: comparisionYears,
          customMaintenance: customMaint,
        }),
        typeLabel: 'Buy new',
      })
    }

    if (showUsed) {
      opts.push({
        ...calcBuyUsedOption({
          price: parseInt(usedPrice||'80000',10),
          carAge: usedAge, monthsRemaining: usedMonths,
          mileage: usedMileage,
          omv: parseInt(usedOmvRaw||'27000',10),
          brandKey: usedBrand, customMaintenance: customMaint,
        }),
        typeLabel: 'Buy used',
      })
    }

    if (opts.length === 0) return
    const verdict = getVerdict(opts)
    setResults({ opts, verdict })
    setTimeout(()=>document.getElementById('ror-results')?.scrollIntoView({behavior:'smooth',block:'start'}),100)
  }, [carAge, monthsLeft, activePQP, omv, isEVCurrent, brandKey, customMaint,
      showRenew5, showRenew10, showNew, showUsed,
      newPrice, newOmvRaw, newIsEV, newBrand, salary, downpayment, tenure, loanCap,
      usedPrice, usedAge, usedMonths, usedMileage, usedBrand, usedOmvRaw])

  return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',background:C.bg,fontFamily:C.fontBody}}>

      <ShellHeader
        title="Renew or Replace?"
        backHref="/drive"
        links={[{ href: '/drive/renew-or-replace/the-math', label: 'The Math' }]}
      />

      <div style={{background:C.bg,borderBottom:`1px solid ${C.border}`,padding:'8px 24px',textAlign:'center'}}>
        <p style={{fontSize:11,color:C.faint,margin:0}}>Educational tool only · Not financial advice · Not affiliated with any dealer or MAS-licensed entity</p>
      </div>

      <main style={{flex:1,maxWidth:960,margin:'0 auto',width:'100%',padding:'32px 16px 80px'}}>

        {/* Hero */}
        <div style={{textAlign:'center',marginBottom:32}}>
          <h1 style={{fontFamily:C.fontDisplay,fontSize:'clamp(26px,5vw,40px)',color:C.primary,margin:'0 0 10px',lineHeight:1.2}}>Renew or Replace?</h1>
          <p style={{fontSize:C.base,color:C.muted,maxWidth:540,margin:'0 auto 12px',lineHeight:1.7}}>Compare every option by annual cost — renewing your COE for 5 or 10 years, buying a new car, or buying used.</p>
          {pqpLive ? (
            <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'5px 14px',background:C.accentBg,borderRadius:100,border:`1px solid ${C.accent}33`,fontSize:C.xs,color:C.accentText}}>
              Live COE · Cat A: <strong>{SGD(pqp.catA)}</strong> · Cat B: <strong>{SGD(pqp.catB)}</strong> · via data.gov.sg
            </div>
          ) : (
            <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'5px 14px',background:C.amberBg,borderRadius:100,border:`1px solid ${C.amber}33`,fontSize:C.xs,color:C.amberText}}>
              Using fallback COE rates — LTA live data unavailable
            </div>
          )}
        </div>

        {/* What to compare */}
        <Card>
          <SectionTitle>What do you want to compare?</SectionTitle>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            {[
              ['showRenew5',  showRenew5,  setShowRenew5,  'Renew 5 years (50% PQP)'],
              ['showRenew10', showRenew10, setShowRenew10, 'Renew 10 years (100% PQP)'],
              ['showNew',     showNew,     setShowNew,     'Buy new car'],
              ['showUsed',    showUsed,    setShowUsed,    'Buy used car'],
            ].map(([id, val, set, lbl]) => (
              <button key={id} onClick={()=>set(!val)}
                style={{padding:'8px 16px',borderRadius:100,border:`1.5px solid ${val?C.accent:C.border}`,background:val?C.accentBg:C.surface,color:val?C.accentText:C.muted,fontSize:C.sm,fontWeight:val?700:400,cursor:'pointer',fontFamily:C.fontBody,transition:'all 0.15s'}}>
                {val?'✓ ':''}{lbl}
              </button>
            ))}
          </div>
          <div style={{marginTop:12,padding:'8px 12px',background:C.bg,borderRadius:C.r,fontSize:C.xs,color:C.muted,lineHeight:1.6}}>
            <strong style={{color:C.primary}}>LTA rule:</strong> For Cat A/B cars, 5-year renewal can only be done <strong>once</strong> — after it expires, the car must be deregistered. 10-year renewal can be repeated indefinitely.
          </div>
        </Card>

        <div style={{height:20}}/>

        {/* Current car */}
        <Card>
          <SectionTitle>Your current car</SectionTitle>
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:18}}>
            <Slider label="Car age" value={carAge} onChange={setCarAge} min={1} max={15} unit=" years" hint="How old is your car now?" />
            <Slider label="Months remaining on COE" value={monthsLeft} onChange={setMonthsLeft} min={1} max={120} unit=" months" />
            <BrandSelect value={brandKey} onChange={setBrandKey}/>
            <MoneyInput label="Car OMV" hint="Check via OneMotoring vehicle enquiry" value={omvRaw} onChange={setOmvRaw}/>
            <div>
              <Label>COE Category</Label>
              <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:8}}>
                {[['catA','Cat A','OMV ≤ S$20k'],['catB','Cat B','OMV > S$20k']].map(([v,l,s])=>(
                  <button key={v} onClick={()=>setCoeType(v)} style={{padding:'9px 12px',borderRadius:C.r,border:`1.5px solid ${coeType===v?C.accent:C.border}`,background:coeType===v?C.accentBg:C.surface,cursor:'pointer',textAlign:'left',fontFamily:C.fontBody}}>
                    <div style={{fontSize:C.sm,fontWeight:700,color:coeType===v?C.accent:C.primary}}>{l}</div>
                    <div style={{fontSize:C.xs,color:C.muted}}>{s}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Electric vehicle?</Label>
              <Hint>Affects PARF calculation (EEAI rebate on ARF)</Hint>
              <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:8}}>
                {[['yes','Yes — EV/PHEV'],['no','No — ICE/hybrid']].map(([v,l])=>(
                  <button key={v} onClick={()=>setIsEVCurrent(v==='yes')} style={{padding:'9px 12px',borderRadius:C.r,border:`1.5px solid ${isEVCurrent===(v==='yes')?C.accent:C.border}`,background:isEVCurrent===(v==='yes')?C.accentBg:C.surface,cursor:'pointer',fontFamily:C.fontBody,fontSize:C.sm,fontWeight:700,color:isEVCurrent===(v==='yes')?C.accent:C.primary}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Computed values */}
          <div style={{marginTop:16,display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10}}>
            {[
              ['PARF if scrapped now', SGD(parfNow), C.accent],
              ['COE rebate now', SGD(coeRebateNow), C.accent],
              ['Total scrap value', SGD(parfNow+coeRebateNow), C.primary],
              ['Est. annual maintenance', SGD(getAnnualMaintenance(brandKey, carAge))+'/yr', C.muted],
            ].map(([k,v,col])=>(
              <div key={k} style={{background:C.bg,borderRadius:C.r,padding:'10px 12px',border:`1px solid ${C.border}`}}>
                <div style={{fontSize:'10px',color:C.faint,marginBottom:3}}>{k}</div>
                <div style={{fontSize:C.sm,fontFamily:C.fontMono,fontWeight:700,color:col}}>{v}</div>
              </div>
            ))}
          </div>

          {/* PQP display + override */}
          <div style={{marginTop:14,padding:'10px 14px',background:C.bg,borderRadius:C.r,border:`1px solid ${C.border}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <div style={{fontSize:C.xs,color:C.muted}}>
                COE renewal price (PQP — {coeType==='catA'?'Cat A':'Cat B'}): <strong style={{color:C.primary}}>{SGD(activePQP)}</strong>
                {pqpLive && !pqpOverride && <span style={{color:C.accent,marginLeft:6,fontSize:'10px'}}>· live from LTA</span>}
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:10}}>
              <div style={{padding:'8px 12px',background:C.accentBg,borderRadius:C.r,border:`1px solid ${C.accent}33`}}>
                <div style={{fontSize:'10px',color:C.accentText,marginBottom:2}}>5-year renewal cost (50% PQP)</div>
                <div style={{fontFamily:C.fontMono,fontWeight:700,color:C.primary,fontSize:C.base}}>{SGD(activePQP*0.5)}</div>
              </div>
              <div style={{padding:'8px 12px',background:C.blueBg,borderRadius:C.r,border:`1px solid ${C.blue}33`}}>
                <div style={{fontSize:'10px',color:C.blueText,marginBottom:2}}>10-year renewal cost (100% PQP)</div>
                <div style={{fontFamily:C.fontMono,fontWeight:700,color:C.primary,fontSize:C.base}}>{SGD(activePQP)}</div>
              </div>
            </div>
            <details style={{marginTop:10}}>
              <summary style={{fontSize:'10px',color:C.muted,cursor:'pointer',userSelect:'none'}}>Override PQP or maintenance estimate</summary>
              <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:10,marginTop:10}}>
                <MoneyInput label="Override PQP" hint="Leave blank to use live LTA value" value={pqpOverride} onChange={setPqpOverride}/>
                <MoneyInput label="Annual maintenance override" hint={`Our estimate: ${SGD(getAnnualMaintenance(brandKey,carAge))}/yr`} value={maintOverride} onChange={setMaintOverride}/>
              </div>
            </details>
          </div>
        </Card>

        {/* New car section */}
        {showNew && (
          <>
            <div style={{height:20}}/>
            <Card>
              <SectionTitle>Replacement — new car</SectionTitle>
              <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:18}}>
                <MoneyInput label="Car price (incl. COE)" hint="Enter the price the dealer quoted you" value={newPrice} onChange={setNewPrice}/>
                <MoneyInput label="Car OMV" hint="From the dealer's price breakdown" value={newOmvRaw} onChange={setNewOmvRaw}/>
                <BrandSelect value={newBrand} onChange={setNewBrand}/>
                <div>
                  <Label>Electric vehicle?</Label>
                  <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:8,marginTop:4}}>
                    {[['yes','Yes — EV/PHEV'],['no','No — ICE/hybrid']].map(([v,l])=>(
                      <button key={v} onClick={()=>setNewIsEV(v==='yes')} style={{padding:'9px 12px',borderRadius:C.r,border:`1.5px solid ${newIsEV===(v==='yes')?C.accent:C.border}`,background:newIsEV===(v==='yes')?C.accentBg:C.surface,cursor:'pointer',fontFamily:C.fontBody,fontSize:C.sm,fontWeight:700,color:newIsEV===(v==='yes')?C.accent:C.primary}}>{l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Max loan</Label>
                  <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:8,marginTop:4}}>
                    {[[70,'70%','OMV ≤ S$20k'],[60,'60%','OMV > S$20k']].map(([v,l,s])=>(
                      <button key={v} onClick={()=>setLoanCap(v)} style={{padding:'9px 12px',borderRadius:C.r,border:`1.5px solid ${loanCap===v?C.accent:C.border}`,background:loanCap===v?C.accentBg:C.surface,cursor:'pointer',textAlign:'left',fontFamily:C.fontBody}}>
                        <div style={{fontSize:C.sm,fontWeight:700,color:loanCap===v?C.accent:C.primary}}>{l}</div>
                        <div style={{fontSize:C.xs,color:C.muted}}>{s}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <Slider label="Loan tenure" value={tenure} onChange={setTenure} min={1} max={7} unit=" years"/>
              </div>
              <details style={{marginTop:14}}>
                <summary style={{fontSize:C.xs,color:C.muted,cursor:'pointer',userSelect:'none'}}>Add salary & downpayment (for affordability check)</summary>
                <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:14,marginTop:12}}>
                  <MoneyInput label="Monthly gross salary" value={salary} onChange={setSalary}/>
                  <MoneyInput label="Downpayment available" value={downpayment} onChange={setDownpayment}/>
                </div>
              </details>
            </Card>
          </>
        )}

        {/* Used car section */}
        {showUsed && (
          <>
            <div style={{height:20}}/>
            <Card>
              <SectionTitle>Replacement — used car</SectionTitle>
              <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:18}}>
                <MoneyInput label="Asking price" hint="What the seller is asking" value={usedPrice} onChange={setUsedPrice}/>
                <Slider label="Age of used car" value={usedAge} onChange={setUsedAge} min={1} max={9} unit=" years" hint="How old is the used car?" />
                <Slider label="Remaining COE months" value={usedMonths} onChange={setUsedMonths} min={1} max={119} unit=" months" hint="Check the car's log card or OneMotoring"/>
                <Slider label="Mileage" value={usedMileage} onChange={setUsedMileage} min={10000} max={200000} step={5000} unit=" km" hint="Higher mileage = higher maintenance estimate"/>
                <BrandSelect value={usedBrand} onChange={setUsedBrand}/>
                <MoneyInput label="Car OMV" hint="For PARF recovery calculation" value={usedOmvRaw} onChange={setUsedOmvRaw}/>
              </div>
              <div style={{marginTop:14,padding:'10px 14px',background:C.bg,borderRadius:C.r,border:`1px solid ${C.border}`,fontSize:C.xs,color:C.muted,lineHeight:1.6}}>
                Useful life: <strong style={{color:C.primary}}>{(usedMonths/12).toFixed(1)} years</strong> of remaining COE ·
                Car will be <strong style={{color:C.primary}}>{(usedAge + usedMonths/12).toFixed(1)} years old</strong> at expiry ·
                {(usedAge + usedMonths/12) <= 10 ? ' PARF rebate available at expiry' : ' No PARF — car will be over 10 years old at expiry'}
              </div>
            </Card>
          </>
        )}

        <div style={{height:24}}/>
        <button onClick={calculate}
          style={{width:'100%',padding:'16px',background:C.ndtm,color:'#fff',border:'none',borderRadius:C.rL,fontSize:C.base,fontWeight:700,cursor:'pointer',fontFamily:C.fontBody,boxShadow:'0 4px 16px rgba(0,0,0,0.35)'}}>
          Compare options →
        </button>

        {/* ── RESULTS ── */}
        {results && (
          <div id="ror-results" style={{marginTop:32,animation:'fadeUp 0.3s ease both'}}>

            {/* Verdict */}
            <div style={{background:C.ndtm,borderRadius:C.rXL,padding:28,marginBottom:24}}>
              <div style={{fontSize:C.xs,fontWeight:700,color:'rgba(255,255,255,0.45)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6}}>Our assessment</div>
              <div style={{fontFamily:C.fontDisplay,fontSize:22,color:'#fff',marginBottom:10,lineHeight:1.3}}>{results.verdict.headline}</div>
              <p style={{fontSize:C.sm,color:'rgba(255,255,255,0.7)',margin:'0 0 14px',lineHeight:1.7}}>{results.verdict.rationale}</p>
              {results.verdict.caveats.length > 0 && (
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {results.verdict.caveats.map((c,i)=>(
                    <div key={i} style={{display:'flex',gap:8,fontSize:C.xs,color:'rgba(255,255,255,0.55)'}}>
                      <span style={{color:C.amberText,flexShrink:0}}>⚠</span><span>{c}</span>
                    </div>
                  ))}
                </div>
              )}
              {results.verdict.pctDearer > 0 && (
                <div style={{marginTop:14,padding:'10px 14px',background:'rgba(255,255,255,0.07)',borderRadius:C.r,fontSize:C.xs,color:'rgba(255,255,255,0.6)'}}>
                  The next cheapest option costs <strong style={{color:'#fff'}}>{results.verdict.pctDearer.toFixed(0)}% more per year</strong> — equivalent to <strong style={{color:'#fff'}}>{SGD(results.verdict.diff)}/year</strong> extra.
                </div>
              )}
            </div>

            {/* Result cards grid */}
            <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(results.opts.length,2)}, minmax(0,1fr))`,gap:16,marginBottom:16}}>
              {results.verdict.sorted.map((opt,i)=>(
                <ResultCard key={opt.typeLabel} result={opt} isWinner={i===0}/>
              ))}
            </div>

            <p style={{fontSize:C.xs,color:C.faint,textAlign:'center',lineHeight:1.6}}>
              Annual cost = (total money paid − total money recovered) ÷ years of use.
              All figures are estimates. <Link href="/drive/renew-or-replace/the-math" style={{color:C.primary}}>See full methodology →</Link>
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
