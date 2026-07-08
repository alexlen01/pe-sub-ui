export type LPClassification = 'Rated' | 'Unrated >2bn' | 'Unrated 1–2bn' | 'Eligible' | 'Excluded'
export type Region = string
export type InvestorType =
  | 'Institutional' | 'HNW'
  | 'Pension Fund' | 'Public Pension' | 'Endowment' | 'Foundation'
  | 'Family Office' | 'Fund of Funds' | 'Sovereign Wealth Fund'
  | 'Insurance Company' | 'Insurance' | 'Healthcare' | 'Corporate'
  | 'Other Institutional'

export interface LPRecord {
  name: string
  parent: string
  spv: boolean
  hq: boolean
  instVsHnw: InvestorType
  investorType?: string
  investor_type?: string
  inst_vs_hnw?: string
  regionLocation?: string
  region_location?: string
  region: Region
  ig: boolean
  cls: LPClassification
  clsTag: string
  // Ratings
  sp: string
  mdy: string
  fitch: string
  // Financial Scale (formatted strings — raw numerics live in DB)
  aum: string
  nav: string
  pension: string
  pensionFunded: string
  // Commitment Data
  capCommit: string
  pctCapCommit: string
  calledCap: string
  // Uncalled / Eligible Capital
  uc: string
  pctUncalled: string
  pctCalled: string
  // Concentration & BB
  agentConc: string
  ubsConc: string
  rate: string
  agentRate: string
  abb: string
  ubb: string
  delta: string
  // Uncalled Eligible Capital
  uec: string
  // Agent classification (may differ from UBS cls)
  agentCls?: string
  agentClsSource?: 'EXTRACTED' | 'DERIVED' | 'USER_EDITED' | string
  // ── Shadow BB alignment (Shadow_BB.xlsx, 28-column model) ──
  // `cls` carries the UBS LP Category; `agentCls` the Agent LP Category.
  // `rate` carries the UBS Advance Rate; `agentRate` the Agent Advance Rate.
  agentExcessConc?: string   // Agent Excess Concentration Base (calculated)
  ubsExcessConc?: string     // UBS Excess Concentration Base (calculated)
  // Fund sleeve (multi-tab BB extraction)
  fundSleeve?: string
  // Status
  inc: boolean
  rcl: boolean
  tf: boolean
  rank?: number | null
  notes: string
}
