import { describe, it, expect } from 'vitest'
import { analysisCandidates, normalisedAgentName, BAND_VERDICT } from '../screens/MatchQueue/matchAnalysis'
import type { MatchAnalysis, MatchingConfig } from '../services/api'

const matchingConfig: MatchingConfig = {
  thresholds: {
    autoAccept: 95,
    reviewQueue: 80,
    noMatch: 50,
    jwWeight: 0.6,
    levWeight: 0.4,
    stripSuffixes: true,
    caseFold: true,
    punctuation: true,
    abbrevExpand: true,
    retirementNormalize: true,
  },
  legalSuffixes: [
    { abbr: 'LPRecord', full: 'Limited Partnership', strip: true },
  ],
  knownAbbreviations: [],
  abbrevRegexMap: {},
}

// ── Live mode: real backend match_details (§6.5) ──────────────────────────────

const liveDetails: MatchAnalysis = {
  agentName:  'Texas Teachers Ret. Sys.',
  normalized: 'texas teachers retirement system',
  band:       'AUTO_ACCEPT',
  candidates: [
    { name: 'Texas Teachers Retirement System', jw: 100, lev: 100, combined: 100, band: 'AUTO_ACCEPT' },
    { name: 'Texas Municipal Retirement System', jw: 82,  lev: 61,  combined: 74,  band: 'REVIEW_LOW'  },
    { name: 'Teachers Insurance Annuity',        jw: 55,  lev: 30,  combined: 45,  band: 'NO_MATCH'    },
  ],
}

describe('analysisCandidates — live mode (backend match_details)', () => {
  it('maps backend candidates verbatim with band→verdict labels and preserves order', () => {
    const rows = analysisCandidates({
      agentName: 'Texas Teachers Ret. Sys.',
      masterName: 'Texas Teachers Retirement System',
      matchDetails: liveDetails,
    }, matchingConfig)

    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ name: 'Texas Teachers Retirement System', jw: 100, lev: 100, combined: 100, verdict: 'Auto-accept' })
    expect(rows[1].verdict).toBe('Review')   // REVIEW_LOW
    expect(rows[2].verdict).toBe('No match') // NO_MATCH
    // Scores are the real backend numbers, not a client-side reconstruction.
    expect(rows.map(r => r.combined)).toEqual([100, 74, 45])
  })

  it('does not fabricate decoys when real candidates are present', () => {
    const rows = analysisCandidates({
      agentName: 'Texas Teachers Ret. Sys.',
      masterName: 'Texas Teachers Retirement System',
      matchDetails: liveDetails,
    }, matchingConfig)
    // Every name must come from the backend payload — no synthetic "Capital Partners" decoys.
    const backendNames = new Set(liveDetails.candidates.map(c => c.name))
    for (const r of rows) expect(backendNames.has(r.name)).toBe(true)
  })
})

// ── No backend match_details: presentation layer fabricates nothing ───────────

describe('analysisCandidates — no backend match_details', () => {
  it('returns no candidates (the panel never reconstructs matches client-side)', () => {
    expect(analysisCandidates({ agentName: 'Brand New Investor XYZ', masterName: null }, matchingConfig)).toEqual([])
    // Even with a proposed master name, absent backend candidates yield an empty list.
    expect(analysisCandidates({ agentName: 'Blue Owl GP Stakes V', masterName: 'Blue Owl GP Stakes V' }, matchingConfig)).toEqual([])
  })
})

// ── normalisedAgentName ───────────────────────────────────────────────────────

describe('normalisedAgentName', () => {
  it('prefers the backend normalized value in live mode', () => {
    expect(normalisedAgentName({ agentName: 'X', masterName: null, matchDetails: liveDetails }, 'fallback'))
      .toBe('texas teachers retirement system')
  })

  it('falls back to the client-side reconstruction in prototype mode', () => {
    expect(normalisedAgentName({ agentName: 'X', masterName: null }, 'reconstructed value'))
      .toBe('reconstructed value')
  })
})

describe('BAND_VERDICT mapping (§6.4)', () => {
  it('covers all four confidence bands', () => {
    expect(BAND_VERDICT).toEqual({
      AUTO_ACCEPT: 'Auto-accept',
      REVIEW_HIGH: 'Review',
      REVIEW_LOW:  'Review',
      NO_MATCH:    'No match',
    })
  })
})
