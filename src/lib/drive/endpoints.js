// src/lib/drive/endpoints.js
//
// The LTA route handlers live under src/app/drive/api/**, so their real URLs
// are /drive/api/*, NOT /api/*. Callers previously hardcoded '/api/coe' and
// '/api/cars' by hand, which 404'd on every request — and because a 404
// returns HTML, the `r.json()` in each caller threw and was swallowed by a
// bare .catch(), so the failure was completely silent and the calculator
// just quietly used its fallback constants forever.
//
// Both paths are defined once here so a route can never drift from its
// callers again. If these routes ever move, this is the only file to edit.

export const COE_ENDPOINT = '/drive/api/coe'
// Reference-data endpoints — served from Supabase when configured, falling
// back to the bundled public/data/*.json snapshot otherwise. Distinct from
// COE_ENDPOINT above, which fetches LIVE data (current COE premium); these
// two serve slower-moving catalog/history data, refreshed weekly by
// .github/workflows/refresh-data.yml rather than per-request. There used
// to be a CARS_ENDPOINT that live-fetched LTA's Car Cost Update PDF on
// every request — removed because onemotoring.lta.gov.sg reliably blocks
// that kind of traffic (no browser-like headers, a shared serverless IP
// range) and it never actually worked in production; CAR_CATALOG_ENDPOINT
// below is now the only source of car prices.
export const CAR_CATALOG_ENDPOINT = '/drive/api/car-catalog'
export const COE_HISTORY_ENDPOINT = '/drive/api/coe-history'
