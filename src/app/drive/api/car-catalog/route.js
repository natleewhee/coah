// src/app/drive/api/car-catalog/route.js
// Serves the car catalog (id, name, price, omv, ...) — the only source of
// car prices DriveReady uses. There is no live per-request LTA fetch
// layered on top of this (see the comment in src/lib/drive/endpoints.js
// for why that was removed); prices are refreshed weekly by
// .github/workflows/refresh-data.yml + scripts/refresh-cars.mjs, which
// runs the LTA PDF parser server-side (from a GitHub Actions runner, not
// a request-time serverless function) and opens a PR that auto-merges
// once CI passes, so `updatedAt` below is at most about a week stale.
//
// Reads from the `cars` Postgres table (see
// supabase/migrations/0001_reference_data.sql) when Supabase is
// configured, and falls back to the bundled public/data/cars.json
// snapshot otherwise — the same "never let a data source outage break the
// calculator" pattern as /drive/api/coe (COE_FALLBACK constants).
// The bundled JSON is imported statically so it's available on both edge
// and Node runtimes without a filesystem read.

import { getSupabaseReadClient } from '@/lib/shared/supabase'
import { dbRowToCar } from '@/lib/drive/carCatalog'
import bundledCars from '../../../../../public/data/cars.json'

export const runtime = 'edge'
export const revalidate = 3600

/** Latest of a list of ISO-ish timestamps, or `null` if none are usable. */
function latestOf(dates) {
  const valid = dates.filter(Boolean).map(d => new Date(d)).filter(d => !Number.isNaN(d.getTime()))
  if (valid.length === 0) return null
  return new Date(Math.max(...valid.map(d => d.getTime()))).toISOString()
}

export async function GET() {
  const supabase = getSupabaseReadClient()

  if (!supabase) {
    return Response.json({
      source: 'bundled-json',
      detail: 'Supabase is not configured (SUPABASE_URL/SUPABASE_ANON_KEY missing) — serving the bundled snapshot.',
      cars: bundledCars.cars,
      updatedAt: bundledCars._meta?.updated ?? null,
      checkedAt: new Date().toISOString(),
    })
  }

  const { data, error } = await supabase.from('cars').select('*')

  if (error) {
    console.error('car-catalog Supabase query failed:', error.message)
    return Response.json({
      source: 'bundled-json',
      detail: `Supabase query failed (${error.message}) — serving the bundled snapshot.`,
      cars: bundledCars.cars,
      updatedAt: bundledCars._meta?.updated ?? null,
      checkedAt: new Date().toISOString(),
    })
  }

  if (!data || data.length === 0) {
    return Response.json({
      source: 'bundled-json',
      detail: 'Supabase returned zero cars — table likely not seeded yet. Serving the bundled snapshot.',
      cars: bundledCars.cars,
      updatedAt: bundledCars._meta?.updated ?? null,
      checkedAt: new Date().toISOString(),
    })
  }

  return Response.json({
    source: 'supabase',
    cars: data.map(dbRowToCar),
    updatedAt: latestOf(data.map(row => row.updated_at)),
    checkedAt: new Date().toISOString(),
  })
}
