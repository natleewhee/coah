'use client'

import { useState, useEffect } from 'react'
import { C, SGD } from '@/lib/drive/theme'
import { calcCeiling } from '@/lib/drive/calc'

export function AffordabilityCeilingCard({ salary, down, tenure, existingDebt = 0, mySharePct = 100 }) {
  const ceiling = calcCeiling(salary, down, tenure, existingDebt, mySharePct)
  const [visible, setVisible] = useState(false)
  const shouldShow = !!(salary && down)
  const [prevShouldShow, setPrevShouldShow] = useState(shouldShow)
  if (prevShouldShow !== shouldShow) {
    setPrevShouldShow(shouldShow)
    if (!shouldShow && visible) setVisible(false)
  }
  useEffect(() => {
    if (shouldShow) { const t = setTimeout(() => setVisible(true), 80); return () => clearTimeout(t) }
  }, [shouldShow, tenure])
  if (!salary || !down || !ceiling) return null
  const maxCeil = Math.max(ceiling.catA, ceiling.catB)
  return (
    <div style={{background:C.surface,border:`1.5px solid ${C.accent}`,borderRadius:C.rL,overflow:'hidden',marginBottom:20,opacity:visible?1:0,transform:visible?'translateY(0)':'translateY(8px)',transition:'opacity 0.4s,transform 0.4s',boxShadow:`${C.shadowMd},0 0 0 1px ${C.accent}22`}}>
      <div style={{background:`linear-gradient(135deg,${C.ndtm} 0%,${C.ndtmMid} 100%)`,padding:'16px 22px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:C.xs,fontWeight:700,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',letterSpacing:'0.14em',marginBottom:4}}>Your affordability ceiling</div>
          <div style={{fontFamily:C.fontDisplay,fontSize:'clamp(22px,4vw,32px)',color:'#fff',lineHeight:1.1}}>
            Up to <span style={{color:'#8fe0c4'}}>{SGD(maxCeil)}</span>
          </div>
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          {[
            { label:'Cat A ceiling', val:SGD(ceiling.catA), sub:'OMV ≤ S$20k' },
            { label:'Cat B ceiling', val:SGD(ceiling.catB), sub:'OMV > S$20k' },
          ].map(({ label, val, sub }) => (
            <div key={label} style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:C.r,padding:'10px 14px',textAlign:'center'}}>
              <div style={{fontSize:C.xs,color:'rgba(255,255,255,0.45)',marginBottom:3}}>{label}</div>
              <div style={{fontFamily:C.fontMono,fontWeight:700,fontSize:C.lg,color:'#fff'}}>{val}</div>
              <div style={{fontSize:'10px',color:'rgba(255,255,255,0.3)',marginTop:2}}>{sub}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{padding:'10px 22px',background:ceiling.tdsrBinding?C.amberBg:C.accentBg,display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:14}}>{ceiling.tdsrBinding ? '⚠️' : '💡'}</span>
        <p style={{fontSize:C.sm,color:ceiling.tdsrBinding?C.amberText:C.accentText,lineHeight:1.5}}>
          {ceiling.tdsrBinding
            ? <>Limited by your <strong>existing debt</strong>, not comfort — at <strong>{SGD(Math.round(ceiling.maxMonthly))}/mo</strong> max instalment, this keeps you under the bank&apos;s 55% TDSR ceiling. Without that debt your comfort limit alone would allow ~<strong>{SGD(Math.round(ceiling.maxMonthlyComfort))}/mo</strong>.</>
            : <>At <strong>{SGD(Math.round(ceiling.maxMonthly))}/mo</strong> max instalment, staying within this range keeps your car spend comfortably under 30% of take-home pay.</>}
        </p>
      </div>
    </div>
  )
}
