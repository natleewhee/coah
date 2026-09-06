// src/lib/shared/jointShare.js
// Shared by DriveReady and HouseMuch — a co-borrower's share of a joint
// loan's debt obligation, for TDSR purposes. Not vertical-specific: a car
// loan and a mortgage apportion a joint TDSR the same way.

/**
 * Resolves a co-borrower's share of a joint loan's instalment for TDSR
 * purposes — MAS's income-weighted apportionment (each borrower's share
 * of the debt = their income ÷ combined income) when both incomes are
 * given, or a direct manual percentage otherwise. Only the SHARE OF THE
 * INSTALMENT counted against your own TDSR changes; the loan's actual
 * monthly instalment, principal, and interest are unaffected — a joint
 * loan doesn't cost less, it's just serviced by two incomes.
 * @param {'income'|'manual'} mode - 'income' computes from `myIncome`/`coBorrowerIncome`; 'manual' uses `manualPct` directly.
 * @param {number} myIncome - Your gross monthly income, only used in 'income' mode.
 * @param {number} coBorrowerIncome - Co-borrower's gross monthly income, only used in 'income' mode.
 * @param {number} manualPct - Your share as a 0-100 percentage, only used in 'manual' mode.
 * @returns {number} Your share of the instalment, clamped to (0, 100]. Defaults to 100 (not a joint loan) on invalid input.
 */
export function resolveJointSharePct(mode, myIncome, coBorrowerIncome, manualPct) {
  if (mode === 'income') {
    const my = Number(myIncome) || 0
    const co = Number(coBorrowerIncome) || 0
    const combined = my + co
    if (combined <= 0) return 100
    return Math.min(100, Math.max(0.01, (my / combined) * 100))
  }
  const pct = Number(manualPct)
  if (!Number.isFinite(pct) || pct <= 0) return 100
  return Math.min(100, pct)
}
