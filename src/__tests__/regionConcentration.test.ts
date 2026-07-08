import { describe, it, expect } from 'vitest'
import { computePortfolioBB } from '../services/bbCalculationService'
import type { LPRecord } from '../services/lpService'

// Regression guard for the Non-US concentration rule. It historically string-matched the display
// value `region === 'North America'`, so a token like "NAM|US|DE" or a relabelled region would
// silently flip the 30% test. It now derives the region code via regionOf(), which must treat
// both structured tokens and legacy free text correctly.

const RATED = { Rated: 0.9 }

// Minimal LP: only the fields the engine reads for this rule. Advance rate 90%, $100M uncalled
// (capped at the $25M default concentration limit → $22.5M UBB each), so equal LPs split UBB evenly.
const lp = (region: string): LPRecord =>
  ({ name: `LP-${region}`, inc: true, cls: 'Rated', uc: '$100M', rate: '90%', region } as unknown as LPRecord)

const nonUsBreach = (lps: LPRecord[]) =>
  computePortfolioBB(lps, undefined, RATED).breaches.find(b => b.rule === 'Non-US LPRecord Concentration')

describe('Non-US concentration rule keys off the region token, not the label', () => {
  it('treats North-American tokens (incl. Delaware) as US → no Non-US breach', () => {
    expect(nonUsBreach([lp('NAM|US|DE'), lp('NAM|US|'), lp('NAM|CA|ON')])).toBeUndefined()
  })

  it('fires when non-NAM tokens exceed 30% of UBB', () => {
    // 1 NAM + 2 EMEA of equal UBB → non-US = 66.7% > 30%
    const breach = nonUsBreach([lp('NAM|US|DE'), lp('EMEA|LU|'), lp('EMEA|IE|')])
    expect(breach).toBeDefined()
    expect(breach!.limit).toBe('30%')
  })

  it('still classifies legacy free-text "North America" as US (tolerant, pre-backfill)', () => {
    expect(nonUsBreach([lp('North America'), lp('North America')])).toBeUndefined()
    expect(nonUsBreach([lp('North America'), lp('Europe'), lp('Europe')])).toBeDefined()
  })
})
