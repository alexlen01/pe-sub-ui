import { describe, expect, it } from 'vitest'
import {
  buildLpMasterExportRows,
  buildLpRecordExportRows,
  exportFileName,
} from '../services/lpExportService'
import type { LpMasterRecord } from '../services/api'
import type { LPRecord } from '../types/lp'

// Both stores hand money and the concentration limits over as display strings, and rates/ratios as
// fractions (0.9 = 90%). The exports keep the strings verbatim and turn every fraction into a
// number under a "(%)" header, so a spreadsheet can sum the column.
const lpRecord = (over: Partial<LPRecord> = {}): LPRecord => ({
  id: 11,
  facilityId: 3,
  investorName: 'Beacon Capital Hospital Trust',
  parent: 'Beacon Capital',
  spv: false,
  highQuality: true,
  institutionalOrHnw: 'Institutional',
  investorType: 'Healthcare',
  regionLocation: 'North America',
  investmentGrade: true,
  ubsLpCategory: 'Rated',
  ubsLpCategoryTag: '',
  agentLpCategory: 'Rated Included',
  agentLpCategorySource: 'EXTRACTED',
  spRating: 'AA-',
  moodysRating: 'Aa3',
  fitchRating: '',
  aum: '$4,200,000,000',
  nav: '',
  pensionAssets: '',
  fundingRatio: null,
  capitalCommitment: '$100,000,000',
  pctOfFundCommitments: 0.0421,
  calledCapital: '$40,000,000',
  uncalledCapital: '$60,000,000',
  pctOfFundUncalled: 0.0533,
  pctLpCalled: 0.4,
  agentConcentrationLimit: '7.5%',
  ubsConcentrationLimit: '$25,000,000',
  ubsAdvanceRate: 0.9,
  agentAdvanceRate: 0.95,
  agentBorrowingBase: '$57,000,000',
  ubsBorrowingBase: '$54,000,000',
  delta: '-$3,000,000',
  uncalledEligibleCapital: '$60,000,000',
  included: true,
  reclassified: false,
  transferee: false,
  lpRank: 4,
  notes: '',
  ...over,
})

const lpMaster = (over: Partial<LpMasterRecord> = {}): LpMasterRecord => ({
  id: 7,
  investorName: 'Aurora Pension Trust',
  parent: 'Aurora Group',
  parentId: 2,
  isUltimateParent: false,
  ultimateParent: 'Aurora Group',
  childCount: 0,
  spv: false,
  highQuality: false,
  investorType: 'Corporate Pension',
  institutionalOrHnw: 'Institutional',
  regionLocation: 'EMEA',
  investmentGrade: false,
  ubsLpCategory: 'Non-Rated Included',
  spRating: '',
  moodysRating: '',
  fitchRating: '',
  aum: '',
  nav: '',
  pensionAssets: '$1,800,000,000',
  fundingRatio: 0.874,
  ubsDefaultAdvanceRate: 0.75,
  ubsDefaultConcentrationLimit: '7.5%',
  notes: '',
  ...over,
})

// Column order and field set mirror the LP DB Export (lp_db_generate.SRC_COLS), so the file that
// comes out of the platform lines up with the file the platform was seeded from.
const LP_DB_COLUMNS = [
  'Account ID', 'Fund Name', 'Investor Name', 'Parent', 'SPV', 'Investor Type', 'Region / Location',
  'High Quality', 'Institutional vs HNW', 'Investment Grade', 'Agent LP Classification', 'Notes',
  'S&P', "Moody's", 'Fitch', 'AUM', 'NAV', 'Pension Assets', 'Funded Ratio (%)',
  'UBS Advance Rate (%)', 'Agent Advance Rate (%)', 'Capital Commitments', '% of Commitments',
  'Called Capital', 'Uncalled Capital', '% of Uncalled Capital', '% of LP Called',
  'Agent Concentration Limit', 'UBS Concentration Limit', 'Agent Borrowing Base',
  'UBS Borrowing Base', 'Collateral Date',
]

describe('LP records export', () => {
  const facilities = new Map([
    [3, { name: 'AG ABC', accountNumber: '5VZ8873', collateralDate: '2026-06-25' }],
  ])

  it('is the LP DB Export columns, in the source file order and nothing after them', () => {
    const [row] = buildLpRecordExportRows([lpRecord()], facilities)
    expect(Object.keys(row)).toEqual(LP_DB_COLUMNS)
    expect(Object.keys(row).at(-1)).toBe('Collateral Date')   // the source export ends at BBDate
  })

  it('carries the facility columns an LP record cannot hold itself', () => {
    const [row] = buildLpRecordExportRows([lpRecord()], facilities)
    expect(row['Account ID']).toBe('5VZ8873')
    expect(row['Fund Name']).toBe('AG ABC')
    expect(row['Collateral Date']).toBe('2026-06-25')
  })

  it('keeps API display strings verbatim', () => {
    const [row] = buildLpRecordExportRows([lpRecord()], facilities)
    expect(row['Investor Name']).toBe('Beacon Capital Hospital Trust')
    expect(row['Capital Commitments']).toBe('$100,000,000')
    expect(row['UBS Concentration Limit']).toBe('$25,000,000')
    expect(row['Agent LP Classification']).toBe('Rated Included')
  })

  it('leaves the platform-computed columns out — they are not LP DB Export columns', () => {
    const [row] = buildLpRecordExportRows([lpRecord()], facilities)
    const absent = ['LP Record ID', 'Facility ID', 'Rank', 'UBS LP Classification', 'Eligible',
                    'Uncalled Eligible Capital', 'Delta', 'Reclassified', 'Transferee']
    absent.forEach(column => expect(row).not.toHaveProperty(column))
  })

  it('writes fractions as percent numbers, not text', () => {
    const [row] = buildLpRecordExportRows([lpRecord()], facilities)
    expect(row['UBS Advance Rate (%)']).toBe(90)
    expect(row['Agent Advance Rate (%)']).toBe(95)
    expect(row['% of Uncalled Capital']).toBe(5.3)
    expect(row['% of LP Called']).toBe(40)
  })

  it('leaves absent values as empty cells so numeric columns stay numeric', () => {
    const [row] = buildLpRecordExportRows(
      [lpRecord({ fundingRatio: null, ubsAdvanceRate: null, fitchRating: '' })],
      facilities,
    )
    expect(row['Funded Ratio (%)']).toBe('')
    expect(row['UBS Advance Rate (%)']).toBe('')
    expect(row['Fitch']).toBe('')
  })

  it('keeps AUM, NAV and Pension Assets in their own columns like the source export', () => {
    const [aum] = buildLpRecordExportRows([lpRecord()], facilities)
    expect(aum['AUM']).toBe('$4,200,000,000')
    expect(aum['NAV']).toBe('')
    expect(aum['Pension Assets']).toBe('')
    expect(aum['SPV']).toBe('No')
    expect(aum['Investment Grade']).toBe('Yes')

    const [pension] = buildLpRecordExportRows(
      [lpRecord({ aum: '', pensionAssets: '$1,800,000,000' })], facilities,
    )
    expect(pension['AUM']).toBe('')
    expect(pension['Pension Assets']).toBe('$1,800,000,000')
  })

  it('blanks the facility columns for a record whose facility is not on file', () => {
    const [row] = buildLpRecordExportRows([lpRecord({ facilityId: 99 })], facilities)
    expect(row['Fund Name']).toBe('')
    expect(row['Account ID']).toBe('')
    expect(row['Collateral Date']).toBe('')
  })

  it('exports every record, not a page of them', () => {
    const many = Array.from({ length: 250 }, (_, i) => lpRecord({ id: i, investorName: `LP ${i}` }))
    expect(buildLpRecordExportRows(many, facilities)).toHaveLength(250)
  })
})

describe('LP Master export', () => {
  it('carries the hierarchy columns and converts the rate and ratio', () => {
    const [row] = buildLpMasterExportRows([lpMaster()])
    expect(row['LP Master ID']).toBe(7)
    expect(row['Parent']).toBe('Aurora Group')
    expect(row['Parent ID']).toBe(2)
    expect(row['Ultimate Entity']).toBe('No')
    expect(row['Funded Ratio (%)']).toBe(87.4)
    expect(row['UBS Default Advance Rate (%)']).toBe(75)
    expect(row['UBS Default Concentration Limit']).toBe('7.5%')
  })

  it('exports a self-named parent as no parent', () => {
    // The feed writes a row's own name into `parent` to mean "no parent" — exporting it verbatim
    // would read as every such record being its own sponsor.
    const [row] = buildLpMasterExportRows([
      lpMaster({ investorName: 'Aurora Group', parent: 'Aurora Group', parentId: null, isUltimateParent: true }),
    ])
    expect(row['Parent']).toBe('')
    expect(row['Parent ID']).toBe('')
    expect(row['Ultimate Entity']).toBe('Yes')
  })
})

describe('export file names', () => {
  it('timestamps the file so repeated exports do not overwrite each other', () => {
    expect(exportFileName('lp-records', new Date(2026, 7, 17, 9, 5))).toBe('lp-records-20260817-0905.xlsx')
  })
})
