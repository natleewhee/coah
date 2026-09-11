'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import ProfileSwitcher from './ProfileSwitcher'
import ThemeToggle from './ThemeToggle'

const TOOLS = [
  { key: 'insure', href: '/insure', label: 'Insure' },
  { key: 'drive', href: '/drive', label: 'Drive' },
  { key: 'etf', href: '/etf', label: 'Invest' },
  { key: 'house', href: '/house', label: 'House' },
  { key: 'retire', href: '/retire', label: 'Retire' },
  { key: 'tax', href: '/tax', label: 'Tax' },
  { key: 'ledger', href: '/ledger', label: 'MyLedger' },
]

// One header, not two stacked bars. The ndtm wordmark and "which tool am I
// in" are said exactly once — the tool switcher — so a page's own context
// (back button, page title, step count, links) never has to repeat the
// tool's name back to itself. Pages pass only the context that's actually
// theirs; a tool's own home page passes none of it.
export default function ShellHeader({
  title,
  breadcrumb,
  backHref,
  onBack,
  links = [],
  step,
  below,
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const menuRef = useRef(null)

  const active = TOOLS.find(t => pathname === t.href || pathname?.startsWith(t.href + '/'))

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    // The header sits on top of sections that are the same surface color
    // as the header itself, so it can blend in until content is scrolled
    // under it — a shadow/border boost once that's happening makes it
    // read as floating above the page instead.
    function onScroll() {
      setScrolled(window.scrollY > 4)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const hasContext = !!(backHref || onBack || title || step || links.length > 0)

  return (
    <div className={`shell-header${scrolled ? ' shell-header--scrolled' : ''}`}>
      <div className="shell-header-row">
        <div className="shell-header-left">
          <Link href="/" className="shell-header-brand">ndtm</Link>
          {active && (
            <div className="shell-switcher" ref={menuRef}>
              <button
                type="button"
                className="shell-switcher-btn"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-haspopup="true"
              >
                {active.label}
                <span className="shell-switcher-caret" aria-hidden="true">▾</span>
              </button>
              {open && (
                <div className="shell-switcher-menu" role="menu">
                  {TOOLS.filter(t => t.key !== active.key).map(t => (
                    <Link key={t.key} href={t.href} className="shell-switcher-item" role="menuitem">
                      {t.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          <ProfileSwitcher />
        </div>

        <div className="shell-header-right">
          <ThemeToggle />
          {hasContext && (<>
            {(backHref || onBack) && (
              backHref ? (
                <a href={backHref} className="shell-header-back" aria-label="Go back">←</a>
              ) : (
                <button type="button" onClick={onBack} className="shell-header-back" aria-label="Go back">←</button>
              )
            )}
            {title && (
              <span className="shell-header-title">
                {breadcrumb ? `${breadcrumb} › ${title}` : title}
              </span>
            )}
            {step && <span className="shell-header-step">{step}</span>}
            {links.map((l) => (
              <a key={l.href} href={l.href} className="shell-header-link">{l.label}</a>
            ))}
          </>)}
        </div>
      </div>
      {below}
    </div>
  )
}
