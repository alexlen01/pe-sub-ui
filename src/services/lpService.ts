import { api } from './api'
import type { LPRecord as LPRecordType } from '../types'

export type LPRecord = LPRecordType

// ── API exports ────────────────────────────────────────────────────────────────

export async function getLPs(): Promise<LPRecord[]> {
  return api.lpRecords.list({})
}

export async function getLPByName(name: string): Promise<LPRecord | null> {
  const matches = await api.lpRecords.lookup(name)
  return matches.find(lp => lp.investorName === name) ?? null
}

export async function getLPsForFacility(facilityId: number): Promise<LPRecord[]> {
  return api.lpRecords.list({ facilityId })
}

export async function lookupLPsByName(name: string): Promise<LPRecord[]> {
  return api.lpRecords.lookup(name)
}
