---
module: shared/jointShare, drive/calc, drive/used-car, ledger
tags: [joint-loan, tdsr, clamping, zero-value, input-validation]
problem_type: silent-wrong-value
severity: medium
resolution_type: fixed
---

# A joint-loan share of 0% was silently treated as "not entered"

## Symptoms

`resolveJointSharePct()`'s manual mode, and the `mySharePct` clamps in
`calc()`, `calcCeiling()`, `calcUsed()`, and MyLedger's own
`shareFraction()` helper, all used `pct <= 0` to mean "not entered,
default to 100%." A co-borrower explicitly set to a 0% share (someone
who services none of a loan's instalment) silently reverted to 100% —
the opposite of what was typed. No error, no test failure — the number
was just wrong, and self-consistently wrong across every call site that
copied the pattern.

## What Didn't Work

Nothing was "tried and abandoned" here — the bug shipped in the initial
joint-loan feature (PR #9) and was only found by a follow-up code
review reading the clamp logic adversarially, not by a test failure.
The five separate implementations (`jointShare.js`, `calc.js` twice,
`used-car.js`, `ledger/page.js`) each independently made the same
`<= 0` choice, which is the real signal: this isn't one typo, it's a
default reflex.

## Solution

Distinguish "unset" (`null`/`undefined`/`''`/`NaN`) from an explicit
`0`, which is now a valid share:

```js
if (manualPct === null || manualPct === undefined || manualPct === '') return 100
const pct = Number(manualPct)
if (!Number.isFinite(pct) || pct < 0) return 100
return Math.min(100, pct)
```

The `<= 0` → `< 0` change alone isn't sufficient at every call site: one
caller (`drive/page.js`) was collapsing a blank input to `'0'` *before*
calling the resolver (`parseInt(manualCarSharePctRaw||'0', 10)`), which
would defeat the fix at the source. That caller now passes `null` for
blank instead of pre-coercing to `0`.

## Why This Works

`calcCeiling()`'s division by `mySharePct / 100` was already safe for a
literal `0` — it produces `Infinity`, and `Math.min(maxMonthlyComfort,
Infinity)` correctly falls back to the comfort limit — so allowing `0`
through didn't require touching the downstream math, only the clamp
that rejected it before it got there.

## Prevention

**When a numeric field's "unset" state and its valid range both
include a value near zero, `<= 0` as a validity check silently merges
them.** The clamp must check for the *sentinel* (blank/null/NaN)
explicitly, separately from the *range* (`< 0` or `> 100`), or a
deliberate zero becomes indistinguishable from nothing typed.

The tell that this was a real bug and not a false positive: **the same
mistake was made independently at five call sites.** When multiple
implementations of "the same idea" all reach for the identical
shortcut, that's the pattern to fix, not just the instances — grep for
the shortcut (`<= 0` next to a percentage/share/pct variable) rather
than trusting that fixing the first occurrence found them all.
