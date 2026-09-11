'use client'

import { C, SGD } from '@/lib/ledger/theme'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Twelve months of running cash balance for whichever tax-payment plan is
// actually chosen (solid), optionally overlaid with an alternative
// (dashed) — e.g. lump-sum tax vs GIRO, so "switch to this instead" is a
// concrete, visual case rather than a sentence to take on faith. `alt` is
// only passed when there's a genuine alternative worth showing; a plan
// with nothing to compare against just draws the one line.
export default function TroughChart({ primary, alt, events = {}, troughMonth, tone = 'red' }) {
  if (!primary || primary.length === 0) return null

  const primaryColor = tone === 'green' ? C.green : C.red
  const W = 1000, H = 424
  const PAD = { l: 62, r: 20, t: 26, b: 70 }
  const balances = [...primary.map(r => r.balance), ...(alt ? alt.map(r => r.balance) : [])]
  const rawMax = Math.max(...balances, 0)
  const rawMin = Math.min(...balances, 0)
  const yMax = Math.ceil((rawMax * 1.1) / 5000) * 5000 || 5000
  const yMin = Math.floor((rawMin * 1.15) / 2500) * 2500

  const px = i => PAD.l + (i / (MONTHS.length - 1)) * (W - PAD.l - PAD.r)
  const py = v => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b)
  const line = arr => arr.map((v, i) => (i ? 'L' : 'M') + px(i) + ' ' + py(v)).join(' ')

  const gridSteps = []
  for (let v = Math.ceil(yMin / 5000) * 5000; v <= yMax; v += 5000) gridSteps.push(v)
  if (!gridSteps.includes(0) && yMin < 0) gridSteps.push(0)

  const primaryBalances = primary.map(r => r.balance)
  const areaD = line(primaryBalances) + ' L ' + px(11) + ' ' + py(yMin) + ' L ' + px(0) + ' ' + py(yMin) + ' Z'

  return (
    <div style={{ overflowX: 'auto', padding: '4px 4px 4px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', minWidth: 760 }} role="img"
        aria-label={`Line chart of running cash balance over twelve months. Tightest month is ${MONTHS[troughMonth]}.`}>
        <defs>
          <linearGradient id="trough-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={primaryColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridSteps.map(v => (
          <g key={v}>
            <line x1={PAD.l} y1={py(v)} x2={W - PAD.r} y2={py(v)}
              stroke={v === 0 ? C.muted : C.border} strokeWidth={v === 0 ? 1.2 : 1}
              strokeDasharray={v === 0 ? 'none' : '3 4'} />
            <text x={PAD.l - 10} y={py(v) + 3.5} textAnchor="end" style={{ fontFamily: C.fontMono, fontSize: 10.5, fill: C.faint, fontVariantNumeric: 'tabular-nums' }}>
              {v === 0 ? '$0' : `$${v / 1000}k`}
            </text>
          </g>
        ))}

        {yMin < 0 && (
          <rect x={PAD.l} y={py(0)} width={W - PAD.l - PAD.r} height={py(yMin) - py(0)} fill={C.red} opacity={0.07} />
        )}

        {alt && (
          <path d={line(alt.map(r => r.balance))} fill="none" stroke={C.green} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" opacity={0.85} />
        )}
        <path d={areaD} fill="url(#trough-fill)" />
        <path d={line(primaryBalances)} fill="none" stroke={primaryColor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {primary.map((row, i) => {
          const isTrough = i === troughMonth
          const anchor = i === 0 ? 'start' : i === MONTHS.length - 1 ? 'end' : 'middle'
          return (
            <g key={i}>
              <circle cx={px(i)} cy={py(row.balance)} r={isTrough ? 5.5 : 3}
                fill={isTrough ? C.accent : primaryColor}
                stroke={isTrough ? C.ndtm : 'none'} strokeWidth={isTrough ? 2 : 0} />
              <text x={px(i)} y={H - 48} textAnchor="middle" style={{ fontFamily: C.fontMono, fontSize: 10.5, fill: isTrough ? C.accent : C.faint, fontVariantNumeric: 'tabular-nums' }}>
                {MONTHS[i]}
              </text>
              {events[i] && (
                <text x={px(i)} y={i % 2 === 0 ? H - 30 : H - 16} textAnchor={anchor} style={{ fontFamily: C.fontBody, fontSize: 9, fill: C.faint }}>
                  {events[i]}
                </text>
              )}
            </g>
          )
        })}

        <text x={px(troughMonth) + 12} y={py(primary[troughMonth].balance) + 5} style={{
          fontFamily: C.fontBody, fontSize: 12.5, fontWeight: 700, fill: C.accent,
        }}>{SGD(primary[troughMonth].balance)}</text>
      </svg>
    </div>
  )
}
