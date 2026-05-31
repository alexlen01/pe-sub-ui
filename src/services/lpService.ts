import { LP_DATA, DONUT_DATA } from '../data/lpData'
import { formatLastRun } from './facilityService'
import { api } from './api'

export type LPRecord = (typeof LP_DATA)[0]

function _localGetDonutData() {
  function formatPeriod(isoMonth: string) {
    if (!isoMonth) return '—'
    const [y, m] = isoMonth.split('-')
    return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  return Object.fromEntries(
    Object.entries(DONUT_DATA).map(([k, v]) => [k, { ...v, lastBBRun: formatLastRun(v.lastBBRun), lastBBSub: formatPeriod(v.lastBBSub) }])
  )
}

// ── API-first exports ─────────────────────────────────────────────────────────

export async function getLPs(): Promise<LPRecord[]> {
  try { return (await api.lps.list({})) as unknown as LPRecord[] }
  catch { return [] }
}

export async function getLPById(rank: number): Promise<LPRecord | null> {
  try { return (await api.lps.get(rank)) as unknown as LPRecord }
  catch { return null }
}

export async function getLPsForFacility(_facilityName: string): Promise<LPRecord[]> {
  try {
    const facilityId = 1 // TODO: map facilityName → facilityId once facilities API is wired
    return (await api.lps.list({ facilityId })) as unknown as LPRecord[]
  } catch {
    return []
  }
}

export function getLPsForFacilitySync(_facilityName: string): LPRecord[] { return [] }

export function getFacilityNames(): string[] { return [] }

export function getDonutData() { return _localGetDonutData() }
