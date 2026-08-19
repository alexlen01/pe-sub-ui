import { describe, expect, it } from 'vitest'
import {
  buildLpMasterExportRows,
  buildLpRecordExportRows,
  exportFileName,
} from '../services/lpExportService'
import type { LpMasterRecord } from '../services/api'
import type { LPRecord } from '../types/lp'

// Both stores hand money and the concentration limits over as display strings, and rates/ratios as
// fractions (0.9 = 90%). The exports keep the strings verbatim. The LP Master export turns each
// fraction into a percent number under a "(%)" header; the LP records export keeps fractions, because
// it reproduces the LP DB Export, whose headers carry no "(%)" marker.
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
  agentExcessConcentration: '$2,500,000',
  ubsExcessConcentration: '$1,250,000',
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

// The 29 columns of the LP DB Export (2026-08-18 format), in source order, so the file that comes
// out of the platform re-ingests through lp_db_extract.py. Headers match the source spellings; the
// one departure is 'Institutional vs HNW', which the source misspells "Insitutional" and which the
// extract's _norm() matcher treats as the same column.
const LP_DB_COLUMNS = [
  'AccountID', 'FndName', 'Investor Name', 'Parent', 'SPV', 'UBS LP Classification',
  'Institutional vs HNW', 'Investment Grade?', 'Agent LP Classification', 'S&P', "Moody's", 'Fitch',
  'LP Size ($ Bil)', 'LP Size Criteria', 'Capital Commitments', 'Uncalled Capital',
  'UBS Advance Rate', 'Agent Concentration Limit', 'UBS Concentration Limit',
  '% of Capital Commitments', 'Called Capital', '% of Uncalled Capital', '% of LP Called',
  'Agent Excess Concentration', 'UBS Excess Concentration', 'Agent Borrowing Base',
  'UBS Borrowing Base', 'Notes', 'BBDate',
]

describe('LP records export', () => {
  const facilities = new Map([
    [3, { name: 'AG ABC', accountNumber: '5VZ8873', collateralDate: '2026-06-25' }],
  ])

  it('is the LP DB Export columns, in the source file order and nothing after them', () => {
    const [row] = buildLpRecordExportRows([lpRecord()], facilities)
    expect(Object.keys(row)).toEqual(LP_DB_COLUMNS)
    expect(Object.keys(row)).toHaveLength(29)
    expect(Object.keys(row).at(-1)).toBe('BBDate')   // the source export ends at BBDate
  })

  it('drops the columns the 2026-08-18 format removed', () => {
    const [row] = buildLpRecordExportRows([lpRecord()], facilities)
    const removed = ['High Quality', 'Investor Type', 'Region / Location', 'AUM', 'NAV',
                     'Pension Assets', 'Funded Ratio (%)', 'Agent Advance Rate (%)']
    removed.forEach(column => expect(row).not.toHaveProperty(column))
  })

  it('carries the facility columns an LP record cannot hold itself', () => {
    const [row] = buildLpRecordExportRows([lpRecord()], facilities)
    expect(row['AccountID']).toBe('5VZ8873')
    expect(row['FndName']).toBe('AG ABC')
    expect(row['BBDate']).toBe('2026-06-25')
  })

  it('keeps API display strings verbatim', () => {
    const [row] = buildLpRecordExportRows([lpRecord()], facilities)
    expect(row['Investor Name']).toBe('Beacon Capital Hospital Trust')
    expect(row['Capital Commitments']).toBe('$100,000,000')
    expect(row['UBS Concentration Limit']).toBe('$25,000,000')
    expect(row['Agent LP Classification']).toBe('Rated Included')
  })

  it('leaves the platform-computed columns out, but keeps the ones the export carries', () => {
    const [row] = buildLpRecordExportRows([lpRecord()], facilities)
    const absent = ['LP Record ID', 'Facility ID', 'Rank', 'Eligible',
                    'Uncalled Eligible Capital', 'Delta', 'Reclassified', 'Transferee']
    absent.forEach(column => expect(row).not.toHaveProperty(column))
    // These two are computed as well, but the 2026-08-18 export carries them, so they belong here.
    expect(row['Agent Excess Concentration']).toBe('$2,500,000')
    expect(row['UBS Excess Concentration']).toBe('$1,250,000')
    expect(row['UBS LP Classification']).toBe('Rated')
  })

  it('writes rates and shares as fractions, matching the source export', () => {
    // The export's headers carry no "(%)" marker, so 90 under "UBS Advance Rate" would read as
    // 9000%. Fractions also keep the round-trip unambiguous: the extract decides
    // percent-vs-fraction from the value, and a 1% share written as `1` would look like 100%.
    const [row] = buildLpRecordExportRows([lpRecord()], facilities)
    expect(row['UBS Advance Rate']).toBe(0.9)
    expect(row['% of Capital Commitments']).toBe(0.0421)
    expect(row['% of Uncalled Capital']).toBe(0.0533)
    expect(row['% of LP Called']).toBe(0.4)
  })

  it('leaves absent values as empty cells so numeric columns stay numeric', () => {
    const [row] = buildLpRecordExportRows(
      [lpRecord({ ubsAdvanceRate: null, fitchRating: '', agentExcessConcentration: undefined })],
      facilities,
    )
    expect(row['UBS Advance Rate']).toBe('')
    expect(row['Fitch']).toBe('')
    expect(row['Agent Excess Concentration']).toBe('')
  })

  it('collapses AUM / NAV / Pension Assets into LP Size and its criteria', () => {
    // The three columns became one $Bn figure plus a label naming which measure it is.
    const [aum] = buildLpRecordExportRows([lpRecord()], facilities)
    expect(aum['LP Size ($ Bil)']).toBe(4.2)
    expect(aum['LP Size Criteria']).toBe('AUM')
    expect(aum['SPV']).toBe('No')
    expect(aum['Investment Grade?']).toBe('Yes')

    const [pension] = buildLpRecordExportRows(
      [lpRecord({ aum: '', pensionAssets: '$1,800,000,000' })], facilities,
    )
    expect(pension['LP Size ($ Bil)']).toBe(1.8)
    expect(pension['LP Size Criteria']).toBe('Assets')

    const [nav] = buildLpRecordExportRows(
      [lpRecord({ aum: '', nav: '$750,000,000' })], facilities,
    )
    expect(nav['LP Size ($ Bil)']).toBe(0.75)
    expect(nav['LP Size Criteria']).toBe('NAV')
  })

  it('leaves LP Size blank rather than 0 when the record carries no size', () => {
    const [row] = buildLpRecordExportRows(
      [lpRecord({ aum: '', nav: '', pensionAssets: '' })], facilities,
    )
    expect(row['LP Size ($ Bil)']).toBe('')
    expect(row['LP Size Criteria']).toBe('')
  })

  it('reads an already-abbreviated LP Size as well as a full-dollar one', () => {
    const [row] = buildLpRecordExportRows([lpRecord({ aum: '$16.5B' })], facilities)
    expect(row['LP Size ($ Bil)']).toBe(16.5)
  })

  it('blanks the facility columns for a record whose facility is not on file', () => {
    const [row] = buildLpRecordExportRows([lpRecord({ facilityId: 99 })], facilities)
    expect(row['FndName']).toBe('')
    expect(row['AccountID']).toBe('')
    expect(row['BBDate']).toBe('')
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
