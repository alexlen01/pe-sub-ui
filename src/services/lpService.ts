import { LP_DATA, DONUT_DATA } from '../data/lpData'
import { formatLastRun } from './facilityService'
import { reportApiMode } from './apiStatus'
import { api } from './api'

export type LPRecord = (typeof LP_DATA)[0]

function _localGetLPs(): LPRecord[] { return LP_DATA }
function _localGetLPById(rank: number): LPRecord | null { return LP_DATA.find(lp => lp.rank === rank) ?? null }
function _localGetLPsForFacility(): LPRecord[] { return LP_DATA }
function _localGetFacilityNames(): string[] { return Object.keys(DONUT_DATA) }

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
  try {
    const data = (await api.lps.list({})) as unknown as LPRecord[]
    reportApiMode('live')
    return data
  } catch {
    reportApiMode('prototype')
    return _localGetLPs()
  }
}

export async function getLPById(rank: number): Promise<LPRecord | null> {
  try {
    const data = (await api.lps.get(rank)) as unknown as LPRecord
    reportApiMode('live')
    return data
  } catch {
    reportApiMode('prototype')
    return _localGetLPById(rank)
  }
}

export async function getLPsForFacility(facilityId: number): Promise<LPRecord[]> {
  try {
    const data = (await api.lps.list({ facilityId })) as unknown as LPRecord[]
    reportApiMode('live')
    return data
  } catch {
    reportApiMode('prototype')
    return _localGetLPsForFacility()
  }
}

export function getFacilityNames(): string[] { return _localGetFacilityNames() }

export function getDonutData() { return _localGetDonutData() }
