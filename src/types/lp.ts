export type UbsLpCategory = 'Rated' | 'Unrated >2bn' | 'Unrated 1–2bn' | 'Eligible' | 'Excluded'
export type Region = string
export type InvestorType =
  | 'Institutional' | 'HNW'
  | 'Pension Fund' | 'Public Pension' | 'Endowment' | 'Foundation'
  | 'Family Office' | 'Fund of Funds' | 'Sovereign Wealth Fund'
  | 'Insurance Company' | 'Insurance' | 'Healthcare' | 'Corporate'
  | 'Other Institutional'

/**
 * One LP's participation in one facility. Field names mirror the API and its lp_records columns
 * one-for-one — there are no snake_case aliases and no abbreviations.
 *
 * Three distinctions the old names blurred:
 *  - `highQuality` is a BB quality-tier flag, not a quantity.
 *  - `ubsLpCategory` / `agentLpCategory` are BB risk buckets — not the LP's regulatory
 *    classification, and not `investorType` (industry profile).
 *  - `ubsAdvanceRate` is UBS's own rate; `agentAdvanceRate` is the agent bank's.
 *
 * Two representations coexist, matching the wire format:
 *  - Money and the concentration limits arrive pre-formatted for display ("$12,000,000", "7.5%").
 *  - Percents and advance rates arrive as raw fractions (0.91 = 91%); render them with
 *    `formatPercent` from utils/percent.
 */
export interface LPRecord {
  id?: number
  facilityId?: number
  investorName: string
  parent: string
  spv: boolean
  highQuality: boolean
  institutionalOrHnw: InvestorType
  investorType?: string
  regionLocation: Region
  investmentGrade: boolean
  ubsLpCategory: UbsLpCategory
  ubsLpCategoryTag: string
  // Agent LP Category (may differ from the UBS one)
  agentLpCategory?: string
  agentLpCategorySource?: 'EXTRACTED' | 'DERIVED' | 'USER_EDITED' | string
  // Ratings
  spRating: string
  moodysRating: string
  fitchRating: string
  // Financial scale — VARCHAR passthrough on the server, kept verbatim as the agent reported it.
  aum: string
  nav: string
  pensionAssets: string
  fundingRatio: number | null
  // Commitment data. Money is NUMERIC server-side and formatted at full precision on the way out —
  // never re-abbreviated, so a "$4.2B" input reads back "$4,200,000,000".
  capitalCommitment: string
  pctOfFundCommitments: number | null
  calledCapital: string
  // Uncalled / eligible capital
  uncalledCapital: string
  pctOfFundUncalled: number | null
  pctLpCalled: number | null
  // Concentration & BB. Both limits are either a percent of total uncalled ("7.5%") or an absolute
  // dollar cap ("$25,000,000"); the server stores them NUMERIC and formats on the way out.
  agentConcentrationLimit: string
  ubsConcentrationLimit: string
  ubsAdvanceRate: number | null
  agentAdvanceRate: number | null
  agentBorrowingBase: string
  ubsBorrowingBase: string
  delta: string
  uncalledEligibleCapital: string
  agentExcessConcentration?: string   // Agent Excess Concentration Base (calculated)
  ubsExcessConcentration?: string     // UBS Excess Concentration Base (calculated)
  // Status
  included: boolean
  reclassified: boolean
  transferee: boolean
  lpRank?: number | null
  notes: string
}
