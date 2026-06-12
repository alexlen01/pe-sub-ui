import { api, type BBSummaryExt } from './api'
export type { BBSummaryExt }
import type { LPRecord } from './lpService'

// ── Advance rate schedules ────────────────────────────────────────────────────

export const BUSA_RATES: Record<string, number> = {
  'Rated':         0.90,
  'Unrated >2bn':  0.75,
  'Unrated 1–2bn': 0.65,
  'Eligible':      0.50,
  'Excluded':      0.00,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function parseM(s: string | undefined | null): number {
  if (!s || s === '$0') return 0
  const m = String(s).match(/\$?([\d,.]+)M/)
  return m ? parseFloat(m[1].replace(',', '')) : 0
}

export function fmtM(n: number): string {
  if (n === 0) return '$0'
  const abs = Math.abs(n)
  return `${n < 0 ? '–' : ''}$${abs.toFixed(1)}M`
}

export function fmtPct(n: number): string { return `${(n * 100).toFixed(1)}%` }

export const DEFAULT_FACILITY_PARAMS = { concLimitM: 25.0 }


// ── Calculation engine ────────────────────────────────────────────────────────

export interface ComputedLPRecord extends LPRecord {
  ucM: number; abbM: number; uecM: number; ubbM: number; deltaM: number
  concExcessM: number; busaRate: number; highQuality: boolean; navAumRatio: string
  uec: string; ubb: string; delta: string; rate: string
}

export interface BBSummary {
  totalUBB: number; totalABB: number; bbDelta: number; ear: number
  agentEar: number; earDelta: number; totalUEC: number; totalUC: number
  totalConcExcess: number; includedCount: number; excludedCount: number
  reclassCount: number; calculatedAt: Date; params: typeof DEFAULT_FACILITY_PARAMS
}

export interface BBBreachResult { rule: string; entity: string; value: string; limit: string; severity: 'breach' | 'warning' }
export interface BBResult { lps: ComputedLPRecord[]; summary: BBSummary; breaches: BBBreachResult[] }

export function computeLPRecord(lp: LPRecord, params = DEFAULT_FACILITY_PARAMS): ComputedLPRecord {
  const concLimitM = (lp as LPRecord & { concLimitM?: number }).concLimitM ?? params.concLimitM ?? 25.0
  const busaRate = BUSA_RATES[lp.cls] ?? 0
  const ucM  = (lp as LPRecord & { ucM?: number }).ucM != null ? (lp as LPRecord & { ucM?: number }).ucM! : parseM(lp.uc)
  const abbM = parseM(lp.abb)
  const navM = parseM(lp.nav)
  const aumM = parseM(lp.aum)
  const highQuality = ['Rated', 'Unrated >2bn', 'Unrated 1–2bn'].includes(lp.cls)
  const navAumRatio = navM > 0 && aumM > 0 ? (navM / aumM).toFixed(2) : ''
  const excluded = !lp.inc || lp.cls === 'Excluded'
  const uecM = excluded ? 0 : Math.min(ucM, concLimitM)
  const concExcessM = Math.max(0, ucM - uecM)
  const ubbM = uecM * busaRate
  const deltaM = ubbM - abbM
  return {
    ...lp, ucM, abbM, uecM, ubbM, deltaM, concExcessM, busaRate, highQuality, navAumRatio,
    uec:   excluded ? '$0' : fmtM(uecM),
    ubb:   fmtM(ubbM),
    delta: fmtM(deltaM),
    rate:  `${(busaRate * 100).toFixed(0)}%`,
    abb:   lp.abb ?? '$0',
  }
}

export function computePortfolioBB(lps: LPRecord[], params = DEFAULT_FACILITY_PARAMS): BBResult {
  const computed = lps.map(lp => computeLPRecord(lp, params))
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
    const unratedPct = included.filter(r => ['Unrated >2bn','Unrated 1–2bn','Eligible'].includes(r.cls)).reduce((s,r) => s+r.ubbM, 0) / totalUBB
    if (unratedPct > 0.50) breaches.push({ rule: 'Unrated Aggregate Concentration', entity: 'Unrated LPs', value: fmtPct(unratedPct), limit: '50%', severity: 'breach' })
    const nonUSPct = included.filter(r => r.region !== 'North America').reduce((s,r) => s+r.ubbM, 0) / totalUBB
    if (nonUSPct > 0.30) breaches.push({ rule: 'Non-US LP Concentration', entity: 'Non-US LPs', value: fmtPct(nonUSPct), limit: '30%', severity: 'breach' })
  }
  return { lps: computed, summary: { totalUBB, totalABB, bbDelta, ear, agentEar, earDelta: ear - agentEar, totalUEC, totalUC, totalConcExcess: computed.reduce((s,r) => s+r.concExcessM, 0), includedCount: included.length, excludedCount: computed.filter(r => r.cls === 'Excluded').length, reclassCount: computed.filter(r => r.rcl).length, calculatedAt: new Date(), params }, breaches }
}

// ── Selector functions (API-first) ────────────────────────────────────────────

export function getBusaRates() { return BUSA_RATES }

export async function getFacilityBBSnapshot(live: boolean, facilityId: number): Promise<Record<string, unknown> | null> {
  if (!live) return null
  const snapshot = await api.bb.latestSnapshot(facilityId)
  return (snapshot.result?.summary as unknown as Record<string, unknown>) ?? null
}

export async function getFacilitySummaryExt(live: boolean, facilityId: number): Promise<BBSummaryExt | null> {
  if (!live) return null
  return await api.bb.summaryExt(facilityId)
}
