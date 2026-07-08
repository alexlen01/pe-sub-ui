import { describe, expect, it } from 'vitest'
import {
  clsConcLimitBoundsForCls,
  clsConcLimitPctForCls,
} from '../services/configService'

// Mirrors the seeded cls_conc_limit_defaults / cls_conc_limit_bounds config keys
// (upper-bound defaults; accepted min/max ranges from Concentration_Limits.xls).
const eligCfg = {
  CLS_CONC_LIMIT_DEFAULTS: {
    'Rated Investor': 20.0,
    'Other Institutional': 7.5,
    'Excluded': 0.0,
  },
  CLS_CONC_LIMIT_BOUNDS: {
    'Rated Investor': { min: 15.0, max: 20.0 },
    'Other Institutional': { min: 5.0, max: 7.5 },
    'Excluded': { min: 0.0, max: 0.0 },
  },
}

describe('clsConcLimitPctForCls', () => {
  it('returns the upper-bound default for a known class', () => {
    expect(clsConcLimitPctForCls(eligCfg, 'Rated Investor')).toBe(20.0)
  })

  it('returns 0 for the Excluded bucket (hard zero)', () => {
    expect(clsConcLimitPctForCls(eligCfg, 'Excluded')).toBe(0)
  })

  it("returns '' for an unknown class or missing config", () => {
    expect(clsConcLimitPctForCls(eligCfg, 'No Such Class')).toBe('')
    expect(clsConcLimitPctForCls(null, 'Rated Investor')).toBe('')
  })
})

describe('clsConcLimitBoundsForCls', () => {
  it('returns the accepted min/max range for a known class', () => {
    expect(clsConcLimitBoundsForCls(eligCfg, 'Rated Investor')).toEqual({ min: 15.0, max: 20.0 })
    expect(clsConcLimitBoundsForCls(eligCfg, 'Other Institutional')).toEqual({ min: 5.0, max: 7.5 })
  })

  it('pins the Excluded bucket to a zero range', () => {
    expect(clsConcLimitBoundsForCls(eligCfg, 'Excluded')).toEqual({ min: 0.0, max: 0.0 })
  })

  it('matches dash-insensitively across en-dash and hyphen variants', () => {
    const cfg = { CLS_CONC_LIMIT_BOUNDS: { 'Unrated 1–2bn': { min: 10.0, max: 15.0 } } }
    expect(clsConcLimitBoundsForCls(cfg, 'Unrated 1-2bn')).toEqual({ min: 10.0, max: 15.0 })
  })

  it('returns null for an unknown class, missing config, or malformed range', () => {
    expect(clsConcLimitBoundsForCls(eligCfg, 'No Such Class')).toBeNull()
    expect(clsConcLimitBoundsForCls(null, 'Rated Investor')).toBeNull()
    expect(clsConcLimitBoundsForCls(
      { CLS_CONC_LIMIT_BOUNDS: { 'Broken': { min: Number.NaN, max: 5 } } },
      'Broken',
    )).toBeNull()
  })
})
