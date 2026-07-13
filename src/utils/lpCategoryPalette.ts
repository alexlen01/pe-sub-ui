export const UBS_LP_CATEGORY_ORDER = [
  'Rated Investor',
  'Corp Pension > $5Bn Assets',
  'Corp Pension > $1Bn Assets',
  'Unrated NAV > $1Bn',
  'FoF & Other > $10Bn AUM',
  'Other Institutional',
  'HNW Feeder (acceptable)',
  'HNW (acceptable)',
  'Excluded',
] as const

export const LP_CATEGORY_CHART_COLOR_BY_CLASS: Record<string, string> = {
  'Rated Investor':             'var(--lp-chart-rated-investors)',
  'Rated Investors':            'var(--lp-chart-rated-investors)',
  'Rated':                      'var(--lp-chart-rated-investors)',
  'Corp Pension > $5Bn Assets': 'var(--lp-chart-corp-pension-5bn)',
  'Corp Pension > $1Bn Assets': 'var(--lp-chart-corp-pension-1bn)',
  'Unrated NAV > $1Bn':         'var(--lp-chart-unrated-nav-1bn)',
  'Unrated >2bn':               'var(--lp-chart-unrated-nav-1bn)',
  'Unrated 1-2bn':              'var(--lp-chart-unrated-nav-1bn)',
  'Unrated 1–2bn':              'var(--lp-chart-unrated-nav-1bn)',
  'FoF & Other > $10Bn AUM':    'var(--lp-chart-fof-other-10bn)',
  'Other Institutional':        'var(--lp-chart-other-institutional)',
  'Eligible':                   'var(--lp-chart-other-institutional)',
  'HNW Feeder (acceptable)':    'var(--lp-chart-hnw-feeder)',
  'HNW (acceptable)':           'var(--lp-chart-hnw)',
  'Excluded':                   'var(--lp-chart-excluded)',
}

const NORMALIZED_LP_CATEGORY_COLORS = new Map(
  Object.entries(LP_CATEGORY_CHART_COLOR_BY_CLASS).map(([key, value]) => [key.toLowerCase(), value]),
)

function stripRateSuffix(label: string): string {
  return label.trim().replace(/\s+\(\d+(?:\.\d+)?%\)$/, '')
}

export function lpCategoryColor(label?: string | null): string {
  if (!label) return 'var(--muted)'
  const normalized = stripRateSuffix(label).toLowerCase()
  return NORMALIZED_LP_CATEGORY_COLORS.get(normalized) ?? 'var(--muted)'
}
