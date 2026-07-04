import { api, type BBSummaryExt } from './api'
export type { BBSummaryExt }
import type { LPRecord } from './lpService'
import type { BBBreach } from '../types/bb'

// ── Helpers ───────────────────────────────────────────────────────────────────

export function parseM(s: string | undefined | null): number {
  if (!s || s === '$0') return 0
  const str = String(s)
  const m = str.match(/\$?\s*([\d,.]+)\s*([MB])?/i)
  if (!m) return 0
  const val = parseFloat(m[1].replace(/,/g, ''))
  if (!Number.isFinite(val)) return 0
  const unit = (m[2] || '').toUpperCase()
  if (unit === 'B') return val * 1000
  if (unit === 'M') return val
  return str.includes('$') || val >= 100_000 ? val / 1_000_000 : val
}

export function fmtM(n: number): string {
  if (n === 0) return '$0'
  const abs = Math.abs(n)
  return `${n < 0 ? '–' : ''}$${abs.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`
}

export function fmtPct(n: number): string { return `${(n * 100).toFixed(1)}%` }

// Advance rate (as a fraction) for an LP. An explicit per-LP rate — e.g. the UBS Advance Rate
// assigned on the Run Shadow BB screen, "90%" — takes precedence; otherwise fall back to the
// DB-backed BUSA schedule keyed by classification. This keeps the engine correct for both the legacy LP
// Master taxonomy ('Rated', 'Unrated >2bn', …) and the UBS LP Category taxonomy
// ('Rated Investor', …) the Shadow BB now seeds from the Agent Advance Rate.
// `cls` is typed as string (not the legacy LPClassification union): at runtime it carries either
// taxonomy: the legacy LP Master tiers or the UBS LP Category labels seeded at Step 5.
// Mirrors the API's advanceRateFraction(Lp).
export function advanceRateFraction(
  lp: { rate?: string | null; cls?: string | null },
  busaRates: Record<string, number>,
): number {
  const raw = (lp.rate ?? '').trim()
  if (raw) {
    const n = parseFloat(raw.replace('%', ''))
    if (!Number.isNaN(n)) return n > 1 ? n / 100 : n   // "90%"/"90" → 0.90; "0.90" → 0.90
  }
  return busaRates[lp.cls ?? ''] ?? 0
}

export const DEFAULT_FACILITY_PARAMS = { concLimitM: 25.0 }


// ── Calculation engine ────────────────────────────────────────────────────────

export interface ComputedLPRecord extends LPRecord {
  ucM: number; abbM: number; uecM: number; ubbM: number; deltaM: number
  concExcessM: number; busaRate: number; highQuality: boolean; navAumRatio: string
  agentExcessM: number
  uec: string; ubb: string; delta: string; rate: string; agentExcess: string
}

export interface BBSummary {
  totalUBB: number; totalABB: number; bbDelta: number; ear: number
  agentEar: number; earDelta: number; totalUEC: number; totalUC: number
  totalConcExcess: number; includedCount: number; excludedCount: number
  reclassCount: number; calculatedAt: Date; params: typeof DEFAULT_FACILITY_PARAMS
}

export interface BBBreachResult { rule: string; entity: string; value: string; limit: string; severity: 'breach' | 'warning' }
export interface BBResult { lps: ComputedLPRecord[]; summary: BBSummary; breaches: BBBreachResult[] }

export function computeLPRecord(
  lp: LPRecord,
  params = DEFAULT_FACILITY_PARAMS,
  busaRates: Record<string, number> = {},
): ComputedLPRecord {
  const concLimitM = (lp as LPRecord & { concLimitM?: number }).concLimitM ?? params.concLimitM ?? 25.0
  const busaRate = advanceRateFraction(lp, busaRates)
  const ucM  = (lp as LPRecord & { ucM?: number }).ucM != null ? (lp as LPRecord & { ucM?: number }).ucM! : parseM(lp.uc)
  const abbM = parseM(lp.abb)
  const navM = parseM(lp.nav)
  const aumM = parseM(lp.aum)
  // High Quality tracks the advance rate (UBS Advance Rate = 0.90), not a fixed class list, so
  // it holds across both classification taxonomies.
  const highQuality = Math.abs(busaRate - 0.9) < 1e-9
  const navAumRatio = navM > 0 && aumM > 0 ? (navM / aumM).toFixed(2) : ''
  const excluded = !lp.inc || lp.cls === 'Excluded'
  const uecM = excluded ? 0 : Math.min(ucM, concLimitM)
  const concExcessM = Math.max(0, ucM - uecM)
  const ubbM = uecM * busaRate
  const deltaM = ubbM - abbM
  return {
    ...lp, ucM, abbM, uecM, ubbM, deltaM, concExcessM, busaRate, highQuality, navAumRatio,
    agentExcessM: 0, agentExcess: '—',
    uec:   excluded ? '$0' : fmtM(uecM),
    ubb:   fmtM(ubbM),
    delta: fmtM(deltaM),
    rate:  `${(busaRate * 100).toFixed(0)}%`,
    abb:   lp.abb ?? '$0',
  }
}

export function computePortfolioBB(
  lps: LPRecord[],
  params = DEFAULT_FACILITY_PARAMS,
  busaRates: Record<string, number> = {},
): BBResult {
  const raw = lps.map(lp => computeLPRecord(lp, params, busaRates))
  const totalAllUC = raw.reduce((s, r) => s + r.ucM, 0)
  const computed = raw.map(lp => {
    const pctStr = lp.agentConc ?? ''
    const rawPct = parseFloat(pctStr) || 0
    const agentConcPct = pctStr.includes('%') ? rawPct / 100 : rawPct
    const agentConcLimitM = agentConcPct > 0 ? totalAllUC * agentConcPct : 0
    const agentExcessM = agentConcLimitM > 0 ? Math.max(0, lp.ucM - agentConcLimitM) : 0
    return { ...lp, agentExcessM, agentExcess: agentExcessM > 0 ? fmtM(agentExcessM) : '—' }
  })
  const included = computed.filter(r => r.inc && r.cls !== 'Excluded')
  const totalUBB = included.reduce((s, r) => s + r.ubbM, 0)
  const totalABB = computed.reduce((s, r) => s + r.abbM, 0)
  const totalUEC = included.reduce((s, r) => s + r.uecM, 0)
  const totalUC  = included.reduce((s, r) => s + r.ucM,  0)
  const bbDelta  = totalUBB - totalABB
  const ear      = totalUEC > 0 ? totalUBB / totalUEC : 0
  const agentEar = totalUEC > 0 ? totalABB / totalUEC : 0
  const breaches: BBBreachResult[] = []
  if (totalUBB > 0) {
    included.forEach(lp => { const pct = lp.ubbM / totalUBB; if (pct > 0.15) breaches.push({ rule: 'Single LP Concentration', entity: lp.name, value: fmtPct(pct), limit: '15%', severity: 'breach' }) })
    const sorted = [...included].sort((a, b) => b.ubbM - a.ubbM)
    const top10Pct = sorted.slice(0, 10).reduce((s, r) => s + r.ubbM, 0) / totalUBB
    if (top10Pct > 0.60) breaches.push({ rule: 'Top-10 LP Concentration', entity: 'Top 10 LPs', value: fmtPct(top10Pct), limit: '60%', severity: 'breach' })
    else if (top10Pct > 0.50) breaches.push({ rule: 'Top-10 LP Concentration', entity: 'Top 10 LPs', value: fmtPct(top10Pct), limit: '60%', severity: 'warning' })
    // "Unrated" = any included LP outside the rated tier. Stated as the complement of the rated
    // classes so it holds for both the legacy taxonomy (non-'Rated' included = the old explicit
    // list) and the UBS taxonomy (non-'Rated Investor' included).
    const RATED_CLASSES = ['Rated', 'Rated Investor']
    const unratedPct = included.filter(r => !RATED_CLASSES.includes(r.cls)).reduce((s,r) => s+r.ubbM, 0) / totalUBB
    if (unratedPct > 0.50) breaches.push({ rule: 'Unrated Aggregate Concentration', entity: 'Unrated LPs', value: fmtPct(unratedPct), limit: '50%', severity: 'breach' })
    const nonUSPct = included.filter(r => r.region !== 'North America').reduce((s,r) => s+r.ubbM, 0) / totalUBB
    if (nonUSPct > 0.30) breaches.push({ rule: 'Non-US LP Concentration', entity: 'Non-US LPs', value: fmtPct(nonUSPct), limit: '30%', severity: 'breach' })
  }
  return { lps: computed, summary: { totalUBB, totalABB, bbDelta, ear, agentEar, earDelta: ear - agentEar, totalUEC, totalUC, totalConcExcess: computed.reduce((s,r) => s+r.concExcessM, 0), includedCount: included.length, excludedCount: computed.filter(r => r.cls === 'Excluded').length, reclassCount: computed.filter(r => r.rcl).length, calculatedAt: new Date(), params }, breaches }
}

// ── Selector functions (API-first) ────────────────────────────────────────────

export interface FacilityBBSnapshotView {
  summary: Record<string, unknown>
  /** Concentration breaches persisted with the snapshot — the engine's verdict against the
   *  Concentration Limits config at run time. */
  breaches: BBBreach[]
}

export async function getFacilityBBSnapshot(facilityId: number): Promise<FacilityBBSnapshotView | null> {
  const snapshot = await api.bb.latestSnapshot(facilityId)
  const summary = (snapshot?.result?.summary as unknown as Record<string, unknown>) ?? null
  if (!summary) return null
  return { summary, breaches: snapshot?.result?.breaches ?? [] }
}

export async function getFacilitySummaryExt(facilityId: number): Promise<BBSummaryExt | null> {
  return await api.bb.summaryExt(facilityId)
}
