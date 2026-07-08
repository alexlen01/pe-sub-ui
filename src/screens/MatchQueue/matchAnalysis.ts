// Match Analysis panel data logic, decoupled from the MatchQueue UI so it can be unit-tested.
//
// The backend returns a real `matchDetails` payload (Solution Design §6.5) — the normalised agent
// name, the winning confidence band, and the ranked top-5 LP Master candidates with their
// Jaro-Winkler / Levenshtein / combined scores. The panel renders that verbatim. When the backend
// sends no candidates the panel shows none — the presentation layer never fabricates matches.

import type { MatchAnalysis, MatchBand, MatchingConfig } from '../../services/api'

export interface CandidateRow {
  name:     string
  jw:       number
  lev:      number
  combined: number
  verdict:  string
}

export interface AnalysisRowInput {
  agentName:     string
  masterName:    string | null
  matchDetails?: MatchAnalysis | null
}

// Backend confidence band → panel verdict label (§6.4).
export const BAND_VERDICT: Record<MatchBand, string> = {
  AUTO_ACCEPT: 'Auto-accept',
  REVIEW_HIGH: 'Review',
  REVIEW_LOW:  'Review',
  NO_MATCH:    'No match',
}

/**
 * Candidate rows for the Match Analysis panel — the backend `matchDetails` mapped to display rows.
 * Returns [] when the backend supplied no candidates; the panel renders an empty state.
 */
export function analysisCandidates(row: AnalysisRowInput, _config: MatchingConfig): CandidateRow[] {
  const real = row.matchDetails?.candidates
  if (real && real.length > 0) {
    return real.map(c => ({
      name:     c.name,
      jw:       c.jw,
      lev:      c.lev,
      combined: c.combined,
      verdict:  BAND_VERDICT[c.band] ?? 'No match',
    }))
  }
  return []
}

/** The normalised agent name shown in the panel — backend value when present, else the caller's trace. */
export function normalisedAgentName(row: AnalysisRowInput, reconstructed: string): string {
  return row.matchDetails?.normalized ?? reconstructed
}
