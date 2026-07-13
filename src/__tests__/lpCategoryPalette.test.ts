import { describe, expect, it } from 'vitest'
import { lpCategoryColor, UBS_LP_CATEGORY_ORDER } from '../utils/lpCategoryPalette'

const CHART_TOKEN_HEX = {
  'var(--lp-chart-rated-investors)':     '#4F4F4F',
  'var(--lp-chart-corp-pension-5bn)':    '#1F2937',
  'var(--lp-chart-corp-pension-1bn)':    '#38A169',
  'var(--lp-chart-unrated-nav-1bn)':     '#007A38',
  'var(--lp-chart-fof-other-10bn)':      '#E60000',
  'var(--lp-chart-other-institutional)': '#718096',
  'var(--lp-chart-hnw-feeder)':          '#B91C1C',
  'var(--lp-chart-hnw)':                 '#E2C185',
  'var(--lp-chart-excluded)':            '#C8C8C8',
}

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

  it('pins the corrected nine-slice sequence to the requested hex palette', () => {
    expect(UBS_LP_CATEGORY_ORDER.map(cls => CHART_TOKEN_HEX[lpCategoryColor(cls) as keyof typeof CHART_TOKEN_HEX])).toEqual([
      '#4F4F4F',
      '#1F2937',
      '#38A169',
      '#007A38',
      '#E60000',
      '#718096',
      '#B91C1C',
      '#E2C185',
      '#C8C8C8',
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
