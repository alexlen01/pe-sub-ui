// Eligibility rules, advance rate schedules, concentration limits, and global settings.
// Loaded by Configuration screen; rates also referenced by classification logic.

export interface RateTier {
  cls: string
  rate: string
}

export interface EligRule {
  id: string
  rule: string
  value: string
  active: boolean
}

export interface ConcLimit {
  label: string
  value: string
  basis: string
}

export interface GlobalSetting {
  id: string
  label: string
  value: string
}

export const BUSA_TIERS: RateTier[] = [
  { cls: 'Rated',              rate: '90%' },
  { cls: 'Unrated AUM >$2bn',  rate: '75%' },
  { cls: 'Unrated AUM $1-2bn', rate: '65%' },
  { cls: 'Eligible <$1bn',     rate: '50%' },
  { cls: 'Excluded',           rate: '0%'  },
]

export const AGENT_TIERS: RateTier[] = [
  { cls: 'Investment Grade', rate: '95%' },
  { cls: 'Non-IG Eligible',  rate: '75%' },
  { cls: 'Excluded',         rate: '0%'  },
]

export const AGENT_RATE_PARAMS: Array<{ label: string; value: string }> = [
  { label: 'Minimum Rated Rating Threshold', value: 'BBB- / Baa3'    },
  { label: 'Agent Unrated AUM Floor',        value: '$1,000,000,000' },
]

export const ELIG_RULES: EligRule[] = [
  { id: 'min-commit',   rule: 'Minimum LP Commitment',           value: '$500,000', active: true  },
  { id: 'max-conc',     rule: 'Maximum Single-LP Concentration', value: '15%',      active: true  },
  { id: 'erisa-cap',    rule: 'ERISA Plan Asset Cap',            value: '25%',      active: true  },
  { id: 'pension-conc', rule: 'Pension Fund Concentration',      value: '30%',      active: true  },
  { id: 'side-pocket',  rule: 'Side Pocket / Unfunded',          value: 'Exclude',  active: true  },
  { id: 'defaulted',    rule: 'Defaulted LP Exclusion',          value: 'Auto',     active: true  },
  { id: 'foreign-sov',  rule: 'Foreign Sovereign Exclusion',     value: 'Manual',   active: false },
]

export const CONC_LIMITS: ConcLimit[] = [
  { label: 'Single LP max',           value: '15%', basis: 'Total UBS BB'              },
  { label: 'Top-10 LP max',           value: '60%', basis: 'Total UBS BB'              },
  { label: 'Unrated max (aggregate)', value: '50%', basis: 'Total UBS BB'              },
  { label: 'Non-US LP max',           value: '30%', basis: 'Total UBS BB'              },
  { label: 'Pension fund max',        value: '30%', basis: 'Total eligible uncalled'   },
]

export const GLOBAL_SETTINGS: GlobalSetting[] = [
  { id: 'snapshot-freq',       label: 'Default Snapshot Frequency',               value: 'Monthly (last business day)' },
  { id: 'match-auto-accept',   label: 'Match Confidence Threshold (auto-accept)', value: '95%'                         },
  { id: 'match-review',        label: 'Match Confidence Threshold (flag for review)', value: '80%'                    },
  { id: 'report-watermark',    label: 'Report Watermark (default)',               value: 'DRAFT - For Internal Review' },
  { id: 'audit-retention',     label: 'Audit Log Retention',                     value: '7 years'                     },
]
