'use client'

import { useState, useEffect } from 'react'
import { C, parseMoneyKM } from '@/lib/drive/theme'
import { useCountUp } from '@/lib/drive/hooks'

export function SectionDivider({ label }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:12,margin:'22px 0'}}>
      <div style={{flex:1,height:1,background:C.border}}/>
      <span style={{fontSize:C.xs,fontWeight:700,color:C.faint,textTransform:'uppercase',letterSpacing:'0.12em'}}>{label}</span>
      <div style={{flex:1,height:1,background:C.border}}/>
    </div>
  )
}

// Same visual shape as Drive's own Single/Compare switch — a two/three-way
// pill toggle, copied from house/ui.js's Segmented for the joint-loan
// share-mode picker.
export function Segmented({ options, value, onChange }) {
  return (
    <div style={{display:'inline-flex',background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:C.r,padding:3,gap:2}}>
      {options.map(opt => (
        <button
          key={opt.value} type="button" onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          style={{
            padding:'7px 16px',fontSize:C.xs,fontWeight:700,letterSpacing:'0.06em',
            textTransform:'uppercase',cursor:'pointer',borderRadius:6,border:'none',
            fontFamily:C.fontBody,background:value===opt.value?C.ndtm:'transparent',
            color:value===opt.value?'#fff':C.muted,transition:'all 0.2s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function PercentInput({ id, label, hint, value, onChange, step = '0.01' }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label htmlFor={id} style={{display:'block',fontSize:C.sm,fontWeight:600,color:C.primary,marginBottom:7}}>{label}</label>
      <div style={{position:'relative'}}>
        <input
          id={id} type="text" inputMode="decimal" value={value ?? ''} onChange={onChange}
          placeholder="0" step={step}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            width:'100%',boxSizing:'border-box',background:C.surface,
            border:`1.5px solid ${focused ? C.accent : C.border}`,borderRadius:C.r,
            padding:'11px 32px 11px 12px',color:C.primary,fontSize:C.lg,
            fontFamily:C.fontMono,fontWeight:500,outline:'none',
            boxShadow:focused ? `0 0 0 3px ${C.accentBg}` : 'none',
            transition:'border-color 0.2s, box-shadow 0.2s',
          }}
        />
        <span aria-hidden="true" style={{position:'absolute',right:13,top:'50%',transform:'translateY(-50%)',fontSize:C.sm,fontWeight:600,color:C.faint,pointerEvents:'none'}}>%</span>
      </div>
      {hint && <p style={{marginTop:5,fontSize:C.xs,color:C.muted,lineHeight:1.5}}>{hint}</p>}
    </div>
  )
}

export function MoneyInput({ id, label, hint, value, onChange }) {
  const [focused, setFocused] = useState(false)
  const hintId = hint ? `${id}-hint` : undefined
  // inputMode="numeric" only affects which virtual keyboard a touch
  // device shows — it doesn't block letters from a physical keyboard, so
  // "k"/"m" shorthand still reaches onChange. Actual conversion happens
  // on blur: normalizing on every keystroke was what broke decimals
  // ("1.2m" corrupting into "12m" as the "2" landed on an already-
  // rounded "1"), so the field is left as literal typed text while
  // focused and only reformatted once typing is done.
  const handleBlur = e => {
    setFocused(false)
    e.target.style.borderColor = value ? C.accent : C.border
    e.target.style.boxShadow = 'none'
    const parsed = parseMoneyKM(value)
    if (parsed != null && String(parsed) !== String(value ?? '')) {
      onChange({ target: { value: parsed.toLocaleString('en-SG') } })
    }
  }
  return (
    <div>
      <label htmlFor={id} style={{display:'block',fontSize:C.sm,fontWeight:600,color:C.primary,marginBottom:7}}>{label}</label>
      <div style={{position:'relative'}}>
        <span aria-hidden="true" style={{position:'absolute',left:13,top:'50%',transform:'translateY(-50%)',fontSize:C.sm,fontWeight:600,color:focused||value?C.accent:C.faint,pointerEvents:'none',transition:'color 0.2s'}}>S$</span>
        <input id={id} type="text" inputMode="numeric" value={value} onChange={onChange} placeholder="0"
          aria-describedby={hintId}
          onFocus={e => { setFocused(true); e.target.style.borderColor=C.accent; e.target.style.boxShadow=`0 0 0 3px ${C.accentBg}` }}
          onBlur={handleBlur}
          style={{width:'100%',background:C.surface,border:`1.5px solid ${value?C.accent:C.border}`,borderRadius:C.r,padding:'11px 12px 11px 36px',color:C.primary,fontSize:C.lg,fontFamily:C.fontMono,fontWeight:500,outline:'none',transition:'border-color 0.2s,box-shadow 0.2s'}}/>
      </div>
      {hint && <p id={hintId} style={{marginTop:5,fontSize:C.xs,color:C.muted,lineHeight:1.5}}>{hint}</p>}
    </div>
  )
}

export function StatBox({ label, value, sub, accent, delay=0, visible }) {
  const num = parseInt(String(value).replace(/\D/g,''), 10) || 0
  const animated = useCountUp(visible ? num : 0, 900, delay + 200)
  const [in_, setIn] = useState(false)
  // Reset synchronously during render on the visible->false transition (see
  // "Adjusting state when a prop changes"); the effect only owns the async
  // "fade in after delay" schedule, never a synchronous setState. Uses state
  // (not a ref) to track the previous value, since refs must not be
  // read/written during render.
  const [prevVisible, setPrevVisible] = useState(visible)
  if (prevVisible !== visible) {
    setPrevVisible(visible)
    if (!visible && in_) setIn(false)
  }
  useEffect(() => {
    if (visible) { const t = setTimeout(() => setIn(true), delay); return () => clearTimeout(t) }
  }, [visible, delay])
  const pre = String(value).startsWith('S$') ? 'S$' : ''
  return (
    <div style={{background:accent?C.accentBg:C.bg,border:`1.5px solid ${accent?C.accent:C.border}`,borderRadius:C.r,padding:'14px 16px',opacity:in_?1:0,transform:in_?'translateY(0)':'translateY(8px)',transition:'opacity 0.4s,transform 0.4s'}}>
      <div style={{fontSize:C.xs,fontWeight:700,color:accent?C.accentText:C.muted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{label}</div>
      <div style={{fontSize:C.xl,fontFamily:C.fontMono,fontWeight:500,color:accent?C.accent:C.primary,lineHeight:1,marginBottom:sub?4:0}}>{pre}{animated.toLocaleString('en-SG')}</div>
      {sub && <div style={{fontSize:C.xs,color:C.muted}}>{sub}</div>}
    </div>
  )
}

export function GaugeBar({ ratio, visible }) {
  const pct = Math.min(ratio * 100, 100)
  const color = pct<=30 ? C.accent : pct<=45 ? C.amber : C.red
  const label = pct<=30 ? 'Comfortable' : pct<=45 ? 'Getting stretched' : 'Too high'
  const [w, setW] = useState(0)
  const [prevVisible, setPrevVisible] = useState(visible)
  if (prevVisible !== visible) {
    setPrevVisible(visible)
    if (!visible && w !== 0) setW(0)
  }
  useEffect(() => {
    if (visible) { const t = setTimeout(() => setW(pct), 200); return () => clearTimeout(t) }
  }, [visible, pct])
  return (
    <div style={{marginBottom:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <span style={{fontSize:C.sm,color:C.muted,fontWeight:500}}>Monthly burden on take-home pay</span>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:C.sm,fontFamily:C.fontMono,fontWeight:700,color}}>{pct.toFixed(1)}%</span>
          <span style={{fontSize:C.xs,color,fontWeight:700,background:pct<=30?C.accentBg:pct<=45?C.amberBg:C.redBg,border:`1px solid ${color}55`,borderRadius:100,padding:'2px 10px'}}>{label}</span>
        </div>
      </div>
      <div style={{height:8,background:C.bg,borderRadius:4,overflow:'hidden',position:'relative',border:`1px solid ${C.border}`}}>
        <div style={{position:'absolute',left:'30%',top:0,bottom:0,width:1,background:`${C.accent}60`}}/>
        <div style={{position:'absolute',left:'45%',top:0,bottom:0,width:1,background:`${C.amber}60`}}/>
        <div style={{height:'100%',width:`${w}%`,background:`linear-gradient(90deg,${C.accent} 0%,${C.accent} 30%,${C.amber} 45%,${C.red} 70%)`,borderRadius:4,transition:'width 1.2s cubic-bezier(0.16,1,0.3,1)'}}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:5}}>
        <span style={{fontSize:C.xs,color:C.accent,fontWeight:600}}>Safe ≤ 30%</span>
        <span style={{fontSize:C.xs,color:C.amberText,fontWeight:600}}>Stretch ≤ 45%</span>
        <span style={{fontSize:C.xs,color:C.red,fontWeight:600}}>Too high &gt; 45%</span>
      </div>
    </div>
  )
}
