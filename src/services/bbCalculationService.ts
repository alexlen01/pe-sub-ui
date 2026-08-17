// Preview-only client math — authoritative BB figures (per-row results, summary totals,
// breaches) always come from the API's Shadow BB run; computeLPRecord exists solely so the
// LP record panel can preview unsaved edits before the next run.
import { api, type BBSummaryExt } from './api'
export type { BBSummaryExt }
import type { LPRecord } from './lpService'
import type { BBBreach, ComputedLP as ComputedServerLP } from '../types/bb'
import { formatPercentageFraction } from '../utils/percentage'

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

export function fmtPct(n: number): string { return formatPercentageFraction(n) }

/** An explicit advance rate as a fraction, or null when the LP carries none. The API serves
 *  `ubsAdvanceRate` as a raw fraction (0.90), but unsaved edits from the Run Shadow BB and LP
 *  record screens are still typed text ("90%", "90", "0.90"), so both forms are accepted.
 *  An explicit zero is a real rate, not "missing" — only null/''/unparseable fall through. */
function explicitAdvanceRate(raw: number | string | null | undefined): number | null {
  if (raw == null) return null
  const n = typeof raw === 'number' ? raw : parseFloat(raw.replace('%', '').trim())
  if (!Number.isFinite(n)) return null
  return n > 1 ? n / 100 : n
}

// Advance rate (as a fraction) for an LP. An explicit per-LP rate — the UBS Advance Rate assigned
// on the Run Shadow BB screen — takes precedence; otherwise fall back to the DB-backed BUSA
// schedule keyed by LP category. This keeps the engine correct for both the legacy LP Master
// taxonomy ('Rated', 'Unrated >2bn', …) and the UBS LP Category taxonomy ('Rated Investor', …)
// the Shadow BB seeds from the Agent Advance Rate.
// `ubsLpCategory` is widened to string here: at runtime it carries either taxonomy.
// Mirrors the API's advanceRateFraction(LpRecord).
export function advanceRateFraction(
  lp: { ubsAdvanceRate?: number | string | null; ubsLpCategory?: string | null },
  busaRates: Record<string, number>,
): number {
  const explicit = explicitAdvanceRate(lp.ubsAdvanceRate)
  if (explicit !== null) return explicit
  return busaRates[lp.ubsLpCategory ?? ''] ?? 0
}

export const DEFAULT_FACILITY_PARAMS = { concLimitM: 25.0 }


// ── Calculation engine ────────────────────────────────────────────────────────

export interface ComputedLPRecord extends LPRecord {
  ucM: number; abbM: number; uecM: number; ubbM: number; deltaM: number
  concExcessM: number; busaRate: number; highQuality: boolean; navAumRatio: string
  agentExcessM: number
  uncalledEligibleCapital: string; ubsBorrowingBase: string; delta: string; rate: string; agentExcess: string
}

export function computeLPRecord(
  LPRecord: LPRecord,
  params = DEFAULT_FACILITY_PARAMS,
  busaRates: Record<string, number> = {},
): ComputedLPRecord {
  const concLimitM = (LPRecord as LPRecord & { concLimitM?: number }).concLimitM ?? params.concLimitM ?? 25.0
  const busaRate = advanceRateFraction(LPRecord, busaRates)
  const ucM  = (LPRecord as LPRecord & { ucM?: number }).ucM != null ? (LPRecord as LPRecord & { ucM?: number }).ucM! : parseM(LPRecord.uncalledCapital)
  const abbM = parseM(LPRecord.agentBorrowingBase)
  const navM = parseM(LPRecord.nav)
  const aumM = parseM(LPRecord.aum)
  // High Quality tracks the advance rate (UBS Advance Rate = 0.90), not a fixed class list, so
  // it holds across both classification taxonomies.
  const highQuality = Math.abs(busaRate - 0.9) < 1e-9
  const navAumRatio = navM > 0 && aumM > 0 ? (navM / aumM).toFixed(2) : ''
  const excluded = !LPRecord.included || LPRecord.ubsLpCategory === 'Excluded'
  const uecM = excluded ? 0 : Math.min(ucM, concLimitM)
  const concExcessM = Math.max(0, ucM - uecM)
  const ubbM = uecM * busaRate
  const deltaM = ubbM - abbM
  return {
    ...LPRecord, ucM, abbM, uecM, ubbM, deltaM, concExcessM, busaRate, highQuality, navAumRatio,
    agentExcessM: 0, agentExcess: '—',
    uncalledEligibleCapital:   excluded ? '$0' : fmtM(uecM),
    ubsBorrowingBase:   fmtM(ubbM),
    delta: fmtM(deltaM),
    rate:  formatPercentageFraction(busaRate),
    agentBorrowingBase:   LPRecord.agentBorrowingBase ?? '$0',
  }
}

// ── Selector functions (API-first) ────────────────────────────────────────────

export interface FacilityBBSnapshotView {
  summary: Record<string, unknown>
  /** Concentration breaches persisted with the snapshot — the engine's verdict against the
   *  Concentration Limits config at run time. */
  breaches: BBBreach[]
  /** Per-LP engine results persisted with the snapshot — the authoritative row-level figures. */
  lps: ComputedServerLP[]
}

export async function getFacilityBBSnapshot(facilityId: number): Promise<FacilityBBSnapshotView | null> {
  const snapshot = await api.bb.latestSnapshot(facilityId)
  const summary = (snapshot?.result?.summary as unknown as Record<string, unknown>) ?? null
  if (!summary) return null
  return { summary, breaches: snapshot?.result?.breaches ?? [], lps: snapshot?.result?.lps ?? [] }
}

export async function getFacilitySummaryExt(facilityId: number): Promise<BBSummaryExt | null> {
  return await api.bb.summaryExt(facilityId)
}
