// src/app/flow/route.js
// FlowState was absorbed into MyLedger's Capacity module (see
// docs/plans/2026-09-11-0225-feat-flowstate-into-ledger-plan.md, KD4/KTD4).
// A hard 410, not a redirect: this URL doesn't have a new home to send
// traffic to, it names a decision that no longer exists on its own — the
// capacity math now lives inside /ledger itself.
export async function GET() {
  return new Response(null, { status: 410 })
}
