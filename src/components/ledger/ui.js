'use client'

import { useState } from 'react'
import { C, parseMoney } from '@/lib/ledger/theme'

export function SectionDivider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 18px' }}>
      <span style={{ fontSize: C.xs, fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  )
}

export function MoneyInput({ id, label, hint, value, onChange, placeholder = '0' }) {
  const [focused, setFocused] = useState(false)
  const hintId = hint ? `${id}-hint` : undefined
  // On blur, normalize "7k"/"1.2m" shorthand into a plain number so
  // there's visible confirmation it was understood — while focused the
  // raw text is left alone so mid-typed decimals ("1." before the "2")
  // are never silently rounded away.
  const handleBlur = () => {
    setFocused(false)
    const parsed = parseMoney(value)
    if (parsed && String(parsed) !== String(value ?? '')) {
      onChange({ target: { value: String(parsed) } })
    }
  }
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: C.sm, fontWeight: 600, color: C.primary, marginBottom: 7 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <span aria-hidden="true" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: C.sm, fontWeight: 600, color: focused || value ? C.accent : C.faint, pointerEvents: 'none', transition: 'color 0.2s' }}>S$</span>
        <input
          id={id} type="text" inputMode="text" value={value ?? ''} onChange={onChange}
          placeholder={placeholder} aria-describedby={hintId}
          onFocus={() => setFocused(true)} onBlur={handleBlur}
          style={{
            width: '100%', boxSizing: 'border-box', background: C.surface,
            border: `1.5px solid ${focused ? C.accent : C.borderControl}`, borderRadius: C.r,
            padding: '11px 12px 11px 36px', color: C.primary, fontSize: C.lg,
            fontFamily: C.fontMono, fontWeight: 500, outline: 'none',
            boxShadow: focused ? `0 0 0 3px ${C.accentBg}` : 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
        />
      </div>
      {hint && <p id={hintId} style={{ marginTop: 5, fontSize: C.xs, color: C.muted, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
}

export function PercentInput({ id, label, hint, value, onChange, step = '0.01' }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: C.sm, fontWeight: 600, color: C.primary, marginBottom: 7 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id} type="text" inputMode="decimal" value={value ?? ''} onChange={onChange}
          placeholder="0.00" step={step}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            width: '100%', boxSizing: 'border-box', background: C.surface,
            border: `1.5px solid ${focused ? C.accent : C.borderControl}`, borderRadius: C.r,
            padding: '11px 32px 11px 12px', color: C.primary, fontSize: C.lg,
            fontFamily: C.fontMono, fontWeight: 500, outline: 'none',
            boxShadow: focused ? `0 0 0 3px ${C.accentBg}` : 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
        />
        <span aria-hidden="true" style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', fontSize: C.sm, fontWeight: 600, color: C.faint, pointerEvents: 'none' }}>%</span>
      </div>
      {hint && <p style={{ marginTop: 5, fontSize: C.xs, color: C.muted, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
}

export function NumberInput({ id, label, hint, value, onChange, suffix }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: C.sm, fontWeight: 600, color: C.primary, marginBottom: 7 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id} type="text" inputMode="decimal" value={value ?? ''} onChange={onChange}
          placeholder="0"
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            width: '100%', boxSizing: 'border-box', background: C.surface,
            border: `1.5px solid ${focused ? C.accent : C.borderControl}`, borderRadius: C.r,
            padding: suffix ? '11px 40px 11px 12px' : '11px 12px', color: C.primary, fontSize: C.lg,
            fontFamily: C.fontMono, fontWeight: 500, outline: 'none',
            boxShadow: focused ? `0 0 0 3px ${C.accentBg}` : 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
        />
        {suffix && <span aria-hidden="true" style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', fontSize: C.sm, fontWeight: 600, color: C.faint, pointerEvents: 'none' }}>{suffix}</span>}
      </div>
      {hint && <p style={{ marginTop: 5, fontSize: C.xs, color: C.muted, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
}

// Plain text field — used for ISO dates on the sale-input group, where
// the money/percent/number decorations would get in the way.
export function TextInput({ id, label, hint, value, onChange, placeholder }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: C.sm, fontWeight: 600, color: C.primary, marginBottom: 7 }}>{label}</label>
      <input
        id={id} type="text" value={value ?? ''} onChange={onChange} placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: '100%', boxSizing: 'border-box', background: C.surface,
          border: `1.5px solid ${focused ? C.accent : C.borderControl}`, borderRadius: C.r,
          padding: '11px 12px', color: C.primary, fontSize: C.base,
          fontFamily: C.fontMono, fontWeight: 500, outline: 'none',
          boxShadow: focused ? `0 0 0 3px ${C.accentBg}` : 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      />
      {hint && <p style={{ marginTop: 5, fontSize: C.xs, color: C.muted, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
}

// Native select styled to match the input row.
export function SelectInput({ id, label, value, onChange, options }) {
  return (
    <div>
      {label && <label htmlFor={id} style={{ display: 'block', fontSize: C.sm, fontWeight: 600, color: C.primary, marginBottom: 7 }}>{label}</label>}
      <select
        id={id} value={value} onChange={onChange}
        style={{
          width: '100%', boxSizing: 'border-box', background: C.surface,
          border: `1.5px solid ${C.border}`, borderRadius: C.r,
          padding: '11px 12px', color: C.primary, fontSize: C.base,
          fontFamily: C.fontBody, fontWeight: 500, outline: 'none',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// The enough / tight / short verdict pill.
// Token NAMES, resolved against `C` at render — `C` is mutated in place on
// a light/dark switch, so storing the hex here would freeze one mode's
// palette into every verdict pill.
const CHIP = {
  'comfortably enough': { bg: 'greenBg', fg: 'greenText', label: 'Comfortably enough' },
  tight: { bg: 'amberBg', fg: 'amberText', label: 'Tight' },
  short: { bg: 'redBg', fg: 'redText', label: 'Short' },
  'no-reference': { bg: 'accentBg', fg: 'muted', label: 'Set a monthly spend to see a verdict' },
}
export function VerdictChip({ read }) {
  const c = CHIP[read] || CHIP['no-reference']
  return (
    <span style={{ display: 'inline-block', background: C[c.bg], color: C[c.fg], fontSize: C.xs, fontWeight: 700, padding: '4px 10px', borderRadius: C.r }}>
      {c.label}
    </span>
  )
}

// Pill toggle for a boolean setting (e.g. "I have a mortgage") — used by
// the Capacity module, which has several of them.
export function Toggle({ active, onClick, children }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px',
        background: active ? C.accentBg : C.bg, border: `1.5px solid ${active ? C.accent : C.border}`,
        borderRadius: 100, cursor: 'pointer', fontSize: C.xs, fontWeight: 700,
        color: active ? C.accent : C.muted, fontFamily: C.fontBody,
      }}
    >
      {active ? '✓ ' : ''}{children}
    </button>
  )
}

// Two/three-way pill toggle — same visual shape used across the other tools.
export function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', background: C.surface, border: `1.5px solid ${C.borderControl}`, borderRadius: C.r, padding: 3, gap: 2 }}>
      {options.map(opt => (
        <button
          key={opt.value} type="button" onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          style={{
            padding: '7px 16px', minHeight: 38, fontSize: C.xs, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', cursor: 'pointer', borderRadius: 6, border: 'none',
            fontFamily: C.fontBody, background: value === opt.value ? C.ndtm : 'transparent',
            color: value === opt.value ? '#fff' : C.muted, transition: 'all 0.2s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
