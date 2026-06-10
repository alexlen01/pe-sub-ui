import type { FacilityRow } from '../services/facilityService'

export type ExecRow = {
  metric: string
  ubs: string
  agent: string
  bold?: boolean
  delta?: boolean
}

const DASH = '—'

// Parses "$138.6M" → 138.6. Returns 0 for any unparseable input (e.g. "—").
export function parseM(s: string | null | undefined): number {
  if (!s) return 0
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

// Parses "87.4%" → 0.874. Returns 0 for any unparseable input (e.g. "—").
export function parsePct(s: string | null | undefined): number {
  if (!s) return 0
  const n = parseFloat(s.replace('%', '').replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n / 100
}

function fmtM(n: number): string { return `$${n.toFixed(1)}M` }
function fmtPct(n: number): string { return `${(n * 100).toFixed(1)}%` }
function fmtDeltaM(n: number): string { return `${n < 0 ? '-' : '+'}$${Math.abs(n).toFixed(1)}M` }
function fmtDeltaPct(n: number): string { return `${n < 0 ? '-' : '+'}${Math.abs(n * 100).toFixed(1)}%` }

function isPlaceholder(s: string | null | undefined): boolean {
  return !s || s.trim() === DASH
}

// Builds the 5 Executive Summary rows for a facility.
// Returns — for computed fields when source values are not yet populated (live mode).
export function buildExecRows(f: FacilityRow | null): ExecRow[] {
  if (!f) return []

  const hasData = !isPlaceholder(f.ubsBB) && !isPlaceholder(f.agentBB) && !isPlaceholder(f.ear)

  const ubbM      = parseM(f.ubsBB)
  const abbM      = parseM(f.agentBB)
  const earF      = parsePct(f.ear)
  const uecM      = earF > 0 ? ubbM / earF : 0
  const agentEarF = uecM > 0 ? abbM / uecM : 0

  return [
    { metric: 'Total Eligible Uncalled', ubs: hasData ? fmtM(uecM)                      : DASH, agent: hasData ? fmtM(uecM)       : DASH },
    { metric: 'Total Borrowing Base',    ubs: f.ubsBB,                                           agent: f.agentBB, bold: true              },
    { metric: 'BB Delta',                ubs: hasData ? fmtDeltaM(ubbM - abbM)           : DASH, agent: '',        delta: true             },
    { metric: 'Effective Advance Rate',  ubs: f.ear,                                             agent: hasData ? fmtPct(agentEarF) : DASH  },
    { metric: 'EAR Delta',               ubs: hasData ? fmtDeltaPct(earF - agentEarF)    : DASH, agent: '',        delta: true             },
  ]
}
