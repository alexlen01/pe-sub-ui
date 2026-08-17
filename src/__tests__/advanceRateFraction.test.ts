import { describe, it, expect } from 'vitest'
import { advanceRateFraction } from '../services/bbCalculationService'

// One legacy LP Master key and one UBS LP Category key; 'Excluded' is deliberately absent so the
// unmatched-key path is exercised. buildBusaRateFractions produces this shape from the DB config.
const testBusaRates: Record<string, number> = {
  Rated: 0.9,
  'Rated Investor': 0.9,
}

// The BB engine must honour an explicit per-LP advance rate (the UBS Advance Rate assigned on the
// Run Shadow BB screen) ahead of the classification schedule — an analyst's decision outranks the
// class default, and an LP whose class is missing from the schedule would otherwise zero its UBS BB.

describe('advanceRateFraction', () => {
  it('uses the explicit per-LP rate over the classification schedule', () => {
    // The category would resolve to 0 via the schedule; the explicit "90%" must win.
    expect(advanceRateFraction({ ubsAdvanceRate: '90%', ubsLpCategory: 'Excluded' }, testBusaRates)).toBeCloseTo(0.9)
    expect(advanceRateFraction({ ubsAdvanceRate: '75%', ubsLpCategory: 'Excluded' }, testBusaRates)).toBeCloseTo(0.75)
  })

  it('accepts the fraction the API serves on ubsAdvanceRate', () => {
    // LpRecordDto sends advance rates as BigDecimal fractions (0.90 = 90%), not display strings.
    expect(advanceRateFraction({ ubsAdvanceRate: 0.9, ubsLpCategory: 'Excluded' }, testBusaRates)).toBeCloseTo(0.9)
    expect(advanceRateFraction({ ubsAdvanceRate: 0, ubsLpCategory: 'Rated' }, testBusaRates)).toBe(0)
    // null is "no rate stored" — fall through to the schedule, unlike an explicit 0.
    expect(advanceRateFraction({ ubsAdvanceRate: null, ubsLpCategory: 'Rated' }, testBusaRates)).toBe(0.9)
  })

  it('accepts percent strings, bare whole numbers, and decimal fractions', () => {
    expect(advanceRateFraction({ ubsAdvanceRate: '65%',  ubsLpCategory: 'Excluded' }, testBusaRates)).toBeCloseTo(0.65)
    expect(advanceRateFraction({ ubsAdvanceRate: '65',   ubsLpCategory: 'Excluded' }, testBusaRates)).toBeCloseTo(0.65)
    expect(advanceRateFraction({ ubsAdvanceRate: '0.65', ubsLpCategory: 'Excluded' }, testBusaRates)).toBeCloseTo(0.65)
  })

  it('falls back to the BUSA schedule when no explicit rate is present', () => {
    // The schedule is a flat key lookup, so it is taxonomy-agnostic: legacy LP Master keys and the
    // UBS LP Category keys Step 5 seeds both resolve. That matters because a UBS-taxonomy LP
    // committed without a stored rate would otherwise render 0% / $0 in the Rate and UBS BB columns.
    expect(advanceRateFraction({ ubsAdvanceRate: '', ubsLpCategory: 'Rated' }, testBusaRates)).toBe(0.9)
    expect(advanceRateFraction({ ubsAdvanceRate: '', ubsLpCategory: 'Rated Investor' }, testBusaRates)).toBe(0.9)
    expect(advanceRateFraction({ ubsAdvanceRate: '0%', ubsLpCategory: 'Rated' }, testBusaRates)).toBe(0) // 0% is explicit, not "missing"
  })

  it('returns 0 for a class absent from the schedule with no rate', () => {
    expect(advanceRateFraction({ ubsAdvanceRate: '', ubsLpCategory: 'Excluded' }, testBusaRates)).toBe(0)
    expect(advanceRateFraction({ ubsAdvanceRate: '', ubsLpCategory: 'No Such Class' }, testBusaRates)).toBe(0)
  })
})
