'use client'

import { useMemo, useRef, useState } from 'react'
import { C, SGD } from '@/lib/ledger/theme'
import { SOURCE } from '@/lib/flow/calc.js'

// Fate colors — the Sankey's semantic palette, separate from the brand
// accent. A getter, not a static snapshot, so it tracks `C` across a mode
// switch (see mutable-theme-token-object.md).
function getFateColor() {
  return { kept: C.green, gone: C.red, invested: C.blue, neutral: C.muted }
}

// Fixed 4-column topology — not a general graph-layout problem, since
// FlowState's flow always has the same shape (earn → split → sit → go).
// Column 3 lists every POSSIBLE destination; buildMonthlyFlow sets a
// node to null when it doesn't apply (no car, no insurance, etc.), and
// this component simply skips nulls rather than needing its own
// presence logic.
const COLUMNS = [
  ['salary', 'employer'],
  ['cpfTotal', 'cashTotal'],
  ['oa', 'sa', 'ma', 'bank'],
  ['oaGrow', 'equity', 'mortgageInterest', 'saLock', 'maHealth', 'maGrow', 'taxNode', 'car', 'insurance', 'living', 'invest', 'surplus'],
]

const COL_HEADS = ['What comes in', 'The split', 'Where it sits', 'Where it goes']

const NODE_W = 13
const GAPS = [56, 40, 30, 20]
const TOP = 46

export default function Sankey({ flow }) {
  const wrapRef = useRef(null)
  const [tooltip, setTooltip] = useState(null) // { x, y, title, body }

  const layout = useMemo(() => buildLayout(flow), [flow])
  if (!layout) return null

  const { width, height, nodes, links, keptTotal, goneTotal, investedTotal, totalComp } = layout
  const FATE_COLOR = getFateColor()

  const showTooltip = (e, title, body) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, title, body })
  }
  const moveTooltip = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || !tooltip) return
    setTooltip(t => t ? { ...t, x: e.clientX - rect.left, y: e.clientY - rect.top } : t)
  }
  const hideTooltip = () => setTooltip(null)

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ overflowX: 'auto', padding: '4px 4px 4px' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', minWidth: 1040 }}
          role="img"
          aria-label={`Sankey diagram of one month's cashflow. ${SGD(keptTotal)} kept, ${SGD(goneTotal)} gone, out of ${SGD(totalComp)} total compensation. Hover any flow to see which tool it came from.`}
        >
          {COL_HEADS.map((h, i) => {
            const x = layout.colX[i]
            const anchor = i === 0 ? 'end' : i === 3 ? 'start' : 'middle'
            const tx = i === 0 ? x - 14 : i === 3 ? x : x + NODE_W / 2
            return (
              <text key={h} x={tx} y={24} textAnchor={anchor} style={{
                fontFamily: C.fontMono, fontSize: 10.5, letterSpacing: '0.1em',
                textTransform: 'uppercase', fill: C.faint,
              }}>{h}</text>
            )
          })}

          <defs>
            {links.map((l, i) => (
              <linearGradient key={i} id={`flow-grad-${i}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={FATE_COLOR[l.sourceFate]} />
                <stop offset="100%" stopColor={FATE_COLOR[l.targetFate]} />
              </linearGradient>
            ))}
          </defs>

          {links.map((l, i) => (
            <path
              key={i} d={l.d} fill={`url(#flow-grad-${i})`}
              style={{ opacity: 0.42, transition: 'opacity 0.18s ease', cursor: 'default' }}
              className="flow-ribbon"
              onMouseEnter={e => showTooltip(e, `${l.fromLabel} → ${l.toLabel}`, SGD(l.value))}
              onMouseMove={moveTooltip}
              onMouseLeave={hideTooltip}
            />
          ))}

          {nodes.map(n => {
            const src = SOURCE[n.source]
            const cy = n.y + n.h / 2
            const right = n.col === 3
            const tx = right ? n.x + NODE_W + 12 : n.x - 12
            const anchor = right ? 'start' : 'end'
            const hasSub = !!n.sub
            return (
              <g
                key={n.key}
                onMouseEnter={e => showTooltip(e, n.label, [
                  SGD(n.value),
                  src ? `from ${src.tool}` : null,
                ].filter(Boolean).join(' · '))}
                onMouseMove={moveTooltip}
                onMouseLeave={hideTooltip}
                style={{ cursor: src?.href ? 'pointer' : 'default' }}
              >
                <rect
                  x={n.x} y={n.y} width={NODE_W} height={n.h} rx={2.5}
                  fill={n.ghost ? 'none' : FATE_COLOR[n.fate]}
                  stroke={n.ghost ? C.muted : 'none'}
                  strokeWidth={n.ghost ? 1.5 : 0}
                  strokeDasharray={n.ghost ? '4 3' : 'none'}
                />
                <text x={tx} y={hasSub ? cy - 4 : cy - 2} textAnchor={anchor} style={{
                  fontFamily: C.fontBody, fontSize: 12, fill: C.text,
                }}>{n.label}</text>
                <text x={tx} y={hasSub ? cy + 9 : cy + 12} textAnchor={anchor} style={{
                  fontFamily: C.fontMono, fontSize: 11.5, fill: C.muted, fontVariantNumeric: 'tabular-nums',
                }}>{SGD(n.value)}</text>
                {hasSub && (
                  <text x={tx} y={cy + 21} textAnchor={anchor} style={{
                    fontFamily: C.fontBody, fontSize: 10.5, fill: C.faint,
                  }}>{n.sub}</text>
                )}
              </g>
            )
          })}

          <text x={layout.colX[3] + NODE_W + 12} y={layout.totalsY} style={{
            fontFamily: C.fontBody, fontSize: 12, fontWeight: 700, fill: C.green,
          }}>Kept  {SGD(keptTotal)}  ·  {totalComp > 0 ? Math.round(keptTotal / totalComp * 100) : 0}%</text>
          {investedTotal > 0 && (
            <text x={layout.colX[3] + NODE_W + 12} y={layout.totalsY + 18} style={{
              fontFamily: C.fontBody, fontSize: 12, fontWeight: 700, fill: C.blue,
            }}>Invested  {SGD(investedTotal)}  ·  {totalComp > 0 ? Math.round(investedTotal / totalComp * 100) : 0}%</text>
          )}
          <text x={layout.colX[3] + NODE_W + 12} y={layout.totalsY + (investedTotal > 0 ? 36 : 18)} style={{
            fontFamily: C.fontBody, fontSize: 12, fontWeight: 700, fill: C.red,
          }}>Gone  {SGD(goneTotal)}  ·  {totalComp > 0 ? Math.round(goneTotal / totalComp * 100) : 0}%</text>
        </svg>
      </div>

      {tooltip && (
        <div
          style={{
            position: 'absolute', left: tooltip.x + 14, top: tooltip.y + 10,
            background: C.ndtm, border: `1px solid ${C.border}`, borderRadius: C.r,
            padding: '8px 11px', pointerEvents: 'none', zIndex: 10,
            boxShadow: C.shadowMd, maxWidth: 240,
          }}
        >
          <div style={{ fontFamily: C.fontBody, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>{tooltip.title}</div>
          <div style={{ fontFamily: C.fontMono, fontSize: 11, color: C.muted }}>{tooltip.body}</div>
        </div>
      )}
    </div>
  )
}

const NODE_LABELS = {
  oaGrow: 'Your OA grows', equity: 'Into your equity', mortgageInterest: 'Mortgage interest',
  saLock: 'SA — locked away', maHealth: 'Health insurance', maGrow: 'MediSave grows',
  taxNode: 'Income tax', car: 'Car loan', insurance: 'Life & CI cover',
  living: 'Living expenses', invest: 'Invested', surplus: 'Cash left over',
}

function buildLayout(flow) {
  if (!flow || !flow.nodes) return null
  const TOTAL = flow.nodes.salary.value + flow.nodes.employer.value
  if (TOTAL <= 0) return null

  const colX = [168, 452, 716, 980]
  const SCALE = 540 / TOTAL

  const order = COLUMNS.map(col => col.filter(key => flow.nodes[key] && flow.nodes[key].value > 0))
  const colH = ci => TOTAL * SCALE + Math.max(0, order[ci].length - 1) * GAPS[ci]
  const tallest = Math.max(...order.map((_, ci) => colH(ci)))

  const laid = {}
  order.forEach((col, ci) => {
    let y = TOP + (tallest - colH(ci)) / 2
    col.forEach(key => {
      const n = flow.nodes[key]
      const h = Math.max(n.value * SCALE, 3)
      laid[key] = { key, x: colX[ci], y, h, col: ci, outY: y, inY: y, ...n, label: n.label || NODE_LABELS[key] }
      y += h + GAPS[ci]
    })
  })

  const links = []
  flow.links.forEach(l => {
    const s = laid[l.from], t = laid[l.to]
    if (!s || !t || l.value <= 0) return
    const th = l.value * SCALE
    const x0 = s.x + NODE_W, x1 = t.x
    const y0 = s.outY, y1 = t.inY
    s.outY += th
    t.inY += th
    const xm = (x0 + x1) / 2
    const d = [
      'M', x0, y0,
      'C', xm, y0, xm, y1, x1, y1,
      'L', x1, y1 + th,
      'C', xm, y1 + th, xm, y0 + th, x0, y0 + th,
      'Z',
    ].join(' ')
    links.push({ d, value: l.value, sourceFate: s.fate, targetFate: t.fate, fromLabel: s.label, toLabel: t.label })
  })

  const nodes = Object.values(laid)
  const bottom = Math.max(...nodes.map(n => n.y + n.h))
  const terminal = nodes.filter(n => n.col === 3)
  const sumFate = fate => terminal.filter(n => n.fate === fate).reduce((s, n) => s + n.value, 0)
  const keptTotal = sumFate('kept')
  const goneTotal = sumFate('gone')
  const investedTotal = sumFate('invested')

  return {
    width: 1280, height: bottom + 100,
    colX, nodes, links,
    keptTotal, goneTotal, investedTotal,
    totalComp: TOTAL,
    totalsY: bottom + 30,
  }
}
