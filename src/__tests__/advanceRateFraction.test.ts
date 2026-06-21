import { describe, it, expect } from 'vitest'
import { advanceRateFraction, BUSA_RATES } from '../services/bbCalculationService'

// The BB engine must honour an explicit per-LP advance rate (the UBS Advance Rate assigned on the
// Run Shadow BB screen) rather than re-deriving it from the classification schedule. Once Step 5
// seeds the UBS LP Classification taxonomy ('Rated Investor', …), the legacy BUSA_RATES schedule
// no longer has a matching key, so without this precedence the UBS BB would zero out.

describe('advanceRateFraction', () => {
  it('uses the explicit per-LP rate over the classification schedule', () => {
    // cls would resolve to 0 via the schedule; the explicit "90%" must win (the UBS-class case).
    expect(advanceRateFraction({ rate: '90%', cls: 'Excluded' })).toBeCloseTo(0.9)
    expect(advanceRateFraction({ rate: '75%', cls: 'Excluded' })).toBeCloseTo(0.75)
  })

  it('accepts percent strings, bare whole numbers, and decimal fractions', () => {
    expect(advanceRateFraction({ rate: '65%',  cls: 'Excluded' })).toBeCloseTo(0.65)
    expect(advanceRateFraction({ rate: '65',   cls: 'Excluded' })).toBeCloseTo(0.65)
    expect(advanceRateFraction({ rate: '0.65', cls: 'Excluded' })).toBeCloseTo(0.65)
  })

  it('falls back to the BUSA schedule when no explicit rate is present', () => {
    expect(advanceRateFraction({ rate: '',   cls: 'Rated' })).toBe(BUSA_RATES.Rated)
    expect(advanceRateFraction({ rate: '',   cls: 'Unrated >2bn' })).toBe(BUSA_RATES['Unrated >2bn'])
    expect(advanceRateFraction({ rate: '0%', cls: 'Rated' })).toBe(0) // 0% is explicit, not "missing"
  })

  it('returns 0 for an unknown class with no rate', () => {
    expect(advanceRateFraction({ rate: '', cls: 'Excluded' })).toBe(0)
  })
})
