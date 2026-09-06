'use client'

// src/app/drive/data-status/page.js
//
// "Is the live COE data actually working, and how fresh are car prices?"
// — one page that answers both plainly.
//
// COE premiums are fetched live, per request, from data.gov.sg's public
// mirror of LTA's own dataset — no API key involved, so there is nothing
// secret to withhold here. This page calls that route directly and
// reports its `status`/`reason` code verbatim.
//
// Car prices are NOT fetched live per request — DriveReady used to do
// that (a server-side fetch of LTA's Car Cost Update PDF on every visit),
// but onemotoring.lta.gov.sg reliably blocked that kind of traffic (no
// browser-like headers, a shared serverless IP range) and it never
// actually worked in production. Prices now come from the catalog route,
// refreshed weekly by .github/workflows/refresh-data.yml running the same
// PDF parser from a GitHub Actions runner instead — this page reports
// that catalog's source and freshness rather than a live/dead verdict.

import { useEffect, useState } from 'react'
import ShellHeader from '@/components/shared/ShellHeader'
import { COE_FALLBACK, COE_FALLBACK_AS_OF } from '@/lib/drive/calc'
import { COE_ENDPOINT, CAR_CATALOG_ENDPOINT } from '@/lib/drive/endpoints'
import { C } from '@/lib/drive/theme'

// The site is permanently dark (see the header comment in globals.css —
// :root[data-theme='light'] is an exact copy of the dark values, so there is
// no light mode to degrade into). Colors come from the Drive palette rather
// than fresh literals so this page can't drift out of sync with the rest of
// the vertical, and so the small 12-13px label text keeps enough contrast.
const OK = C.greenText
const WARN = C.amberText
const BAD = C.redText
const LINE = C.border
const SUB = C.muted

function fmtSGD(n) {
  return typeof n === 'number' ? `S$${n.toLocaleString('en-SG')}` : '—'
}

function fmtWhen(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-SG', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore',
    })
  } catch {
    return iso
  }
}

// Each status/reason code gets a verdict tone plus the actual next action,
// so the page says what to DO, not just that something is broken.
const COE_STATES = {
  live:           { tone: OK,   label: 'Working',        fix: null },
  upstream_error: { tone: WARN, label: 'data.gov.sg error', fix: 'data.gov.sg returned an unexpected status or marked the request unsuccessful. Usually transient — retry shortly.' },
  no_results:     { tone: WARN, label: 'No Cat A/B rows',fix: 'The dataset responded, but no row paired into a full Cat A/Cat B bidding exercise within the rows requested.' },
  stale_data:     { tone: WARN, label: 'Stale sort?',    fix: 'The newest row found looks implausibly old, which usually means the sort parameter isn\'t being honoured — check the note above for the exact month found.' },
  network_error:  { tone: BAD,  label: 'Unreachable',    fix: 'Could not reach data.gov.sg at all. Check outbound network access from your deployment.' },
}

const CATALOG_STATES = {
  supabase:     { tone: OK,   label: 'Supabase',       fix: null },
  'bundled-json': { tone: OK, label: 'Bundled snapshot', fix: null },
  unknown:      { tone: BAD,  label: 'Failed',          fix: 'The catalog route did not return a recognised source — check /drive/api/car-catalog directly.' },
}

const STALE_CATALOG_AFTER_DAYS = 14 // refreshed weekly; two missed cycles is worth flagging

function Dot({ tone }) {
  return (
    <span aria-hidden="true" style={{
      display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
      background: tone, marginRight: 8, flexShrink: 0,
    }} />
  )
}

function Card({ title, subtitle, tone, verdict, children }) {
  return (
    <section style={{ border: `1px solid ${LINE}`, borderRadius: 4, padding: '20px 22px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ fontFamily: 'var(--l-font-display)', fontWeight: 600, fontSize: 17, margin: 0 }}>{title}</h2>
        <span style={{ display: 'flex', alignItems: 'center', fontFamily: 'var(--l-font-mono)', fontSize: 12, fontWeight: 700, color: tone }}>
          <Dot tone={tone} />{verdict}
        </span>
      </div>
      <p style={{ fontSize: 12.5, color: SUB, margin: '0 0 14px' }}>{subtitle}</p>
      {children}
    </section>
  )
}

function Row({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderTop: `1px solid ${LINE}`, fontSize: 13 }}>
      <span style={{ color: SUB }}>{label}</span>
      <span style={{ fontFamily: mono ? 'var(--l-font-mono)' : undefined, fontWeight: mono ? 700 : 400, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function FixNote({ text }) {
  if (!text) return null
  return (
    <p style={{
      fontSize: 12.5, lineHeight: 1.55, color: C.text, background: C.surface,
      border: `1px solid ${LINE}`, borderRadius: 4, padding: '10px 12px', margin: '14px 0 0',
    }}>
      <strong style={{ fontFamily: 'var(--l-font-mono)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: SUB, display: 'block', marginBottom: 4 }}>What to do</strong>
      {text}
    </p>
  )
}

export default function DataStatusPage() {
  const [coe, setCoe] = useState(null)
  const [cars, setCars] = useState(null)
  const [tick, setTick] = useState(0)

  // Derived, not stored — "still loading" is exactly "no result yet", so
  // there's no separate flag to set synchronously inside the effect. The
  // re-check button clears both results in its own handler, which puts this
  // back to true without an effect-body setState.
  const loading = coe === null || cars === null

  useEffect(() => {
    let cancelled = false

    // Both routes return a JSON body on every path, including their error
    // paths — so a non-2xx is still parsed rather than thrown away. That is
    // the whole point: the error body is the diagnosis.
    const grab = (url) =>
      fetch(url, { cache: 'no-store' })
        .then(r => r.json().catch(() => ({ status: 'network_error', reason: 'network_error', detail: `Non-JSON response (HTTP ${r.status})` })))
        .catch(err => ({ status: 'network_error', reason: 'network_error', detail: `Request failed: ${err.message}` }))

    Promise.all([grab(COE_ENDPOINT), grab(CAR_CATALOG_ENDPOINT)]).then(([c, k]) => {
      if (cancelled) return
      setCoe(c)
      setCars(k)
    })

    return () => { cancelled = true }
  }, [tick])

  const coeState = COE_STATES[coe?.status] ?? COE_STATES.network_error
  let carsState = CATALOG_STATES[cars?.source] ?? CATALOG_STATES.unknown
  // Measured against the response's own `checkedAt` (server-generated at
  // fetch time), not Date.now() — calling that impure function directly
  // during render is a React purity violation, and there's no reason to
  // when the fetch already carries a timestamp precise enough for a
  // days-old count.
  const carsStaleDays = (cars?.updatedAt && cars?.checkedAt)
    ? Math.floor((new Date(cars.checkedAt).getTime() - new Date(cars.updatedAt).getTime()) / 86400000)
    : null
  if (carsState.tone === OK && carsStaleDays !== null && carsStaleDays > STALE_CATALOG_AFTER_DAYS) {
    carsState = {
      tone: WARN,
      label: 'Stale',
      fix: `Car prices are ${carsStaleDays} days old — the weekly refresh (.github/workflows/refresh-data.yml) should keep this under ~7. Check whether its auto-merge is going through: github.com/natleewhee/natdtm/pulls?q=is:pr+refresh+car`,
    }
  }

  return (
    <>
      <ShellHeader title="Data status" breadcrumb="Drive" backHref="/drive" />
      <div className="shell-wrap" style={{ padding: '40px 24px 72px', maxWidth: 760 }}>
        <p style={{
          fontFamily: 'var(--l-font-mono)', fontSize: 11, letterSpacing: '.12em',
          textTransform: 'uppercase', color: SUB, margin: '0 0 12px',
        }}>
          LTA data health
        </p>
        <h1 style={{
          fontFamily: 'var(--l-font-display)', fontWeight: 600, fontSize: 'clamp(24px,3.2vw,32px)',
          lineHeight: 1.15, margin: '0 0 12px',
        }}>
          Is the data feeding into the calculator fresh?
        </h1>
        <p style={{ color: SUB, fontSize: 14.5, lineHeight: 1.6, margin: '0 0 28px', maxWidth: '62ch' }}>
          COE premiums are fetched live on every visit; car prices are refreshed weekly instead of
          live per request (see why in the card below) and fall back to hardcoded COE constants or
          the bundled price snapshot when needed. That is good for visitors but hides breakage, so
          this page calls both routes directly and reports exactly what came back. Neither feed
          needs an API key, so there is nothing secret to withhold here.
        </p>

        {loading && <p style={{ fontSize: 14, color: SUB }}>Checking both feeds…</p>}

        {!loading && (
          <>
            <Card
              title="COE premiums — data.gov.sg"
              subtitle="LTA's own COE Bidding Results dataset, mirrored by data.gov.sg — no API key needed. Powers the live Cat A / Cat B premiums used in every calculation."
              tone={coeState.tone}
              verdict={coeState.label}
            >
              {coe?.httpStatus && <Row label="HTTP status from data.gov.sg" value={coe.httpStatus} mono />}
              {coe?.status === 'live' ? (
                <>
                  <Row label="Cat A premium" value={fmtSGD(coe.catA?.premium)} mono />
                  <Row label="Cat B premium" value={fmtSGD(coe.catB?.premium)} mono />
                  <Row label="Bidding exercise" value={`${coe.month} · round ${coe.biddingNo}`} mono />
                </>
              ) : (
                <>
                  <Row label="Falling back to" value={`Cat A ${fmtSGD(COE_FALLBACK.catA)} · Cat B ${fmtSGD(COE_FALLBACK.catB)}`} mono />
                  <Row label="Fallback last updated" value={COE_FALLBACK_AS_OF} mono />
                </>
              )}
              <Row label="Checked" value={fmtWhen(coe?.checkedAt)} />
              {coe?.detail && <p style={{ fontSize: 12.5, color: SUB, margin: '12px 0 0', lineHeight: 1.55 }}>{coe.detail}</p>}
              <FixNote text={coeState.fix} />
            </Card>

            <Card
              title="Car prices — weekly catalog refresh"
              subtitle="Refreshed weekly from LTA's Car Cost Update PDF by a GitHub Actions job, not fetched live per request (that reliably got blocked by onemotoring.lta.gov.sg). Powers the official selling prices per model."
              tone={carsState.tone}
              verdict={carsState.label}
            >
              <Row label="Source" value={cars?.source === 'supabase' ? 'Supabase' : 'Bundled snapshot (cars.json)'} mono />
              <Row label="Prices as of" value={fmtWhen(cars?.updatedAt)} />
              {carsStaleDays !== null && <Row label="Age" value={`${carsStaleDays} day${carsStaleDays !== 1 ? 's' : ''}`} mono />}
              <Row label="Checked" value={fmtWhen(cars?.checkedAt)} />
              {cars?.detail && <p style={{ fontSize: 12.5, color: SUB, margin: '12px 0 0', lineHeight: 1.55 }}>{cars.detail}</p>}
              <FixNote text={carsState.fix} />
            </Card>

            <button
              type="button"
              onClick={() => { setCoe(null); setCars(null); setTick(t => t + 1) }}
              style={{
                fontFamily: 'var(--l-font-mono)', fontSize: 12, letterSpacing: '.06em',
                textTransform: 'uppercase', padding: '10px 18px', borderRadius: 4,
                border: `1px solid ${LINE}`, background: C.surface, color: C.text, cursor: 'pointer',
              }}
            >
              Re-check now
            </button>
          </>
        )}
      </div>
    </>
  )
}
