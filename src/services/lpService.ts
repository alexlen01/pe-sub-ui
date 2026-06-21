import { api } from './api'
import type { LP } from '../types'

export type LPRecord = LP

// ── API exports ────────────────────────────────────────────────────────────────

export async function getLPs(): Promise<LPRecord[]> {
  return api.lps.list({})
}

export async function getLPByName(name: string): Promise<LPRecord | null> {
  const matches = await api.lps.lookup(name)
  return matches.find(lp => lp.name === name) ?? null
}

export async function getLPsForFacility(facilityId: number): Promise<LPRecord[]> {
  return api.lps.list({ facilityId })
}

export async function lookupLPsByName(name: string): Promise<LPRecord[]> {
  return api.lps.lookup(name)
}
