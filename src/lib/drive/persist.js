// src/lib/persist.js
// Pure (de)serialization for the calculator's input state, shared between
// localStorage persistence and shareable URL query params. Kept separate
// from the DOM/storage side effects (in page.js) so the encoding logic is
// unit-testable without a browser environment.

export const STORAGE_KEY = 'driveready:inputs:v1'

// Fields that round-trip through both localStorage and the URL.
// carAId/carBId are IDs, not full car objects — the caller resolves them
// against the loaded car list once available.
export function serializeToParams(state) {
  const params = new URLSearchParams()
  if (state.salaryRaw) params.set('salary', state.salaryRaw)
  if (state.downRaw) params.set('down', state.downRaw)
  if (state.existingDebtRaw) params.set('debt', state.existingDebtRaw)
  if (state.isJointCarLoan) params.set('joint', '1')
  if (state.carShareMode === 'manual') params.set('shareMode', 'manual')
  if (state.coBorrowerIncomeRaw) params.set('coIncome', state.coBorrowerIncomeRaw)
  if (state.manualCarSharePctRaw) params.set('sharePct', state.manualCarSharePctRaw)
  if (state.tenure && state.tenure !== 7) params.set('tenure', String(state.tenure))
  if (state.mode && state.mode !== 'single') params.set('mode', state.mode)
  if (state.carAId) params.set('carA', state.carAId)
  if (state.carBId) params.set('carB', state.carBId)
  if (state.customPriceA) params.set('priceA', state.customPriceA)
  if (state.customPriceB) params.set('priceB', state.customPriceB)
  if (state.calculated) params.set('go', '1')
  return params
}

export function deserializeFromParams(params) {
  const out = {}
  const salaryRaw = params.get('salary')
  if (salaryRaw && /^\d+$/.test(salaryRaw)) out.salaryRaw = salaryRaw
  const downRaw = params.get('down')
  if (downRaw && /^\d+$/.test(downRaw)) out.downRaw = downRaw
  const existingDebtRaw = params.get('debt')
  if (existingDebtRaw && /^\d+$/.test(existingDebtRaw)) out.existingDebtRaw = existingDebtRaw
  if (params.get('joint') === '1') out.isJointCarLoan = true
  if (params.get('shareMode') === 'manual') out.carShareMode = 'manual'
  const coIncomeRaw = params.get('coIncome')
  if (coIncomeRaw && /^\d+$/.test(coIncomeRaw)) out.coBorrowerIncomeRaw = coIncomeRaw
  const sharePctRaw = params.get('sharePct')
  if (sharePctRaw && /^\d{1,3}$/.test(sharePctRaw)) out.manualCarSharePctRaw = sharePctRaw
  const tenureRaw = params.get('tenure')
  if (tenureRaw) {
    const n = parseInt(tenureRaw, 10)
    if (Number.isFinite(n) && n >= 1 && n <= 7) out.tenure = n
  }
  if (params.get('mode') === 'compare') out.mode = 'compare'
  const carAId = params.get('carA')
  if (carAId) out.carAId = carAId
  const carBId = params.get('carB')
  if (carBId) out.carBId = carBId
  const priceA = params.get('priceA')
  if (priceA && /^\d+$/.test(priceA)) out.customPriceA = priceA
  const priceB = params.get('priceB')
  if (priceB && /^\d+$/.test(priceB)) out.customPriceB = priceB
  if (params.get('go') === '1') out.calculated = true
  return out
}

export function serializeToJSON(state) {
  return JSON.stringify({
    salaryRaw: state.salaryRaw || '',
    downRaw: state.downRaw || '',
    existingDebtRaw: state.existingDebtRaw || '',
    isJointCarLoan: !!state.isJointCarLoan,
    carShareMode: state.carShareMode === 'manual' ? 'manual' : 'income',
    coBorrowerIncomeRaw: state.coBorrowerIncomeRaw || '',
    manualCarSharePctRaw: state.manualCarSharePctRaw || '',
    tenure: state.tenure || 7,
    mode: state.mode || 'single',
    carAId: state.carAId || null,
    carBId: state.carBId || null,
    customPriceA: state.customPriceA || '',
    customPriceB: state.customPriceB || '',
    calculated: !!state.calculated,
  })
}

// Validates/whitelists a plain restored-state object — shared by
// deserializeFromJSON (the old global-localStorage path, parsed from a
// JSON string) and loadToolInputs('drive')'s restore path (already a
// plain object, no JSON.parse needed) in src/app/drive/page.js.
export function sanitizeState(parsed) {
  if (typeof parsed !== 'object' || parsed === null) return {}
  const out = {}
  if (typeof parsed.salaryRaw === 'string' && /^\d*$/.test(parsed.salaryRaw)) out.salaryRaw = parsed.salaryRaw
  if (typeof parsed.downRaw === 'string' && /^\d*$/.test(parsed.downRaw)) out.downRaw = parsed.downRaw
  if (typeof parsed.existingDebtRaw === 'string' && /^\d*$/.test(parsed.existingDebtRaw)) out.existingDebtRaw = parsed.existingDebtRaw
  if (typeof parsed.isJointCarLoan === 'boolean') out.isJointCarLoan = parsed.isJointCarLoan
  if (parsed.carShareMode === 'income' || parsed.carShareMode === 'manual') out.carShareMode = parsed.carShareMode
  if (typeof parsed.coBorrowerIncomeRaw === 'string' && /^\d*$/.test(parsed.coBorrowerIncomeRaw)) out.coBorrowerIncomeRaw = parsed.coBorrowerIncomeRaw
  if (typeof parsed.manualCarSharePctRaw === 'string' && /^\d*$/.test(parsed.manualCarSharePctRaw)) out.manualCarSharePctRaw = parsed.manualCarSharePctRaw
  if (Number.isInteger(parsed.tenure) && parsed.tenure >= 1 && parsed.tenure <= 7) out.tenure = parsed.tenure
  if (parsed.mode === 'single' || parsed.mode === 'compare') out.mode = parsed.mode
  if (typeof parsed.carAId === 'string') out.carAId = parsed.carAId
  if (typeof parsed.carBId === 'string') out.carBId = parsed.carBId
  if (typeof parsed.customPriceA === 'string' && /^\d*$/.test(parsed.customPriceA)) out.customPriceA = parsed.customPriceA
  if (typeof parsed.customPriceB === 'string' && /^\d*$/.test(parsed.customPriceB)) out.customPriceB = parsed.customPriceB
  if (typeof parsed.calculated === 'boolean') out.calculated = parsed.calculated
  return out
}

export function deserializeFromJSON(raw) {
  if (!raw) return {}
  try {
    return sanitizeState(JSON.parse(raw))
  } catch {
    return {}
  }
}

// Merge storage (base) and URL (override) restorations — URL wins, since
// following a shared link is a more deliberate signal than a stale local
// session, but only for keys the URL actually specifies.
export function mergeRestoredState(fromStorage, fromUrl) {
  return { ...fromStorage, ...fromUrl }
}
