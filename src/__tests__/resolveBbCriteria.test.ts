import { describe, it, expect } from 'vitest'
import { resolveBbCriteria } from '../services/configService'
import type { BbCriteriaMatrix } from '../services/api'

// Mirrors the bb_criteria_matrix seeded in V1_3 and the API's BbCriteriaResolverTest golden table.
const MATRIX: BbCriteriaMatrix = {
  fundedThresholdPct: 40,
  ratingBands: {
    AAA: { sp: ['AAA'], moodys: ['Aaa'], fitch: ['AAA'] },
    AA: { sp: ['AA+', 'AA', 'AA-'], moodys: ['Aa1', 'Aa2', 'Aa3'], fitch: ['AA+', 'AA', 'AA-'] },
    A: { sp: ['A+', 'A', 'A-'], moodys: ['A1', 'A2', 'A3'], fitch: ['A+', 'A', 'A-'] },
    BBB: { sp: ['BBB+', 'BBB', 'BBB-'], moodys: ['Baa1', 'Baa2', 'Baa3'], fitch: ['BBB+', 'BBB', 'BBB-'] },
  },
  ratingBandSelection: 'middle',
  ratingBandTieBreak: { three: 'middle', two: 'lower', one: 'asIs' },
  subInvestmentGradeBand: 'BBB',
  rated: [
    { band: 'AAA', concLimitPct: 25, advanceRatePct: { lt40: 90, gte40: 90 } },
    { band: 'AA', concLimitPct: 20, advanceRatePct: { lt40: 90, gte40: 90 } },
    { band: 'A', concLimitPct: 15, advanceRatePct: { lt40: 90, gte40: 90 } },
    { band: 'BBB', concLimitPct: 10, advanceRatePct: { lt40: 65, gte40: 90 } },
  ],
  classes: [
    { cls: 'Corp Pension > $5Bn Assets', concLimitPct: 25, advanceRatePct: { lt40: 90, gte40: 90 } },
    { cls: 'Corp Pension > $1Bn Assets', concLimitPct: 20, advanceRatePct: { lt40: 90, gte40: 90 } },
    { cls: 'Unrated NAV > $1Bn', concLimitPct: 15, advanceRatePct: { lt40: 90, gte40: 90 } },
    { cls: 'FoF & Other > $10Bn AUM', concLimitPct: 10, advanceRatePct: { lt40: 65, gte40: 75 } },
    { cls: 'Other Institutional', concLimitPct: 5, advanceRatePct: { lt40: 50, gte40: 65 } },
    { cls: 'HNW Feeder (acceptable)', concLimitPct: 5, advanceRatePct: { lt40: 50, gte40: 65 } },
    { cls: 'HNW (acceptable)', concLimitPct: 1, advanceRatePct: { lt40: 0, gte40: 50 } },
    { cls: 'Excluded', concLimitPct: 0, advanceRatePct: { lt40: 0, gte40: 0 } },
  ],
}

const LT40 = 0.0
const GTE40 = 0.4

const rated = (spRating = '', moodysRating = '', fitchRating = '', funded = LT40) =>
  resolveBbCriteria(MATRIX, 'Rated Investor', { spRating, moodysRating, fitchRating }, funded)!
const cls = (c: string, funded = LT40) => resolveBbCriteria(MATRIX, c, {}, funded)!

describe('resolveBbCriteria — rated bands', () => {
  it('AAA (S&P or Moody\'s) → 25% / 90%', () => {
    expect(rated('AAA')).toEqual({ advanceRatePct: 90, concLimitPct: 25 })
    expect(rated('', 'Aaa').concLimitPct).toBe(25)
  })
  it('AA / A limits', () => {
    expect(rated('AA-').concLimitPct).toBe(20)
    expect(rated('A+').concLimitPct).toBe(15)
  })
  it('BBB advance rate splits on funded %', () => {
    expect(rated('BBB', '', '', LT40)).toEqual({ advanceRatePct: 65, concLimitPct: 10 })
    expect(rated('BBB', '', '', GTE40).advanceRatePct).toBe(90)
  })
  it('sub-investment-grade clamps to BBB', () => {
    expect(rated('BB+')).toEqual({ advanceRatePct: 65, concLimitPct: 10 })
  })
})

describe('resolveBbCriteria — tri-party middle-rating waterfall', () => {
  it('three all differ → middle band', () => {
    expect(rated('AAA', 'Aa2', 'A').concLimitPct).toBe(20) // AAA/AA/A → AA
  })
  it('three, two match → the matching band', () => {
    expect(rated('A', 'A2', 'BBB').concLimitPct).toBe(15) // A/A/BBB → A
  })
  it('two ratings → the lower', () => {
    expect(rated('AA', 'A1').concLimitPct).toBe(15) // AA/A → A
  })
  it('two matching ratings → that band', () => {
    expect(rated('AA', '', 'AA').concLimitPct).toBe(20)
  })
  it('three with one sub-IG → clamp then median', () => {
    expect(rated('AAA', 'Ba1', 'BBB').concLimitPct).toBe(10) // AAA/BBB/BBB → BBB
  })
})

describe('resolveBbCriteria — non-rated classes', () => {
  it('Corp Pension tiers', () => {
    expect(cls('Corp Pension > $5Bn Assets')).toEqual({ advanceRatePct: 90, concLimitPct: 25 })
    expect(cls('Corp Pension > $1Bn Assets')).toEqual({ advanceRatePct: 90, concLimitPct: 20 })
  })
  it('FoF funded split', () => {
    expect(cls('FoF & Other > $10Bn AUM', LT40).advanceRatePct).toBe(65)
    expect(cls('FoF & Other > $10Bn AUM', GTE40).advanceRatePct).toBe(75)
    expect(cls('FoF & Other > $10Bn AUM').concLimitPct).toBe(10)
  })
  it('Other Institutional / HNW Feeder funded split', () => {
    expect(cls('Other Institutional', LT40)).toEqual({ advanceRatePct: 50, concLimitPct: 5 })
    expect(cls('Other Institutional', GTE40).advanceRatePct).toBe(65)
    expect(cls('HNW Feeder (acceptable)', GTE40).advanceRatePct).toBe(65)
  })
  it('HNW is 0% until 40% funded, then 50%', () => {
    expect(cls('HNW (acceptable)', LT40)).toEqual({ advanceRatePct: 0, concLimitPct: 1 })
    expect(cls('HNW (acceptable)', GTE40).advanceRatePct).toBe(50)
  })
  it('Excluded → 0 / 0', () => {
    expect(cls('Excluded')).toEqual({ advanceRatePct: 0, concLimitPct: 0 })
  })
})

describe('resolveBbCriteria — boundary & fallthrough', () => {
  it('40% funded is inclusive of the ≥ column', () => {
    expect(cls('FoF & Other > $10Bn AUM', 0.4).advanceRatePct).toBe(75)
    expect(cls('FoF & Other > $10Bn AUM', 0.3999).advanceRatePct).toBe(65)
  })
  it('unknown class or absent matrix → null', () => {
    expect(resolveBbCriteria(MATRIX, 'Legacy Institutional', {}, LT40)).toBeNull()
    expect(resolveBbCriteria(null, 'Rated Investor', { spRating: 'AAA' }, LT40)).toBeNull()
    expect(resolveBbCriteria(MATRIX, '', {}, LT40)).toBeNull()
  })
})
