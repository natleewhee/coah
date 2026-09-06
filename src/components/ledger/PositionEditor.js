'use client'

// "Your current position" — a direct snapshot of what you have today so
// the what-if paths are measured against something real, without needing
// to have run RetireWell / HouseMuch / DriveReady first. Blank fields
// fall back to whatever those tools last synced (shown as a hint), then
// to zero. Local to the planner — editing here does not change what the
// other tools have saved.

import { C } from '@/lib/ledger/theme'
import { MoneyInput, PercentInput, NumberInput } from './ui'

function Group({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: C.xs, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>{children}</div>
    </div>
  )
}

export default function PositionEditor({ position, onChange, synced }) {
  const set = (k) => (e) => onChange({ ...position, [k]: e.target.value })
  // A "synced from …" hint when the store has a value and the user has
  // not typed over it.
  const hint = (k, label) => (synced?.[k] && !position[k] ? `Synced: S$${Number(synced[k]).toLocaleString('en-SG')} — ${label}` : undefined)
  const pctHint = (k, label) => (synced?.[k] && !position[k] ? `Synced ${synced[k]} — ${label}` : undefined)

  return (
    <div>
      <Group title="Cash & investments">
        <MoneyInput id="pos-cash" label="Cash / savings" value={position.cash} onChange={set('cash')} />
        <MoneyInput id="pos-inv" label="Investments / stocks" value={position.investments} onChange={set('investments')} hint={hint('investments', 'RetireWell + WhatETF')} />
      </Group>

      <Group title="CPF balances">
        <MoneyInput id="pos-oa" label="Ordinary Account" value={position.cpfOa} onChange={set('cpfOa')} hint={hint('cpfOa', 'RetireWell')} />
        <MoneyInput id="pos-sa" label="Special Account" value={position.cpfSa} onChange={set('cpfSa')} hint={hint('cpfSa', 'RetireWell')} />
        <MoneyInput id="pos-ma" label="MediSave" value={position.cpfMa} onChange={set('cpfMa')} hint={hint('cpfMa', 'RetireWell')} />
      </Group>

      <Group title="Property">
        <MoneyInput id="pos-pv" label="Current value" value={position.propertyValue} onChange={set('propertyValue')} hint={hint('propertyValue', 'HouseMuch')} />
        <MoneyInput id="pos-mb" label="Mortgage balance" value={position.mortgageBalance} onChange={set('mortgageBalance')} hint={hint('mortgageBalance', 'HouseMuch')} />
        <PercentInput id="pos-mr" label="Mortgage rate" value={position.mortgageRate} onChange={set('mortgageRate')} hint={pctHint('mortgageRate', 'HouseMuch')} />
        <NumberInput id="pos-my" label="Years left" suffix="yr" value={position.mortgageYearsLeft} onChange={set('mortgageYearsLeft')} hint={pctHint('mortgageYearsLeft', 'HouseMuch')} />
        <PercentInput id="pos-mortgage-share" label="Your share, if joint" value={position.mortgageSharePct} onChange={set('mortgageSharePct')} hint="Blank = 100% yours. Only affects the TDSR figure below — HouseMuch's own joint-loan support (income-weighted or manual) is the fuller version of this." />
      </Group>

      <Group title="Car & other loans">
        <MoneyInput id="pos-cv" label="Car value" value={position.carValue} onChange={set('carValue')} hint={hint('carValue', 'DriveReady')} />
        <MoneyInput id="pos-lm" label="Loan payments / mo" value={position.loansMonthly} onChange={set('loansMonthly')} hint={hint('loansMonthly', 'DriveReady — car, personal')} />
        <NumberInput id="pos-ly" label="Years until paid off" suffix="yr" value={position.loansYearsLeft} onChange={set('loansYearsLeft')} hint={pctHint('loansYearsLeft', 'DriveReady')} />
        <PercentInput id="pos-car-share" label="Your share, if joint" value={position.carSharePct} onChange={set('carSharePct')} hint="Blank = 100% yours. Only affects the TDSR figure below." />
      </Group>

      <p style={{ fontSize: C.xs, color: C.faint, lineHeight: 1.5, margin: 0 }}>
        Property, car value and loan payments feed the net-worth line and the asset mix. When a loan finishes, that payment is assumed to go into investments.
      </p>
    </div>
  )
}
