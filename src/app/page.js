import ShellHeader from '@/components/shared/ShellHeader'

const TOOLS = [
  {
    href: '/insure',
    eyebrow: 'Insure',
    title: 'InsureCheck',
    desc: 'A free, 3-minute Insurance Score. See your critical illness, life/TPD, and hospitalisation gaps in real dollars — not jargon.',
    icon: <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" />,
  },
  {
    href: '/drive',
    eyebrow: 'Drive',
    title: 'DriveReady',
    desc: 'Singapore car affordability calculator. Know your true monthly cost — instalment, PARF/COE depreciation, TDSR — before you commit.',
    icon: <>
      <path d="M4 16l1.5-5a2 2 0 0 1 1.9-1.4h9.2A2 2 0 0 1 18.5 11l1.5 5" />
      <rect x="3" y="16" width="18" height="4" rx="1.5" />
      <circle cx="7.5" cy="20" r="1.2" />
      <circle cx="16.5" cy="20" r="1.2" />
    </>,
  },
  {
    href: '/etf',
    eyebrow: 'Invest',
    title: 'WhatETF',
    desc: 'Build an illustrative ETF portfolio for Singapore investors. UCITS-aware, tax-efficient, DCA-ready — runs entirely in your browser.',
    icon: <>
      <path d="M4 16l5-5 4 4 7-8" />
      <path d="M15 7h5v5" />
    </>,
  },
  {
    href: '/house',
    eyebrow: 'House',
    title: 'HouseMuch',
    desc: 'What did your house really make you? True profit/loss after CPF refund, mortgage interest, and stamp duties — not just sale minus purchase.',
    icon: <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9h12v-9" />
    </>,
  },
  {
    href: '/retire',
    eyebrow: 'Retire',
    title: 'RetireWell',
    desc: 'Will you actually have enough? CPF contributions projected properly, your investments stress-tested against a safe withdrawal rate — not a rule of thumb.',
    icon: <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>,
  },
  {
    href: '/tax',
    eyebrow: 'Tax',
    title: 'TaxWise',
    desc: 'What you actually owe IRAS, and what each relief is really worth. CPF, SRS and CPF top-up relief priced in dollars saved — not percentages.',
    icon: <>
      <rect x="6" y="3" width="12" height="18" rx="1.5" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>,
  },
  {
    href: '/ledger',
    eyebrow: 'Everything',
    title: 'MyLedger',
    desc: 'Your whole picture at once — net worth, debt servicing across every loan, and what buying a car or upgrading your house does to your retirement.',
    icon: <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>,
  },
]

export default function HomePage() {
  return (
    <>
    <ShellHeader />
    <div className="shell-wrap" style={{ padding: '56px 24px 80px' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px',
        borderRadius: 999, background: 'var(--color-accent-bg)', marginBottom: 20,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-accent)' }} />
        <span style={{
          fontFamily: 'var(--l-font-mono)', fontSize: 11, letterSpacing: '.06em',
          color: 'var(--color-accent-text)',
        }}>
          Seven calculators, one household
        </span>
      </div>
      <h1 style={{
        fontFamily: 'var(--l-font-display)', fontWeight: 600, fontSize: 'clamp(28px,4vw,42px)',
        lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 16px', maxWidth: '18ch',
      }}>
        The math behind your biggest Singapore money decisions.
      </h1>
      <p style={{ color: 'var(--l-sub)', maxWidth: '58ch', fontSize: 16, margin: '0 0 40px' }}>
        No accounts, no upsells. Each tool shows exactly how it got to its answer —
        pick the decision you&apos;re facing.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {TOOLS.map((t) => (
          <a key={t.href} href={t.href} className="home-tool-card">
            <div className="home-tool-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                {t.icon}
              </svg>
            </div>
            <p style={{ fontFamily: 'var(--l-font-display)', fontWeight: 600, fontSize: 19, margin: '0 0 8px' }}>
              {t.title}
            </p>
            <p style={{ fontSize: 13.5, color: 'var(--l-sub)', margin: '0 0 18px', lineHeight: 1.5 }}>
              {t.desc}
            </p>
            <span className="home-tool-cta">the math →</span>
          </a>
        ))}
      </div>
    </div>
    </>
  )
}
