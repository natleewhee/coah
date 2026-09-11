---
title: FlowState into MyLedger - Plan
type: feat
date: 2026-09-11
topic: flowstate-ledger-merge
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# FlowState into MyLedger - Plan

## Goal Capsule

- **Objective:** MyLedger becomes the single source of truth for "how much can I invest per month" — computed from real income, obligations, and measured living expenses, not a manually-typed assumption sitting beside a different tool's different number for the same-sounding question.
- **Means:** Dissolve FlowState as a standalone top-level tool. Its measurement flow (CPF/cash split, month-by-month living-expense walk, lumpy one-off items) becomes a module inside `/ledger`, feeding a capacity figure that MyLedger's multi-year projection uses directly — replacing the current manual `investmentMonthly` field. (session-settled — see Key Decisions)
- **Product authority:** User is product owner. Chosen explicitly over two narrower alternatives raised during brainstorm: (a) a small wiring fix that surfaces FlowState's computed capacity as a second labeled option alongside RetireWell's actual-contribution figure, and (b) keeping `/flow` as a standalone tool that only exports synced numbers. Both were rejected — the user's read is that two different numbers answering "how much can I invest" is itself the disparity, and a picker between them doesn't resolve it, only relocates it.
- **Open blockers:** This is requirements-only. The three-way absorption (FlowState's UI, its metrics module, its saved profile schema) has real implementation surface not yet scoped — see Outstanding Questions. No code has been written under this plan.

---

## Product Contract

### Summary

Today, FlowState (`/flow`) and MyLedger (`/ledger`) each answer a version of "how much am I actually able to invest each month," and disagree by construction: FlowState computes it precisely (take-home minus all obligations minus a measured living-expense figure, via `calcInvestmentCapacity` in `src/lib/ledger/calc.js`); MyLedger's multi-year scenario projection instead uses a fully manual `assumptions.investmentMonthly` field, softly hinted from RetireWell's separate "current contribution" number — a different concept (what you're putting away today) wearing the same units as capacity (what your income structurally allows). `calcInvestmentCapacity` and `buildCapacitySchedule` already exist in MyLedger's own calc module but are today called only by FlowState's own `Results.js` component, never by MyLedger's own projection.

This plan folds FlowState into MyLedger as a module: its inputs and measurement flow move into `/ledger`'s own surface, and its capacity output becomes the number the ledger's projection authoritatively uses. `/flow` as a separate homepage tile and route goes away.

### Problem Frame

Every natdtm tool resolves one decision in isolation by design — that's the product's whole shape (see the Scenario Planner plan's Problem Frame for the general version of this). FlowState and MyLedger are the one pair where that isolation produces an actual contradiction rather than just an incomplete picture: both claim to answer "how much can I invest," from different math, and nothing reconciles them. A user who has run both sees two numbers and has no way to know which the ledger's own retirement projection is actually using (today: neither — it's whatever they typed).

### Key Decisions

- KD1. **Capacity is the canonical "monthly invested" figure; the manual assumption field is removed.** MyLedger's projection always uses `calcInvestmentCapacity`'s output (take-home − obligations − living expenses) once those three inputs are available. RetireWell's `monthlyContribution` (what the user is actually contributing today) becomes a secondary, informational comparison — e.g. "you're investing S$400/mo below your capacity" — never a competing default for what the projection assumes. (session-settled: user-directed — chosen over making "actual" canonical, and over a source-conditional rule that defers to whichever tool ran most recently.)
- KD2. **FlowState's measurement flow moves into MyLedger as a module, not a cross-tool sync.** The salary/CPF/cash split, the month-by-month living-expense walk (quick vs. detailed mode), and lumpy one-off items — the actual mechanism that produces the three inputs `calcInvestmentCapacity` needs — relocate into `/ledger`'s own surface as a distinct section/tab, alongside the existing Position / Assumptions / Scenarios structure. `/flow` and `/flow/the-math` cease to exist as standalone routes and homepage tiles. (session-settled: user-directed — chosen explicitly over keeping `/flow` standalone and having MyLedger only read its synced output; the user's stated goal is a single tool, not a better sync.)
- KD3. **The module boundary doubles as MyLedger's progressive-disclosure fix.** `docs/backlog.md` already flags MyLedger's current page as ~9,200px of ~20 always-rendered inputs with no progressive disclosure. Introducing a real module/tab structure to hold the absorbed FlowState flow is the same structural change that backlog item calls for — this plan does not additionally invent a second tabbing mechanism. (session-settled: user-directed — "flowstate as a module within MyLedger.") Governs R7, R8.

### Requirements

#### Capacity as canonical

- R1. `calcInvestmentCapacity` (take-home − obligations − living expenses) is the figure MyLedger's multi-year projection uses for its monthly-invested assumption. The existing manual `assumptions.investmentMonthly` field is removed from the assumptions panel, not merely defaulted.
- R2. RetireWell's synced `monthlyContribution`, when present, is surfaced as a labeled comparison against the computed capacity (a delta, not a second input) — e.g. above/below capacity, by how much.
- R3. If the inputs `calcInvestmentCapacity` needs (take-home, obligations, living expenses) are incomplete — the absorbed module hasn't been filled in — the projection falls back to a value of `0`, the same "don't fabricate a number" convention MyLedger already uses elsewhere (see `resolveReference`'s `source: 'none'` case), with a visible reason rather than a silent wrong number.

#### FlowState absorption

- R4. The CPF/cash income split, the living-expense measurement (quick and detailed modes), and lumpy one-off items move from `/flow`'s page into a module inside `/ledger`. The underlying calc functions (`buildMonthlyFlow`, `quickLivingExpenses`, `detailedLivingExpenses`, `trueSavingsRate`, `cashSavingsRate`, `fixedCostRatio`, `runwayMonths` in `src/lib/flow/calc.js`) are reused, not reimplemented — same reuse posture as the Scenario Planner plan's KD1 (reuse RetireWell's engine; don't fork it).
- R5. FlowState's own results view (the Sankey diagram, before/after capacity comparison) is preserved inside the new module — this plan absorbs the tool, it does not delete its output, only its standalone-ness.
- R6. `/flow` and `/flow/the-math` are removed from the homepage grid and the shell header's tool switcher. (Whether the routes themselves 410, redirect to `/ledger`, or stay live as a deep link into the module is an Outstanding Question, not decided here.)
- R7. The absorbed module renders as a distinct, collapsed-by-default section of `/ledger`, not inline fields interleaved with Position/Assumptions — satisfying KD3.
- R8. Existing users' saved FlowState data (`myNumbers.flow.inputs`, written by `saveFlowInputs`) continues to restore correctly inside the new module location — this is a UI relocation, not a data-loss event. The existing `flow` slot schema (`livingExpenses`, `monthlySurplus`, `trueSavingsRate`, `cashSavingsRate`, `inputs`) does not need to change shape for this plan's scope; whether it needs a version bump is an Outstanding Question.

### Key Flows

- F1. **A user who has never touched FlowState opens `/ledger`.** They see Position, Assumptions, Scenarios, and a collapsed "Monthly capacity" module. The projection's monthly-invested figure reads 0 (or their RetireWell-synced actual contribution, per R2's comparison framing) until they open and fill in the module.
- F2. **A user who previously used FlowState opens `/ledger` after this ships.** Their saved inputs restore into the new module location (R8); the module is not collapsed by default for them since real data exists there. The projection immediately reflects the computed capacity.
- F3. **A user opens the capacity module, fills in salary/CPF split/living expenses/lumpy items**, sees the same Sankey/results view FlowState used to show, and the ledger's own "Monthly invested" figure (now read-only, computed) updates live — no separate "save to sync" step, matching MyLedger's existing "autosaved as you type, nothing to press" convention.
- F4. **A user with a RetireWell-synced `monthlyContribution` and a filled-in capacity module** sees both: the projection uses capacity; a comparison line shows the actual-vs-capacity delta (R2).

### Acceptance Examples

- AE1. Given a filled capacity module producing `calcInvestmentCapacity` = 1,200 and a synced `retire.monthlyContribution` = 800, when the assumptions panel renders, then the projection uses 1,200 and a comparison reads "S$400/mo below your capacity" (or equivalent). Covers R1, R2.
- AE2. Given no capacity-module inputs and no synced `retire.monthlyContribution`, when the projection renders, then the monthly-invested figure is 0 with a visible "fill in your capacity" prompt, not a blank silently treated as a real zero. Covers R3.
- AE3. Given a user with pre-existing `myNumbers.flow.inputs` from before this ships, when they open `/ledger` post-migration, then those inputs populate the capacity module exactly as they populated `/flow` before. Covers R8.
- AE4. Given the capacity module is open and a lumpy one-off item is added, when the Sankey/results view re-renders, then it matches what FlowState's standalone `Results.js` would have shown for the same inputs today (same calc functions, same output). Covers R4, R5.

### Success Criteria

- MyLedger's multi-year projection never uses a manually-typed "monthly invested" number again — every path to that figure runs through `calcInvestmentCapacity`.
- The homepage grid drops from 8 tiles to 7; no route still advertises FlowState as a standalone decision.
- No existing user's saved FlowState inputs are lost across the change (AE3).
- `docs/backlog.md`'s MyLedger progressive-disclosure item is resolved as a side effect, not left open alongside a new module bolted onto the same flat page.

### Scope Boundaries

**In scope:** the capacity module's UI and inputs inside `/ledger`; wiring `calcInvestmentCapacity`'s output into the scenario projection in place of the manual field; the actual-vs-capacity comparison display; removing `/flow` from navigation.

**Out of scope:** `trueSavingsRate` and `cashSavingsRate` remain computed and stored but unused by any downstream calculation — same as today; this plan doesn't find them a consumer, it only fixes `monthlySurplus`. Redesigning MyLedger's *other* sections (Position, Scenarios) beyond what's needed to host the new module. Any change to RetireWell's own `monthlyContribution` field or `/retire` itself.

### Dependencies & Assumptions

- Assumes MyLedger's existing autosave-per-keystroke pattern extends cleanly to a new module without a redesign of the persistence layer itself (`src/lib/shared/profile.js`'s `flow` slot already exists and already supports this shape).
- Assumes the Scenario Planner rebuild (the other recent plan in `docs/plans/`) is stable ground to build on top of, not itself mid-change.

### Outstanding Questions

- What happens to the `/flow` and `/flow/the-math` URLs themselves — hard 410, redirect to `/ledger#capacity`, or intentionally left dead? Affects anyone with the URL bookmarked or indexed by search.
- Does the `flow` profile-store slot need a version bump/migration note (matching the `v4 → v5` precedent already in `profile.js` for adding the flow slot itself), or is this purely a UI relocation with no schema shape change?
- Exact module tab list and ordering for the now-multi-section `/ledger` page (Position / Assumptions / Capacity / Scenarios?) — KD3 commits to *a* module structure existing, not its final layout.
- Whether FlowState's "the math" explainer content merges into MyLedger's own "the math" page or stays reachable as a sub-page under the new module.

---

## Planning Contract

*Not yet built — this document is requirements-only (`artifact_readiness: requirements-only`). A Planning Contract (Key Technical Decisions, Implementation Units, High-Level Technical Design) is the next step once the Outstanding Questions above are settled, following the same `/ce-plan` progression used for the Scenario Planner rebuild.*

## Post-Plan Menu

- Resolve the Outstanding Questions (likely one more focused round each, per `/ce-brainstorm`'s one-question discipline).
- Then deepen this document into `artifact_readiness: implementation-ready` with Implementation Units, mirroring `docs/plans/2026-09-02-1101-feat-scenario-planner-plan.md`'s structure.
- Do not begin implementation against this document as-is — it captures WHAT, not HOW, and the HOW has open forks (Outstanding Questions) that would make any code written now a guess.
