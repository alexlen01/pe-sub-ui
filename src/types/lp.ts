export type LPClassification = 'Rated' | 'Unrated >2bn' | 'Unrated 1–2bn' | 'Eligible' | 'Excluded'
export type Region = 'North America' | 'Europe' | 'Asia-Pacific' | 'Middle East' | 'Other'
export type InvestorType = 'Institutional' | 'HNW'

export interface LP {
  name: string
  parent: string
  spv: boolean
  hq: boolean
  type: InvestorType
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
  // ── Shadow BB alignment (Shadow_BB.xlsx, 28-column model) ──
  // `cls` carries the UBS LP Classification; `agentCls` the Agent LP Classification.
  // `rate` carries the UBS Advance Rate; `agentRate` the Agent Advance Rate.
  agentExcessConc?: string   // Agent Excess Concentration Base (calculated)
  ubsExcessConc?: string     // UBS Excess Concentration Base (calculated)
  // Status
  inc: boolean
  rcl: boolean
  tf: boolean
  notes: string
}
