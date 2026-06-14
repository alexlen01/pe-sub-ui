// Match Analysis panel data logic, decoupled from the MatchQueue UI so it can be unit-tested.
//
// In LIVE mode the backend returns a real `matchDetails` payload (Solution Design §6.5) — the
// normalised agent name, the winning confidence band, and the ranked top-5 LP Master candidates
// with their Jaro-Winkler / Levenshtein / combined scores. The panel renders that verbatim.
//
// In PROTOTYPE mode there is no backend, so `buildCandidates` reconstructs a plausible candidate
// list client-side (the matched name plus two deterministic decoys) for demonstration only.

import type { MatchAnalysis, MatchBand } from '../../services/api'
import { normaliseName, jwSim, levSim, combineScores } from '../../utils/fuzzyMatch'
import { DEFAULT_THRESHOLDS } from '../../config/matchingConfig'

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

// Prototype-only verdict derived from the 2-threshold score bands.
export function verdictFor(score: number): string {
  return score >= DEFAULT_THRESHOLDS.autoAccept ? 'Auto-accept'
       : score >= DEFAULT_THRESHOLDS.reviewQueue ? 'Review queue'
       : 'Below threshold'
}

const strHash = (s: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0) / 0x100000000
}
const DECOY_SUFFIXES = ['Capital Partners', 'Capital Management', 'Asset Management', 'Investment Group', 'Capital Advisors', 'Investment Partners', 'Capital Fund', 'Investment Trust']
function makeDecoyName(seed: string, words: string[], salt: string) {
  const r = strHash(seed + salt)
  const sfx = DECOY_SUFFIXES[Math.floor(r * DECOY_SUFFIXES.length)]
  const meaningful = words.filter(w => w.length > 3)
  const base = meaningful.length >= 2
    ? `${meaningful[0]} ${meaningful[Math.floor(strHash(seed + salt + '2') * (meaningful.length - 1)) + 1]}`
    : meaningful[0] || words[0]
  return `${base} ${sfx}`
}

/** Prototype reconstruction: the matched name plus two deterministic decoys (no backend data). */
export function buildCandidates(r: AnalysisRowInput): CandidateRow[] {
  const normAgent = normaliseName(r.agentName)
  if (!r.masterName) return []
  const normMaster = normaliseName(r.masterName)
  const jw1 = jwSim(normAgent, normMaster), lv1 = levSim(normAgent, normMaster), co1 = combineScores(jw1, lv1)
  const mWords = r.masterName.split(/\s+/)
  const d1 = makeDecoyName(r.masterName, mWords, 'α'), d2 = makeDecoyName(r.masterName, mWords, 'β')
  const jw2 = jwSim(normAgent, normaliseName(d1)), lv2 = levSim(normAgent, normaliseName(d1)), co2 = combineScores(jw2, lv2)
  const jw3 = jwSim(normAgent, normaliseName(d2)), lv3 = levSim(normAgent, normaliseName(d2)), co3 = combineScores(jw3, lv3)
  return [
    { name: r.masterName, jw: jw1, lev: lv1, combined: co1, verdict: verdictFor(co1) },
    { name: d1, jw: jw2, lev: lv2, combined: co2, verdict: 'Discarded' },
    { name: d2, jw: jw3, lev: lv3, combined: co3, verdict: 'Discarded' },
  ]
}

/**
 * Candidate rows for the Match Analysis panel. Prefers the real backend `matchDetails` (live mode);
 * falls back to the client-side reconstruction when absent (prototype mode).
 */
export function analysisCandidates(row: AnalysisRowInput): CandidateRow[] {
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
  return buildCandidates(row)
}

/** The normalised agent name shown in the panel — backend value in live mode, else the reconstruction. */
export function normalisedAgentName(row: AnalysisRowInput, reconstructed: string): string {
  return row.matchDetails?.normalized ?? reconstructed
}
