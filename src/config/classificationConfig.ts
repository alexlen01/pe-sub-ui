// LP classification options, rate maps, and qualifying criteria.
// Single source of truth used by LPMaster, Configuration, Reports, and matching screens.
//
// Two distinct classification axes:
//   • UBS LP Category  (CLS_OPTS)        — UBS's internal advance-rate tier,
//     computed by the platform from ratings / AUM / eligibility.
//   • Agent LP Category (AGENT_CLS_OPTS) — the agent's own category label, taken
//     verbatim from the Agent BB document (column or group-header section rows).

export const CLS_OPTS = ['', 'Rated', 'Unrated >2bn', 'Unrated 1–2bn', 'Eligible', 'Excluded'] as const
export type ClsOpt = typeof CLS_OPTS[number]

// Agent LP Category — standard agent taxonomy values. Extracted as-is; never
// normalised to the UBS tier. Agent BB templates may present these as a column or as
// group-header rows separating sections of LPs. Values aligned to Shadow_BB.xlsx.
export const AGENT_CLS_OPTS = [
  '',
  'Rated Included',
  'Non-Rated Included',
  'Designated Institutional',
  'Designated PWM',
  'Ineligible Investors',
] as const
export type AgentClsOpt = typeof AGENT_CLS_OPTS[number]

// ── Shadow BB (Agent BB upload, Step 5) taxonomies — aligned to Shadow_BB.xlsx ──
// UBS LP Category — the credit officer's eligibility bucket on the Shadow BB.
// Distinct from the legacy CLS_OPTS tiers; the UBS advance rate is captured as its own
// manual-input column (UBS_CLS_DEFAULT_RATE only seeds a suggestion, never derives).
export const UBS_CLS_OPTS = [
  '',
  'Rated Investor',
  'FoF & Other > $10Bn AUM',
  'Unrated NAV > $1Bn',
  'Corp Pension > $5Bn Assets',
  'Other Institutional',
  'Excluded',
] as const
export type UbsClsOpt = typeof UBS_CLS_OPTS[number]

// Suggested UBS advance rate per classification. The analyst may override: the Shadow BB
// stores the advance rate as an independent manual-input column (the same UBS class appears
// at 0.90 / 0.75 / 0.65 / 0.00 across the population), so this only seeds a sensible default.
export const UBS_CLS_DEFAULT_RATE: Record<string, string> = {
  'Rated Investor':             '90%',
  'FoF & Other > $10Bn AUM':    '75%',
  'Unrated NAV > $1Bn':         '65%',
  'Corp Pension > $5Bn Assets': '65%',
  'Other Institutional':        '50%',
  'Excluded':                   '0%',
}

// Agent Advance Rate → UBS LP Category ladder (PE_SUB_SOLUTION rule).
// The advance rate reflects each LP's credit quality — how confident the lender is that the LP
// will honour its commitment if called. Higher quality, higher rate. The agent's own advance
// rate therefore seeds a sensible default UBS LP Category, from which the UBS Advance Rate
// follows via UBS_CLS_DEFAULT_RATE. Both stay editable on the Shadow BB.
//   Agent 95% → Rated Investor            (UBS 90%)
//   Agent 75% → FoF & Other > $10Bn AUM   (UBS 75%)
//   Agent 65% → Corp Pension > $5Bn Assets (UBS 65%)
//   Agent 50% → Other Institutional       (UBS 50%)
//   Agent  0% → Excluded                  (UBS  0%)
// Tiers are matched at-or-above by descending rate so non-canonical agent rates (e.g. 90, 60)
// still land on the nearest lower tier rather than dropping out — never over-rating an LP.
const AGENT_RATE_UBS_TIERS: ReadonlyArray<{ min: number; cls: UbsClsOpt }> = [
  { min: 90, cls: 'Rated Investor' },
  { min: 75, cls: 'FoF & Other > $10Bn AUM' },
  { min: 65, cls: 'Corp Pension > $5Bn Assets' },
  { min: 50, cls: 'Other Institutional' },
]

// Resolve the suggested UBS LP Category for an Agent Advance Rate (whole-number %).
// A rate of 0 maps to Excluded; a missing/blank rate returns '' so the row stays unclassified
// for the credit officer to assign manually.
export function ubsClassFromAgentRate(agentRatePct: number | '' | undefined): UbsClsOpt {
  if (typeof agentRatePct !== 'number') return ''
  if (agentRatePct <= 0) return 'Excluded'
  return AGENT_RATE_UBS_TIERS.find(t => agentRatePct >= t.min)?.cls ?? 'Other Institutional'
}

// Basis used for the "LP Size ($ Bil)" column on the Shadow BB.
export const LP_SIZE_CRITERIA_OPTS = ['', 'AUM', 'NAV', 'Assets'] as const
export type LpSizeCriteriaOpt = typeof LP_SIZE_CRITERIA_OPTS[number]

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
  'Rated':          '90%',
  'Unrated >2bn':   '75%',
  'Unrated 1–2bn':  '65%',
  'Eligible':       '50%',
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

// Granular investor type taxonomy (replaces the coarse Institutional/HNW split for display)
export const INVESTOR_TYPE_OPTS = [
  'Pension Fund',
  'Endowment',
  'Foundation',
  'Family Office',
  'Fund of Funds',
  'Sovereign Wealth Fund',
  'Insurance Company',
  'Healthcare',
  'Corporate',
  'Public Pension',
  'Other Institutional',
  'HNW',
] as const

export type InvestorTypeOpt = typeof INVESTOR_TYPE_OPTS[number]

// Maps UBS LP Classification to the 4-bucket Agent BB group label
export const LP_CATEGORY_LABEL: Record<string, string> = {
  'Rated':          'Rated Investors',
  'Unrated >2bn':   'Unrated Investors',
  'Unrated 1–2bn':  'Unrated Investors',
  'Eligible':       'Included Investors',
  'Excluded':       'Excluded Investors',
}
