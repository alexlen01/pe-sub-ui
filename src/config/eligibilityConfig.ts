// Eligibility rules, advance rate schedules, concentration limits, and global settings.
// Loaded by the Configuration screen; rates also referenced by classification and BB logic.
//
// Numeric conventions (match V1_4 migration):
//   rate / percentage threshold  — whole-number integer, e.g. 90 = 90%
//   dollar threshold             — raw integer, e.g. 500000 = $500,000
//   unit field on EligRule       — '%' or '$'; absent on mode/text rules

export interface RateTier {
  cls:  string
  rate: number  // whole-number percentage, e.g. 90 → multiply by 0.01 for calculations
}

export interface EligRule {
  id:     string
  rule:   string
  value:  string | number  // number for threshold rules; string for mode rules
  unit?:  '%' | '$'        // present on numeric threshold rules only
  active: boolean
}

export interface ConcLimit {
  label: string
  value: number  // whole-number percentage, e.g. 15 → 15%
  basis: string
}

export interface GlobalSetting {
  id:    string
  label: string
  value: string | number  // number for match thresholds; string for text settings
}

export const BUSA_TIERS: RateTier[] = [
  { cls: 'Rated',              rate: 90 },
  { cls: 'Unrated AUM >$2bn',  rate: 75 },
  { cls: 'Unrated AUM $1-2bn', rate: 65 },
  { cls: 'Eligible <$1bn',     rate: 50 },
  { cls: 'Excluded',           rate:  0 },
]

export const AGENT_TIERS: RateTier[] = [
  { cls: 'Rated',              rate: 90 },
  { cls: 'Unrated AUM >$2bn',  rate: 75 },
  { cls: 'Unrated AUM $1-2bn', rate: 65 },
  { cls: 'Eligible <$1bn',     rate: 50 },
  { cls: 'Excluded',           rate:  0 },
]

export const AGENT_RATE_PARAMS: Array<{ label: string; value: string | number; agency?: 'sp' | 'mdy' | 'fitch' }> = [
  { label: "Minimum S&P Rating",    value: 'BBB-', agency: 'sp'    },
  { label: "Minimum Moody's Rating", value: 'Baa3', agency: 'mdy'  },
  { label: 'Minimum Fitch Rating',  value: 'BBB-', agency: 'fitch' },
  { label: 'Agent Unrated AUM Floor', value: 1_000_000_000         },
]

export const ELIG_RULES: EligRule[] = [
  { id: 'min-commit',   rule: 'Minimum LP Commitment',           value: 500_000,  unit: '$', active: true  },
  { id: 'max-conc',     rule: 'Maximum Single-LP Concentration', value: 15,       unit: '%', active: true  },
  { id: 'erisa-cap',    rule: 'ERISA Plan Asset Cap',            value: 25,       unit: '%', active: true  },
  { id: 'pension-conc', rule: 'Pension Fund Concentration',      value: 30,       unit: '%', active: true  },
  { id: 'side-pocket',  rule: 'Side Pocket / Unfunded',          value: 'Exclude',           active: true  },
  { id: 'defaulted',    rule: 'Defaulted LP Exclusion',          value: 'Auto',              active: true  },
  { id: 'foreign-sov',  rule: 'Foreign Sovereign Exclusion',     value: 'Manual',            active: false },
]

export const CONC_LIMITS: ConcLimit[] = [
  { label: 'Single LP max',           value: 15, basis: 'Total UBS BB'            },
  { label: 'Top-10 LP max',           value: 60, basis: 'Total UBS BB'            },
  { label: 'Unrated max (aggregate)', value: 50, basis: 'Total UBS BB'            },
  { label: 'Non-US LP max',           value: 30, basis: 'Total UBS BB'            },
  { label: 'Pension fund max',        value: 30, basis: 'Total eligible uncalled' },
]

export const GLOBAL_SETTINGS: GlobalSetting[] = [
  { id: 'snapshot-freq',     label: 'Default Snapshot Frequency (days)',            value: 30                            },
  { id: 'match-auto-accept', label: 'Match Confidence Threshold (auto-accept)',    value: 95                            },
  { id: 'match-review',      label: 'Match Confidence Threshold (flag for review)',value: 80                            },
  { id: 'report-watermark',  label: 'Report Watermark (default)',                  value: 'DRAFT - For Internal Review' },
  { id: 'audit-retention',   label: 'Audit Log Retention (years)',                  value: 7                             },
]
