import { describe, it, expect } from 'vitest'
import { analysisCandidates, normalisedAgentName, BAND_VERDICT } from '../screens/MatchQueue/matchAnalysis'
import type { MatchAnalysis } from '../services/api'

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
    })

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
    })
    // Every name must come from the backend payload — no synthetic "Capital Partners" decoys.
    const backendNames = new Set(liveDetails.candidates.map(c => c.name))
    for (const r of rows) expect(backendNames.has(r.name)).toBe(true)
  })
})

// ── Prototype mode: client-side reconstruction (no backend) ───────────────────

describe('analysisCandidates — prototype mode (no match_details)', () => {
  it('reconstructs the matched name plus two decoys when masterName is set', () => {
    const rows = analysisCandidates({ agentName: 'Blue Owl GP Stakes V', masterName: 'Blue Owl GP Stakes V' })
    expect(rows).toHaveLength(3)
    expect(rows[0].name).toBe('Blue Owl GP Stakes V')
    expect(rows[0].verdict).toBe('Auto-accept') // exact reconstruction scores 100
  })

  it('returns no candidates when there is no master match', () => {
    const rows = analysisCandidates({ agentName: 'Brand New Investor XYZ', masterName: null })
    expect(rows).toEqual([])
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
