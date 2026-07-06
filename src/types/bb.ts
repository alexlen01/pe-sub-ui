import type { LPRecord } from './lp'

export interface ComputedLP extends LPRecord {
  uec: string
  uecM: number
  ubbM: number
  abbM: number
  deltaM: number
  concExcessM: number
  highQuality: boolean
}

export interface BBSummary {
  totalUBB: number
  totalABB: number
  bbDelta: number
  ear: number
  agentEar: number
  earDelta: number
  includedCount: number
  excludedCount: number
}

export type BreachType = 'single-lp' | 'top10' | 'unrated' | 'non-us'
export type BreachSeverity = 'breach' | 'warning'

export interface BBBreach {
  type: BreachType
  severity: BreachSeverity
  message: string
  value: number
  limit: number
}

export interface BBResult {
  lps: ComputedLP[]
  summary: BBSummary
  breaches: BBBreach[]
}

export interface BBSnapshot {
  id: number
  facilityId: number
  calculatedAt: string
  result: BBResult
}

export interface BBParams {
  concLimitM: number
}
