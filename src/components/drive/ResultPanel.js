'use client'

import { useState, useEffect } from 'react'
import { C, SGD } from '@/lib/drive/theme'
import { StatBox, GaugeBar } from './ui'
import { OwnershipCurve } from './OwnershipCurve'
import { DepreciationCard } from './DepreciationCard'
import { RunningCostCard } from './RunningCostCard'
import { CoeSensitivity } from './CoeSensitivity'
import { suggestAdjustments } from '@/lib/drive/solve'
import VerdictBadge from '@/components/shared/VerdictBadge'
import { calc } from '@/lib/drive/calc'
import { calcUsed } from '@/lib/drive/used-car'
import { encodePrefsToParams } from '@/lib/etf/logic'

export function ResultPanel({ r, tenure, visible, slim=false }) {
  const [phase, setPhase] = useState(0)
  const hasResult = !!r

  // Reset synchronously during render whenever the animation's key inputs
  // change, instead of as a side effect — the effect below only owns
  // scheduling the phased, timer-driven transitions. Uses state (not a ref)
  // to track the previous key, since refs must not be read/written during
  // render.
  const key = `${visible}|${hasResult}|${r?.verdict}|${r?.car?.id}|${tenure}`
  const [prevKey, setPrevKey] = useState(key)
  if (prevKey !== key) {
    setPrevKey(key)
    if (phase !== 0) setPhase(0)
  }

  useEffect(() => {
    if (!visible || !hasResult) return
    const t1 = setTimeout(() => setPhase(1),  40)
    const t2 = setTimeout(() => setPhase(2), 380)
    const t3 = setTimeout(() => setPhase(3), 620)
    const t4 = setTimeout(() => setPhase(4), 820)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [visible, hasResult, r?.verdict, r?.car?.id, tenure])
  if (!r) return (
    <div style={{flex:1,background:C.surface,border:`1.5px dashed ${C.border}`,borderRadius:C.rL,display:'flex',alignItems:'center',justifyContent:'center',minHeight:220,boxShadow:C.shadow}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:28,marginBottom:10,opacity:0.2}}>◻</div>
        <div style={{fontSize:C.sm,color:C.faint,fontWeight:500}}>Select a car to see results</div>
      </div>
    </div>
  )
  const { vc, vcText, vbg, vborder, car, tier, verdict, ratio, monthly, loan, maxLoan,
          interest, repay, takeHome, reqDown, canDown, shortfall, extraDown,
          saving, coo, totalCoo, lcPct, deprAtTenure, salary, down, tenure: rTenure, liveCOE, liveCOEPremium,
          existingDebt, mySharePct, tdsr, tdsrExceeded, tenureClamped, maxTenureFromCoe } = r
  // TDSR can fail even when the in-app "comfort" verdict says Affordable —
  // they're independent constraints (your own comfort vs. the bank's
  // regulatory ceiling) — so suggestions need to fire on either condition,
  // not just a non-Affordable verdict.
  const needsHelp = verdict !== 'Affordable' || tdsrExceeded
  // Reverse-solve concrete adjustments (extra down / shorter-than-max tenure)
  // against calc() itself, so these suggestions can never contradict the
  // numbers shown elsewhere — only computed when actually needed. Passes
  // mySharePct through so a joint loan's suggestions stay just as tight as
  // the TDSR figure shown above, instead of solving against a full-share
  // assumption that would over-suggest downpayment/tenure.
  const suggestions = needsHelp
    ? suggestAdjustments(salary, down, rTenure, car, liveCOE ? { catA: liveCOEPremium, catB: liveCOEPremium } : null, existingDebt, car.isUsed ? calcUsed : calc, mySharePct)
    : null
  const glowing = phase >= 2
  const contentIn = phase >= 3
  const metricsIn = phase >= 4
  const loanReduced = canDown && extraDown > 0
  // Stage 3 cross-tool nudge: when this car leaves real room under the 30%
  // comfort limit, offer to carry that number straight into WhatETF's DCA
  // planner — reuses ETF's own encodePrefsToParams so this can never drift
  // out of sync with how /etf/preferences reads its query params.
  const headroom = canDown && verdict === 'Affordable' ? Math.round(takeHome * 0.30 - monthly) : 0
  const verdictIcon = verdict==='Affordable' ? '✦' : verdict==='Stretch' ? '◈' : '✕'
  return (
    <div style={{flex:1,background:C.surface,border:`1.5px solid ${phase>=1?vborder:C.border}`,borderRadius:C.rL,overflow:'hidden',opacity:phase>=1?1:0,transform:phase>=1?'translateY(0) scale(1)':'translateY(16px) scale(0.98)',transition:'opacity 0.4s cubic-bezier(0.16,1,0.3,1),transform 0.4s,border-color 0.4s,box-shadow 0.5s',boxShadow:glowing?`${C.shadow},0 0 0 1px ${vc}22`:C.shadow}}>
      <div style={{height:3,background:vc,transformOrigin:'left center',animation:phase>=1?'barGrow 0.55s cubic-bezier(0.16,1,0.3,1) forwards':'none'}}/>
      <div style={{padding:slim?'16px 18px 14px':'22px 24px 18px',borderBottom:`1px solid ${C.border}`,background:vbg,position:'relative',overflow:'hidden'}}>
        {phase>=2 && <div style={{position:'absolute',top:40,left:'50%',transform:'translateX(-50%)',width:50,height:50,border:`2px solid ${vc}`,borderRadius:'50%',animation:'ringOut 0.7s ease-out forwards',pointerEvents:'none'}}/>}
        <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:14,opacity:contentIn?1:0,transition:'opacity 0.4s 0.1s'}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:7,background:C.surface,border:`1px solid ${C.border}`,borderRadius:100,padding:'4px 12px'}}>
            <span style={{fontSize:C.sm,fontWeight:600,color:C.text}}>{car.name}</span>
            <span style={{color:C.faint}}>·</span>
            <span style={{fontSize:C.sm,fontFamily:C.fontMono,fontWeight:700,color:C.primary}}>{SGD(car.price)}</span>
          </div>
          <div style={{display:'inline-flex',alignItems:'center',gap:6,background:tier.bg,border:`1px solid ${tier.color}44`,borderRadius:100,padding:'4px 12px'}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:tier.color,flexShrink:0}}/>
            <span style={{fontSize:C.xs,fontWeight:700,color:tier.color}}>{tier.label} · {tier.display}</span>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:48,height:48,borderRadius:'50%',background:C.surface,border:`2px solid ${vc}55`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:glowing?`0 0 16px ${vc}33`:'none',transition:'box-shadow 0.5s'}}>
              <span style={{fontSize:18,color:vc,animation:phase>=2?'spinIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards':undefined}}>{verdictIcon}</span>
            </div>
            <div>
              <div style={{fontSize:C.xs,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:5,opacity:contentIn?1:0}}>Your verdict</div>
              <div style={{opacity:contentIn?1:0,animation:phase>=3?'stampIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards':undefined}}>
                <VerdictBadge label={verdict} bg={vbg} color={vcText} size={slim?'md':'lg'} />
              </div>
            </div>
          </div>
          <div style={{textAlign:'right',opacity:contentIn?1:0,transition:'opacity 0.4s 0.3s'}}>
            <div style={{fontSize:C.xs,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Burden on pay</div>
            <div style={{fontSize:30,fontFamily:C.fontMono,fontWeight:500,color:vc,lineHeight:1}}>{(ratio*100).toFixed(1)}<span style={{fontSize:13}}>%</span></div>
            <div style={{fontSize:C.xs,color:C.muted,marginTop:2}}>of take-home</div>
          </div>
        </div>
        <p style={{marginTop:13,fontSize:C.sm,color:C.text,lineHeight:1.75,opacity:contentIn?1:0,transition:'opacity 0.5s 0.35s'}}>
          {!canDown
            ? <>{SGD(reqDown)} min. downpayment required ({100-car.loanCap}% of price). You&apos;re short by <strong style={{color:C.red}}>{SGD(shortfall)}</strong>.</>
            : verdict==='Affordable'
            ? <>{SGD(monthly)}/mo is {(ratio*100).toFixed(1)}% of take-home — comfortably within the 30% safe threshold.</>
            : verdict==='Stretch'
            ? <>{SGD(monthly)}/mo is {(ratio*100).toFixed(1)}% of take-home. Manageable, but leaves limited savings buffer.</>
            : <>{SGD(monthly)}/mo is {(ratio*100).toFixed(1)}% of take-home — above the 45% caution threshold. Consider a longer tenure or lower-priced car.</>}
        </p>
      </div>
      <div style={{padding:slim?'14px 18px 22px':'18px 24px 26px'}}>
        {tdsrExceeded && (
          <div style={{background:C.redBg,border:`1px solid ${C.red}44`,borderRadius:C.r,padding:'14px 16px',marginBottom:16,opacity:metricsIn?1:0,transition:'opacity 0.5s'}}>
            <div style={{fontSize:C.xs,fontWeight:700,color:C.red,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5}}>⚠ Exceeds MAS TDSR limit</div>
            <p style={{fontSize:C.sm,color:C.redText,lineHeight:1.65,margin:0}}>
              {existingDebt > 0
                ? <>Your existing debt (<strong>{SGD(existingDebt)}/mo</strong>) plus {mySharePct < 100 ? 'your share of' : ''} this car&apos;s instalment (<strong>{SGD(r.myMonthlyShare)}/mo</strong>) comes to <strong>{(tdsr*100).toFixed(1)}%</strong> of your gross income — above the bank&apos;s 55% Total Debt Servicing Ratio ceiling. A lender may reject this loan regardless of the verdict above.</>
                : <>{mySharePct < 100 ? 'Your share of this instalment alone is' : 'This instalment alone is'} <strong>{(tdsr*100).toFixed(1)}%</strong> of your gross income — above the bank&apos;s 55% Total Debt Servicing Ratio ceiling. A lender may reject this loan regardless of the verdict above.</>}
            </p>
            {mySharePct < 100 && (
              <p style={{fontSize:C.xs,color:C.redText,opacity:0.85,lineHeight:1.6,margin:'8px 0 0'}}>
                Joint loan: the full instalment is {SGD(monthly)}/mo — you&apos;re counted for {mySharePct.toFixed(1)}% ({SGD(r.myMonthlyShare)}/mo) against your own TDSR.
              </p>
            )}
          </div>
        )}
        {canDown && <GaugeBar ratio={ratio} visible={metricsIn}/>}
        {!canDown && (
          <div style={{background:C.redBg,border:`1px solid ${C.red}44`,borderRadius:C.r,padding:'14px 16px',marginBottom:16,opacity:metricsIn?1:0,transition:'opacity 0.5s'}}>
            <div style={{fontSize:C.xs,fontWeight:700,color:C.red,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5}}>⚠ Downpayment shortfall</div>
            <p style={{fontSize:C.sm,color:C.redText,lineHeight:1.65}}>You need <strong>{SGD(reqDown)}</strong> minimum. Save <strong>{SGD(shortfall)}</strong> more to qualify.</p>
          </div>
        )}
        {loanReduced && (
          <div style={{background:C.accentBg,border:`1px solid ${C.accent}55`,borderRadius:C.r,padding:'12px 14px',marginBottom:14,opacity:metricsIn?1:0,transition:'opacity 0.5s 0.1s'}}>
            <div style={{fontSize:C.xs,fontWeight:700,color:C.accent,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>✓ Reduced loan</div>
            <p style={{fontSize:C.sm,color:C.accentText,lineHeight:1.65}}>
              You&apos;re putting <strong>{SGD(extraDown)}</strong> above the minimum, reducing your loan to <strong>{SGD(loan)}</strong> from the max of <strong>{SGD(maxLoan)}</strong>. Saves you <strong>{SGD((maxLoan-loan)*tier.rate*rTenure)}</strong> in interest.
            </p>
          </div>
        )}
        {tenureClamped && (
          <div style={{background:C.amberBg,border:`1px solid ${C.amber}44`,borderRadius:C.r,padding:'11px 14px',marginBottom:14,opacity:metricsIn?1:0,transition:'opacity 0.5s'}}>
            <p style={{fontSize:C.sm,color:C.amberText,lineHeight:1.6,margin:0}}>
              Shortened to <strong>{rTenure} year{rTenure>1?'s':''}</strong> — this car&apos;s COE only has {maxTenureFromCoe} year{maxTenureFromCoe>1?'s':''} left, so a loan can&apos;t run longer than that.
            </p>
          </div>
        )}
        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:8,marginBottom:14}}>
          <StatBox label="Monthly instalment" value={`S$${Math.round(monthly)}`}  sub={`${rTenure} yr at ${tier.display}`}  accent delay={0}   visible={metricsIn}/>
          <StatBox label="Actual loan"         value={`S$${Math.round(loan)}`}     sub={`${car.loanCap}% of price`}          delay={80}  visible={metricsIn}/>
          <StatBox label="Total interest"      value={`S$${Math.round(interest)}`} sub={`Total repayable: ${SGD(repay)}`}    accent delay={160} visible={metricsIn}/>
          <StatBox label="Your take-home"      value={`S$${Math.round(takeHome)}`} sub={`30% safe limit: ${SGD(takeHome*0.30)}/mo`} delay={240} visible={metricsIn}/>
        </div>
        <OwnershipCurve coo={coo} tenure={rTenure} visible={metricsIn}/>
        <DepreciationCard r={r} tenure={rTenure} visible={metricsIn}/>
        <RunningCostCard r={r} visible={metricsIn}/>
        {metricsIn && <CoeSensitivity r={r} tenure={rTenure}/>}
        {tier.id !== 'ice' && saving > 0 && (
          <div style={{display:'flex',alignItems:'flex-start',gap:12,background:C.accentBg,border:`1px solid ${C.accent}44`,borderRadius:C.r,padding:'12px 14px',marginBottom:14,opacity:metricsIn?1:0,transition:'opacity 0.5s 0.45s'}}>
            <span style={{fontSize:20,flexShrink:0}}>💰</span>
            <div>
              <div style={{fontSize:C.xs,fontWeight:700,color:C.accent,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Green rate savings vs ICE</div>
              <p style={{fontSize:C.sm,color:C.accentText,lineHeight:1.65}}>Save <strong>{SGD(saving)}</strong> total — <strong>{SGD(saving/(rTenure*12))}/mo</strong> less than a petrol loan at the same amount.</p>
            </div>
          </div>
        )}
        {headroom > 50 && (
          <div style={{display:'flex',alignItems:'flex-start',gap:12,background:C.accentBg,border:`1px solid ${C.accent}44`,borderRadius:C.r,padding:'12px 14px',marginBottom:14,opacity:metricsIn?1:0,transition:'opacity 0.5s 0.5s'}}>
            <span style={{fontSize:20,flexShrink:0}}>🧭</span>
            <div>
              <div style={{fontSize:C.xs,fontWeight:700,color:C.accent,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>ndtm / invest</div>
              <p style={{fontSize:C.sm,color:C.accentText,lineHeight:1.65,margin:'0 0 8px'}}>
                This leaves <strong>{SGD(headroom)}/mo</strong> under your 30% comfort limit — untouched by this car.
              </p>
              <a
                href={`/etf/preferences?${encodePrefsToParams({ risk: 'Balanced', simplicity: '2-3 ETFs', tilts: [], monthlyInvestment: String(headroom) }).toString()}`}
                style={{fontSize:C.sm,fontWeight:700,color:C.accent,textDecoration:'none'}}
              >
                See what {SGD(headroom)}/mo could grow into →
              </a>
            </div>
          </div>
        )}
        {needsHelp && suggestions && (
          <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.r,padding:'13px 16px',opacity:metricsIn?1:0,transition:'opacity 0.5s 0.9s'}}>
            <div style={{fontSize:C.xs,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>💡 What would make this {tdsrExceeded && verdict==='Affordable' ? 'clear the TDSR limit' : 'affordable'}</div>
            {!canDown ? (
              <p style={{fontSize:C.sm,color:C.text,lineHeight:1.75,margin:0}}>
                You&apos;re short <strong style={{color:C.primary}}>{SGD(shortfall)}</strong> of the minimum downpayment ({100-car.loanCap}% of price) — this car isn&apos;t financeable at your current cash on hand, regardless of tenure.
                {suggestions.ceiling && <> At your current salary and cash, your affordability ceiling is roughly <strong style={{color:C.primary}}>{SGD(Math.max(suggestions.ceiling.catA, suggestions.ceiling.catB))}</strong> — worth looking at cars in that range.</>}
              </p>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {suggestions.extraDown != null && suggestions.extraDown > 0 && (
                  <p style={{fontSize:C.sm,color:C.text,lineHeight:1.6,margin:0}}>
                    → Add <strong style={{color:C.primary}}>{SGD(suggestions.extraDown)}</strong> more downpayment (total {SGD(down+suggestions.extraDown)}) to clear {tdsrExceeded ? 'both the 30% comfort limit and the bank\'s TDSR ceiling' : <>both and reach <strong style={{color:C.accent}}>Affordable</strong></>} at {rTenure} year{rTenure>1?'s':''}.
                  </p>
                )}
                {suggestions.minTenure != null && suggestions.minTenure !== rTenure && (
                  <p style={{fontSize:C.sm,color:C.text,lineHeight:1.6,margin:0}}>
                    → Extend to <strong style={{color:C.primary}}>{suggestions.minTenure} year{suggestions.minTenure>1?'s':''}</strong> (from {rTenure}) to clear {tdsrExceeded ? 'both the 30% comfort limit and the bank\'s TDSR ceiling' : <>both and reach <strong style={{color:C.accent}}>Affordable</strong></>} at your current downpayment.
                  </p>
                )}
                {suggestions.extraDown == null && suggestions.minTenure == null && suggestions.ceiling && (
                  <p style={{fontSize:C.sm,color:C.text,lineHeight:1.6,margin:0}}>
                    Neither more cash down nor a longer tenure alone gets this to Affordable within a 7-year loan. Your current affordability ceiling is roughly <strong style={{color:C.primary}}>{SGD(Math.max(suggestions.ceiling.catA, suggestions.ceiling.catB))}</strong> — worth comparing against a lower-priced car.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
