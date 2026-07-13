import type { BBSummary } from '../types/bb'
import { formatPercentageFraction, formatSignedPercentageFraction } from './percentage'

export type ExecRow = {
  metric: string
  ubs: string
  agent: string
  bold?: boolean
  delta?: boolean
}

// Parses "$138.6M" → 138.6. Returns 0 for any unparseable input (e.g. "—").
export function parseM(s: string | null | undefined): number {
  if (!s) return 0
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

export function fmtM(n: number): string { return `$${n.toFixed(1)}M` }
export function fmtPct(n: number): string { return formatPercentageFraction(n) }
export function fmtDeltaM(n: number): string {
  const rounded = Number(Math.abs(n).toFixed(1))
  if (rounded === 0) return `$${rounded.toFixed(1)}M`
  return `${n < 0 ? '-' : '+'}$${rounded.toFixed(1)}M`
}
export function fmtDeltaPct(n: number): string {
  return formatSignedPercentageFraction(n)
}

// Builds the 5 Executive Summary rows directly from a persisted Shadow BB snapshot's numeric
// summary (no string parsing). Returns [] when no snapshot exists yet, so the caller can fall
// through to its "No Shadow BB this cycle" empty state.
export function buildExecRowsFromSummary(summary: BBSummary | null | undefined): ExecRow[] {
  if (!summary) return []

  const uecM = summary.ear > 0 ? summary.totalUBB / summary.ear : 0

  return [
    { metric: 'Total Eligible Uncalled', ubs: fmtM(uecM),                    agent: fmtM(uecM)                    },
    { metric: 'Total Borrowing Base',    ubs: fmtM(summary.totalUBB),        agent: fmtM(summary.totalABB), bold: true },
    { metric: 'BB Delta',                ubs: fmtDeltaM(summary.bbDelta),    agent: '',                     delta: true },
    { metric: 'Effective Advance Rate',  ubs: fmtPct(summary.ear),           agent: fmtPct(summary.agentEar)      },
    { metric: 'EAR Delta',               ubs: fmtDeltaPct(summary.earDelta), agent: '',                     delta: true },
  ]
}
