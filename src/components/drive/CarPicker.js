'use client'

import { useState, useRef, useEffect } from 'react'
import { C, SGD, RATE_TIERS, brandTier, parseMoneyKM } from '@/lib/drive/theme'
import { calcPriceGap, minDownFor } from '@/lib/drive/calc'

// Common SG car-shopping shorthand that doesn't literally appear in our
// `type` strings (e.g. cars are tagged "Electric SUV", not "EV SUV") — map
// it onto the word that actually matches. Scoped to whole-word matches
// against `type` only (not `name`), since "ev" as a raw substring would
// also match model names like Honda's "e:HEV" or Toyota's "...HEV" —
// hybrids, not EVs.
const TYPE_SYNONYMS = { ev: 'electric', electric: 'ev' }
// "ev" specifically is excluded from the general name/type substring
// fallback below — as a bare 2-letter string it's a substring of "HEV" in
// half the hybrid model names (Honda's "e:HEV" cars, Toyota's "...HEV"
// cars), which would wrongly surface hybrids in an EV search. Routed
// through the type-word whole-word check only.
function matchesQuery(car, q) {
  const type = car.type.toLowerCase()
  const typeWords = type.split(/[^a-z0-9]+/)
  const synonym = TYPE_SYNONYMS[q]
  if (synonym) return typeWords.includes(q) || typeWords.includes(synonym)
  if (car.name.toLowerCase().includes(q) || (car.coe || '').toLowerCase().includes(q)) return true
  return typeWords.includes(q) || type.includes(q)
}

function hlMatch(text, query) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return <span>{text.slice(0,idx)}<mark style={{background:C.accentBg,color:C.accent,borderRadius:2,padding:'0 1px'}}>{text.slice(idx,idx+query.length)}</mark>{text.slice(idx+query.length)}</span>
}

export function CarPicker({ value, onChange, slot, ceiling, down, allCars = [], top5Cars = [], customPrice = '', onCustomPrice, coeData }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [hiIdx, setHiIdx] = useState(-1)
  const [budgetFilter, setBudgetFilter] = useState(false)
  const inputRef = useRef(null)
  const wrapRef = useRef(null)

  // priceText holds the literal typed text for the dealer-quote field,
  // separate from the committed customPrice prop — reformatting on every
  // keystroke (the previous approach) corrupted decimals, converting
  // "1." to "1" the instant it's typed so a "2" typed next landed on the
  // already-rounded "1" instead of "1.", turning "1.2m" into "12m".
  // Only reformats to a clean number on blur, once typing is done; stays
  // in sync with customPrice when it changes from outside (e.g. cleared,
  // or restored from a saved scenario).
  const [priceText, setPriceText] = useState(customPrice)
  // Only re-sync from an EXTERNAL change to customPrice (car swapped,
  // cleared elsewhere) — not from the prop update our own commitPrice
  // just caused, which would otherwise immediately overwrite mid-typed
  // text like "1.2" with the already-rounded "1" it committed.
  useEffect(() => {
    const parsed = parseMoneyKM(priceText)
    if (parsed != null && String(parsed) === String(customPrice)) return
    setPriceText(customPrice)
    // priceText intentionally omitted: this effect reacts to customPrice
    // changing, and re-reads priceText fresh each time via the closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customPrice])
  // Committed to the parent (and the live price-gap preview below) on
  // every keystroke — not just blur — since that preview is the whole
  // point of this field. Safe to do live because the sync effect above
  // recognizes its own commits and leaves mid-typed text alone.
  const commitPrice = (text) => {
    setPriceText(text)
    const parsed = parseMoneyKM(text)
    onCustomPrice && onCustomPrice(parsed != null ? String(parsed) : '')
  }
  const blurPrice = () => {
    const parsed = parseMoneyKM(priceText)
    if (parsed != null) setPriceText(parsed.toLocaleString('en-SG'))
  }
  const slotCol = slot === 'A' ? C.ndtm : C.blue
  const hasCeiling = ceiling && (ceiling.catA > 0 || ceiling.catB > 0)
  const budgetCars = hasCeiling ? allCars.filter(car => {
    const cap = car.coe === 'Cat A' ? ceiling.catA : ceiling.catB
    const minDown = minDownFor(car.price, car.loanCap)
    return car.price <= cap && (down||0) >= minDown
  }).sort((a,b) => { if (a.top5 && !b.top5) return -1; if (!a.top5 && b.top5) return 1; if (a.top5&&b.top5) return a.rank-b.rank; return b.price-a.price }).slice(0,5) : []
  const showBudget = budgetFilter && hasCeiling
  const listCars = showBudget ? budgetCars : top5Cars
  // Sort matches by popularity BEFORE slicing — previously this filtered
  // then sliced(0,8) in raw JSON order, so a popular model past index 8
  // (e.g. a best-selling SUV) never surfaced. Best-sellers (top5, by sales
  // rank) lead; everything else stays in curated stored order (Array.sort
  // is stable). The dropdown now scrolls, so the cap is higher.
  const q = query.trim().toLowerCase()
  // Tesla is a mainstream brand tier (2) generally — it shouldn't outrank
  // Toyota/Honda in a bare "sedan"/"SUV" search. But for a search that's
  // specifically about EVs, Tesla is the brand most people mean by
  // "electric car" even though it isn't SG's highest-volume EV seller —
  // boost it to the front of that specific search only.
  const isEVQuery = q === 'ev' || q === 'electric'
  const filtered = q.length === 0 ? [] : allCars.filter(c => matchesQuery(c, q)
  ).sort((a, b) => {
    // Tagged best-sellers first (by sales rank), then a coarse brand-
    // popularity tier, then cheapest first — so the long tail orders
    // sensibly instead of alphabetically.
    if (a.top5 && b.top5) return a.rank - b.rank
    if (a.top5) return -1
    if (b.top5) return 1
    if (isEVQuery) {
      const aTesla = a.name.startsWith('Tesla'), bTesla = b.name.startsWith('Tesla')
      if (aTesla !== bTesla) return aTesla ? -1 : 1
    }
    const ta = brandTier(a.name), tb = brandTier(b.name)
    if (ta !== tb) return ta - tb
    return a.price - b.price
  }).slice(0, 20)
  const showDrop = focused && query.trim().length > 0
  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setFocused(false); setQuery('') } }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const select = car => { onChange(car); setQuery(''); setFocused(false); setHiIdx(-1) }
  const handleKey = e => {
    if (!showDrop) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHiIdx(i => Math.min(i+1, filtered.length-1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHiIdx(i => Math.max(i-1, 0)) }
    if (e.key === 'Enter' && hiIdx >= 0) select(filtered[hiIdx])
    if (e.key === 'Escape') { setFocused(false); setQuery('') }
  }
  return (
    <div ref={wrapRef}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
        <span style={{background:slotCol,color:'#fff',fontSize:10,fontWeight:700,borderRadius:4,padding:'2px 8px',fontFamily:C.fontMono,letterSpacing:'0.1em'}}>{slot}</span>
        <span style={{fontSize:C.sm,fontWeight:600,color:C.primary}}>Select a car</span>
      </div>
      {!value && (
        <p style={{fontSize:C.xs,color:C.faint,marginBottom:12,lineHeight:1.5}}>
          Already have a dealer quote? Pick the closest match below, then edit its price to match — that gives you the most accurate numbers.
        </p>
      )}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <div style={{fontSize:C.xs,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.1em'}}>
          {showBudget ? `🎯 Within your budget · ${budgetCars.length} car${budgetCars.length!==1?'s':''}` : '🏅 Top 5 best-sellers 2025'}
        </div>
        {hasCeiling && (
          <button type="button" onClick={() => setBudgetFilter(v => !v)} aria-pressed={showBudget}
            style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',background:showBudget?C.accentBg:C.bg,border:`1.5px solid ${showBudget?C.accent:C.border}`,borderRadius:100,cursor:'pointer',transition:'all 0.2s',fontSize:C.xs,fontWeight:700,color:showBudget?C.accent:C.muted,fontFamily:C.fontBody}}>
            {showBudget?'✓ ':''} Within my budget
          </button>
        )}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:14}}>
        {listCars.length === 0
          ? <div style={{padding:'16px',textAlign:'center',background:C.bg,borderRadius:C.r,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:C.sm,color:C.muted}}>No cars fit within your current budget.</div>
              <div style={{fontSize:C.xs,color:C.faint,marginTop:4}}>Try a higher downpayment or search below.</div>
            </div>
          : listCars.map(car => {
              const t = RATE_TIERS.find(r => r.id === car.rateTier)
              const sel = value?.id === car.id
              return (
                <button key={car.id} type="button" onClick={() => select(car)} className={`top5-btn${sel?' sel':''}`}
                  aria-pressed={sel}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:sel?C.accentBg:C.bg,border:`1.5px solid ${sel?C.accent:C.border}`,borderRadius:C.r,cursor:'pointer',textAlign:'left',width:'100%'}}>
                  {car.top5
                    ? <span style={{fontSize:C.xs,fontFamily:C.fontMono,fontWeight:700,color:C.accent,minWidth:22,textAlign:'center'}}>#{car.rank}</span>
                    : <span style={{fontSize:C.xs,fontFamily:C.fontMono,fontWeight:700,color:C.faint,minWidth:22,textAlign:'center'}}></span>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:C.sm,fontWeight:700,color:sel?C.primary:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{car.name}</div>
                    <div style={{fontSize:C.xs,color:C.muted,marginTop:1}}>{car.type}</div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                    <span style={{fontSize:C.sm,fontFamily:C.fontMono,fontWeight:700,color:sel?C.primary:C.muted}}>{SGD(car.price)}</span>
                    <span style={{fontSize:C.xs,fontWeight:700,color:t.color,background:t.bg,border:`1px solid ${t.color}44`,borderRadius:100,padding:'2px 7px'}}>{t.display}</span>
                    {sel && <div style={{width:6,height:6,borderRadius:'50%',background:C.accent,boxShadow:`0 0 0 2px ${C.accentBg}`}}/>}
                  </div>
                </button>
              )
            })}
      </div>
      <div>
        <div style={{fontSize:C.xs,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>Search all 100+ models</div>
        <div style={{position:'relative'}}>
          <span aria-hidden="true" style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:12,pointerEvents:'none',color:C.faint,fontWeight:600}}>⌕</span>
          <input ref={inputRef} type="text" value={query}
            onChange={e => { setQuery(e.target.value); setHiIdx(-1) }}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKey}
            placeholder="e.g. Tesla, BYD, SUV, Cat A, hybrid…"
            aria-label={`Search all cars for slot ${slot}`}
            role="combobox" aria-expanded={showDrop} aria-autocomplete="list" aria-controls={`car-listbox-${slot}`}
            style={{width:'100%',background:C.surface,border:`1.5px solid ${focused?C.accent:C.border}`,borderRadius:C.r,padding:'10px 32px 10px 36px',color:C.text,fontSize:C.sm,outline:'none',transition:'border-color 0.2s,box-shadow 0.2s',boxShadow:focused?`0 0 0 3px ${C.accentBg}`:'none'}}/>
          {query && (
            <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus() }} aria-label="Clear search"
              style={{position:'absolute',right:2,top:'50%',transform:'translateY(-50%)',width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',background:'none',border:'none',color:C.faint,cursor:'pointer',fontSize:16,lineHeight:1,padding:0}}>✕</button>
          )}
          {showDrop && (
            <div id={`car-listbox-${slot}`} role="listbox" className="ndtm-scroll" style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,zIndex:999,background:C.surface,border:`1.5px solid ${C.accent}55`,borderRadius:C.r,boxShadow:C.shadowMd,maxHeight:'min(60vh, 420px)',overflowY:'auto',animation:'expandDown 0.18s ease forwards'}}>
              {filtered.length === 0
                ? <div style={{padding:'14px',fontSize:C.sm,color:C.muted,textAlign:'center'}}>No matches for &quot;{query}&quot;</div>
                : filtered.map((car, i) => {
                    const t = RATE_TIERS.find(r => r.id === car.rateTier)
                    const sel = value?.id === car.id
                    const hi = hiIdx === i
                    return (
                      <button key={car.id} type="button" className={`search-row${hi?' hi':''}`} aria-pressed={sel}
                        onMouseEnter={() => setHiIdx(i)} onClick={() => select(car)}
                        style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:sel?C.accentBg:hi?C.bg:'transparent',border:'none',borderBottom:i<filtered.length-1?`1px solid ${C.border}`:'none',cursor:'pointer',textAlign:'left'}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:C.sm,fontWeight:600,color:sel?C.primary:C.text}}>{hlMatch(car.name, query)}</div>
                          <div style={{fontSize:C.xs,color:C.muted,marginTop:1}}>{car.type} · {car.coe} · {car.loanCap}% loan</div>
                        </div>
                        <div style={{flexShrink:0,textAlign:'right'}}>
                          <div style={{fontSize:C.sm,fontFamily:C.fontMono,fontWeight:700,color:sel?C.primary:C.text}}>
                            {SGD(car.price)}
                          </div>
                          <span style={{fontSize:C.xs,fontWeight:700,color:t.color,background:t.bg,borderRadius:100,padding:'1px 7px'}}>{t.display}</span>
                        </div>
                        {sel && <span style={{color:C.accent,fontSize:13,flexShrink:0}}>✓</span>}
                      </button>
                    )
                  })}
              {filtered.length > 0 && (
                <div style={{padding:'8px 14px',borderTop:`1px solid ${C.border}`,fontSize:C.xs,color:C.faint}}>
                  {filtered.length} result{filtered.length!==1?'s':''} · ↑↓ navigate · Enter select
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {value && (
        <div style={{marginTop:12,padding:'12px 14px',background:C.accentBg,border:`1.5px solid ${C.accent}66`,borderRadius:C.r,animation:'fadeUp 0.25s ease forwards'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
            <div>
              <div style={{fontSize:C.sm,fontWeight:700,color:C.primary}}>{value.name}</div>
              <div style={{fontSize:C.xs,color:C.muted}}>{value.type} · {value.coe}</div>
            </div>
            {value.top5 && <span style={{marginLeft:'auto',fontSize:C.xs,fontWeight:700,color:C.accent,background:C.surface,border:`1px solid ${C.accent}55`,borderRadius:100,padding:'2px 10px'}}>#{value.rank} in SG</span>}
          </div>
          {value.desc && <p style={{fontSize:C.sm,color:C.text,lineHeight:1.6,marginBottom:8}}>{value.desc}</p>}
          <div style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:8}}>
            <span style={{fontSize:C.xs,color:C.muted}}>Max loan: <strong style={{color:C.primary}}>{value.loanCap}%</strong></span>
            <span style={{fontSize:C.xs,color:C.muted}}>Min. downpayment: <strong style={{color:C.primary}}>{SGD(value.price*(1-value.loanCap/100))}</strong></span>
            <span style={{fontSize:C.xs,color:C.muted}}>OMV: <strong style={{color:C.primary}}>{SGD(value.omv)}</strong></span>
          </div>
          {/* Price override field — promoted as a primary action: our prices are
              indicative (see data-staleness banner), but a dealer quote is exact,
              so entering one is the single highest-value thing a user can do here. */}
          <div style={{marginBottom:8,padding:'12px 14px',background:customPrice?C.accentBg:C.surface,borderRadius:C.r,border:`1.5px solid ${customPrice?C.accent:C.accent+'66'}`}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
              <span style={{fontSize:13}}>💬</span>
              <span style={{fontSize:C.xs,fontWeight:700,color:customPrice?C.accentText:C.primary}}>Got a dealer quote? Enter it for your real numbers</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:C.sm,color:C.faint}}>S$</span>
              <input
                type="text"
                value={priceText}
                placeholder={value.price.toLocaleString('en-SG')}
                onChange={e => commitPrice(e.target.value)}
                onFocus={e => { e.target.select() }}
                onBlur={blurPrice}
                aria-label="Enter your dealer-quoted price to override the indicative price"
                style={{flex:1,minWidth:0,border:'none',outline:'none',fontSize:C.base,fontFamily:C.fontMono,fontWeight:700,color:customPrice ? C.primary : C.muted,background:'transparent',padding:0}}
              />
              {customPrice && (
                <span style={{fontSize:C.xs,color:C.accent,fontWeight:700}}>✓ Your price</span>
              )}
              {!customPrice && (
                <span style={{fontSize:'10px',color:C.faint}}>indicative — click to edit</span>
              )}
            </div>
          </div>
          {(() => {
            const displayCar = customPrice ? {...value, price: parseInt(customPrice, 10)||value.price} : value
            // Resolve to this car's OWN category, mirroring how calc()
            // does it — without this, the margin shown here used the
            // stale COE_FALLBACK even when a live premium was available,
            // while DepreciationCard (fed the live figure) showed a
            // completely different margin for the same car on the same
            // screen.
            const liveCOEPremium = coeData ? (displayCar.coe === 'Cat A' ? coeData.catA : coeData.catB) : null
            const pg = calcPriceGap(displayCar, liveCOEPremium)
            return (
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:C.xs,color:C.muted}}>{pg.label}:</span>
                {pg.unreliable ? (
                  <span style={{fontSize:C.xs,color:C.muted}}>Not estimable at current COE — enter your dealer quote above</span>
                ) : (
                  <>
                    <span style={{fontSize:C.xs,fontFamily:C.fontMono,fontWeight:700,color:C.blue}}>{SGD(pg.gap)}</span>
                    <span style={{fontSize:C.xs,color:C.blueText,opacity:0.8}}>({pg.gapPct.toFixed(1)}% of total price)</span>
                  </>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
