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

describe('LP records export', () => {
  const facilities = new Map([[3, 'AG ABC']])

  it('names the facility and keeps API display strings verbatim', () => {
    const [row] = buildLpRecordExportRows([lpRecord()], facilities)
    expect(row['Facility']).toBe('AG ABC')
    expect(row['Facility ID']).toBe(3)
    expect(row['LP Record ID']).toBe(11)
    expect(row['Investor Name']).toBe('Beacon Capital Hospital Trust')
    expect(row['Capital Commitments']).toBe('$100,000,000')
    expect(row['UBS Concentration Limit']).toBe('$25,000,000')
    expect(row['Rank']).toBe(4)
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
      [lpRecord({ fundingRatio: null, ubsAdvanceRate: null, fitchRating: '', lpRank: null })],
      facilities,
    )
    expect(row['Funded Ratio (%)']).toBe('')
    expect(row['UBS Advance Rate (%)']).toBe('')
    expect(row['Fitch']).toBe('')
    expect(row['Rank']).toBe('')
  })

  it('reports LP Size against the measure that carries it, and booleans as Yes/No', () => {
    const [aum] = buildLpRecordExportRows([lpRecord()], facilities)
    expect(aum['LP Size']).toBe('$4,200,000,000')
    expect(aum['Size Measure']).toBe('AUM')
    expect(aum['Eligible']).toBe('Yes')
    expect(aum['SPV']).toBe('No')

    const [pension] = buildLpRecordExportRows(
      [lpRecord({ aum: '', pensionAssets: '$1,800,000,000' })], facilities,
    )
    expect(pension['LP Size']).toBe('$1,800,000,000')
    expect(pension['Size Measure']).toBe('Assets')
  })

  it('blanks the facility for a record whose facility is not on file', () => {
    const [row] = buildLpRecordExportRows([lpRecord({ facilityId: 99 })], facilities)
    expect(row['Facility']).toBe('')
    expect(row['Facility ID']).toBe(99)
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
