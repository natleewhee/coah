'use client'

import { usePathname } from 'next/navigation'

function formatBuildDate(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })
  } catch {
    return null
  }
}

// Each vertical's own regulatory disclaimer — these used to be duplicated
// in a full second footer on every page of every vertical (own "ndtm"
// wordmark, own cross-links to the other two tools, own copy of this
// text). The cross-links and wordmark were pure duplication of this one
// shell footer; only the disclaimer text itself is genuinely different
// per vertical, so that's the only thing that varies here.
const DISCLAIMERS = {
  '/insure': 'InsureCheck: educational tool only, not financial advice. Coverage benchmarks are based on general Singapore financial planning guidelines — consult a MAS-licensed financial adviser for personal recommendations. Not affiliated with any insurer or MAS-licensed entity.',
  '/drive': 'DriveReady: educational tool only, not financial advice. Car prices are sourced monthly from the LTA Car Cost Update and are indicative only — always verify with the dealer. COE premiums are sourced from data.gov.sg\'s mirror of LTA\'s COE Bidding Results dataset. Not affiliated with any insurer or MAS-licensed entity.',
  '/etf': 'WhatETF: educational tool only, not financial advice. Portfolios shown are illustrative examples — consult a MAS-licensed financial adviser before making investment decisions. Not affiliated with any broker or MAS-licensed entity.',
  '/house': 'HouseMuch: educational tool only, not financial or legal advice. Stamp duty and CPF accrued interest figures are estimates based on public formulas and may not reflect the latest rates — verify with IRAS, CPF Board, and a conveyancing lawyer before making any property decision. Not affiliated with HDB, CPF Board, or IRAS.',
  '/retire': 'RetireWell: educational tool only, not financial advice. CPF contribution/interest figures are estimates based on public formulas and may not reflect the latest rates. Safe withdrawal rate and investment return assumptions are not guaranteed. Consult a MAS-licensed financial adviser before making any retirement decision. Not affiliated with CPF Board or MAS.',
  '/tax': 'TaxWise: educational tool only, not tax advice. Rates and relief caps are entered by hand from public IRAS schedules and may not reflect the latest Budget changes or any Personal Income Tax Rebate. Non-residents are not modeled. Verify at iras.gov.sg or consult a tax adviser before filing. Not affiliated with IRAS or CPF Board.',
  '/ledger': 'MyLedger: educational tool only, not financial advice. Net worth, TDSR, retirement projections, and the built-in Capacity module\'s CPF/cash split and living-expense figures are estimates built from figures you enter or sync from the other tools, and may not reflect your actual financial position. Consult a MAS-licensed financial adviser before making any financial decision.',
}

export default function Footer() {
  const pathname = usePathname()
  const version = process.env.NEXT_PUBLIC_APP_VERSION
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA
  const date = formatBuildDate(process.env.NEXT_PUBLIC_BUILD_TIME)
  const disclaimer = Object.entries(DISCLAIMERS).find(([prefix]) => pathname?.startsWith(prefix))?.[1]

  return (
    <footer className="shell-footer">
      <div className="shell-wrap shell-footer-inner">
        <div className="shell-footer-col">
          <p className="shell-footer-brand">ndtm</p>
          <p className="shell-footer-blurb">
            Free calculators I built for the big Singapore financial decisions — insurance, cars, ETFs, property, retirement, tax.
            Every number is shown, not just the verdict.
          </p>
        </div>

        <div className="shell-footer-col shell-footer-col-divided">
          <span className="shell-footer-math-label">The math</span>
          <div className="shell-footer-links">
            <a href="/insure/the-math">Insure</a>
            <a href="/drive/the-math">Drive</a>
            <a href="/etf/the-math">Invest</a>
            <a href="/house/the-math">House</a>
            <a href="/retire/the-math">Retire</a>
            <a href="/tax/the-math">Tax</a>
            <a href="/ledger/the-math">MyLedger</a>
          </div>
        </div>

        {disclaimer && (
          <div className="shell-footer-col shell-footer-col-divided shell-footer-col-legal">
            <p className="shell-footer-disclaimer">{disclaimer}</p>
            <p className="shell-footer-version tnum">
              {version ? `v${version}` : null}
              {date ? ` · Updated ${date}` : null}
              {sha ? ` · ${sha}` : null}
            </p>
          </div>
        )}
      </div>
    </footer>
  )
}
