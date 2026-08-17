import { describe, expect, it } from 'vitest'
import { lpCategoryColor, UBS_LP_CATEGORY_ORDER } from '../utils/lpCategoryPalette'

describe('lpCategoryColor', () => {
  it('renders the nine UBS LP classifications with theme-backed chart colors', () => {
    expect(UBS_LP_CATEGORY_ORDER.map(cls => [cls, lpCategoryColor(cls)])).toEqual([
      ['Rated Investor',             'var(--lp-chart-rated-investors)'],
      ['Corp Pension > $5Bn Assets', 'var(--lp-chart-corp-pension-5bn)'],
      ['Corp Pension > $1Bn Assets', 'var(--lp-chart-corp-pension-1bn)'],
      ['Unrated NAV > $1Bn',         'var(--lp-chart-unrated-nav-1bn)'],
      ['FoF & Other > $10Bn AUM',    'var(--lp-chart-fof-other-10bn)'],
      ['Other Institutional',        'var(--lp-chart-other-institutional)'],
      ['HNW Feeder (acceptable)',    'var(--lp-chart-hnw-feeder)'],
      ['HNW (acceptable)',           'var(--lp-chart-hnw)'],
      ['Excluded',                   'var(--lp-chart-excluded)'],
    ])
  })

  it('keeps parenthetical classification text while stripping dashboard rate suffixes', () => {
    expect(lpCategoryColor('HNW Feeder (acceptable) (65%)')).toBe('var(--lp-chart-hnw-feeder)')
    expect(lpCategoryColor('HNW (acceptable) (50%)')).toBe('var(--lp-chart-hnw)')
  })

  it('falls back to the muted theme color for unknown or blank categories', () => {
    expect(lpCategoryColor('')).toBe('var(--muted)')
    expect(lpCategoryColor('Unknown')).toBe('var(--muted)')
  })
})
