// LP classification options, rate maps, and qualifying criteria.
// Single source of truth used by LPMaster, Configuration, Reports, and matching screens.

export const CLS_OPTS = ['', 'Rated', 'Unrated >2bn', 'Unrated 1–2bn', 'Eligible', 'Excluded'] as const
export type ClsOpt = typeof CLS_OPTS[number]

export const REGION_OPTS = ['North America', 'Europe', 'Asia-Pacific', 'Middle East', 'Other'] as const
export type RegionOpt = typeof REGION_OPTS[number]

export const TYPE_OPTS = ['Institutional', 'HNW'] as const
export type TypeOpt = typeof TYPE_OPTS[number]

export const SP_RATING_OPTS = [
  '', 'AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-',
  'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-', 'B+', 'B', 'B-',
] as const

export const MDY_RATING_OPTS = [
  '', 'Aaa', 'Aa1', 'Aa2', 'Aa3', 'A1', 'A2', 'A3',
  'Baa1', 'Baa2', 'Baa3', 'Ba1', 'Ba2', 'Ba3', 'B1', 'B2', 'B3',
] as const

export const FITCH_RATING_OPTS = SP_RATING_OPTS

// BUSA (UBS) advance rates by LP classification
export const BUSA_RATE_MAP: Record<string, string> = {
  'Rated':          '90%',
  'Unrated >2bn':   '75%',
  'Unrated 1–2bn':  '65%',
  'Eligible':       '50%',
  'Excluded':       '0%',
}

// Agent bank advance rates by LP classification
export const AGENT_RATE_MAP: Record<string, string> = {
  'Rated':          '95%',
  'Unrated >2bn':   '75%',
  'Unrated 1–2bn':  '75%',
  'Eligible':       '',
  'Excluded':       '0%',
}

// CSS tag class by LP classification
export const CLS_TAG_MAP: Record<string, string> = {
  'Rated':          'tag-rated',
  'Unrated >2bn':   'tag-un2',
  'Unrated 1–2bn':  'tag-un1',
  'Eligible':       'tag-elig',
  'Excluded':       'tag-excl',
}

// Human-readable qualifying criteria per classification tier
export const CLS_CRITERIA: Record<string, string> = {
  'Rated':
    "At least one rating from S&P, Moody's, or Fitch above minimum threshold",
  'Unrated >2bn':
    'No qualifying rating. AUM > USD 2bn',
  'Unrated 1–2bn':
    'No qualifying rating. AUM between USD 1bn and USD 2bn',
  'Eligible':
    'No qualifying rating. AUM < USD 1bn. Otherwise meets all eligibility requirements',
  'Excluded':
    'Fails eligibility (jurisdiction, ERISA, concentration limit, etc.)',
}
