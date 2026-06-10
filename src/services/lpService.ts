import { LP_DATA, DONUT_DATA } from '../data/lpData'
import { formatLastRun } from './facilityService'
import { api } from './api'
import type { LP } from '../types'

export type LPRecord = LP

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

export async function getLPs(live: boolean): Promise<LPRecord[]> {
  if (!live) return _localGetLPs()
  return api.lps.list({})
}

export async function getLPById(live: boolean, rank: number): Promise<LPRecord | null> {
  if (!live) return _localGetLPById(rank)
  return api.lps.get(rank)
}

export async function getLPsForFacility(live: boolean, facilityId: number): Promise<LPRecord[]> {
  if (!live) return _localGetLPsForFacility()
  return api.lps.list({ facilityId })
}

export function getFacilityNames(): string[] { return _localGetFacilityNames() }

export function getDonutData() { return _localGetDonutData() }

export async function lookupLPsByName(live: boolean, name: string): Promise<LPRecord[]> {
  if (!live) {
    const q = name.toLowerCase()
    return LP_DATA.filter(lp => lp.name.toLowerCase().includes(q)).slice(0, 8)
  }
  return api.lps.lookup(name)
}
