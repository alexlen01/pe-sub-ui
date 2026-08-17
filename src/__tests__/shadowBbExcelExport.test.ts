import ExcelJS from 'exceljs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildShadowExportRows, exportShadowBB, type ShadowRow } from '../screens/ShadowBB'
import type { Override } from '../screens/RunShadowBB'
import type { BBSummaryExt } from '../services/api'

// The workbook is a copy of the Shadow BB screen: the four summary tables side by side across
// the top (navy title bars, the agent / UBS-rate highlight rows), then the LP grid carrying
// every column of the on-screen table. These fixtures mirror the API contract — money in
// $millions, advance rates as fractions.

const savedBlobs: Blob[] = []
vi.mock('file-saver', () => ({ saveAs: (blob: Blob) => { savedBlobs.push(blob) } }))

const NAVY = 'FF0F2560'
const AGENT_HL = 'FFFFFBE6'
const UBS_RATE_HL = 'FFEAF4FF'

const summaryExt = (): BBSummaryExt => ({
  totalCapCommit: 2000, totalCalledCap: 500, pctLpCalled: 0.25,
  totalAllUncalled: 1500, totalLPs: 2,
  pctInstitutional: 0.8, pctHNW: 0.2, pctTop10: 0.55, pctTop20: 0.75,
  igRatio: 0.6, pctUncalledGt25bnAum: 0.4,
  facilitySize: 1000, ubsParticipation: 400, ubsParticipationPct: 0.4,
  facilityLTV: 0.5, availableCommit: 600, facilityAdvRate: 0.8,
  agentBBRaw: 900, ubsBBRaw: 850, ubsAdvRate: 0.85,
  busaBreakdown:  [{ rate: '90%', count: 1, dollars: 500, pct: 0.5 }, { rate: '75%', count: 1, dollars: 500, pct: 0.5 }],
  agentBreakdown: [{ rate: '90%', count: 2, dollars: 1000, pct: 1 }],
  clsBreakdown:   [{ label: 'Rated Investor', count: 2, dollars: 1000, pct: 1 }],
})

const shadowRow = (over: Partial<ShadowRow> = {}): ShadowRow => ({
  id: 51, investorName: 'Alpha Pension', ubsLpCategory: 'Rated Investor', included: true,
  uncalledCapital: '$10.0M', uncalledEligibleCapital: '$10.0M',
  uecM: 10, ubbM: 9, abbM: 8.5, deltaM: 0.5,
  concExcessM: 0, ucM: 10, agentExcessM: 2, pctAgentBB: 0.5, pctUbsBB: 0.4,
  ubsAdvanceRate: 0.9, agentAdvanceRate: 0.85, highQuality: true,
  _key: 'LPRecord-51', _isNew: false, _agentName: 'Alpha Pension',
  ...over,
} as ShadowRow)

const override = (over: Partial<Override> = {}): Override => ({
  investorName: 'Alpha Pension', parent: 'Alpha Group', spv: false,
  investorType: 'Pension', institutionalOrHnw: 'Institutional', investmentGrade: true,
  ubsLpCategory: 'Rated Investor', agentLpCategory: 'Included', regionLocation: 'US',
  spRating: 'A+', moodysRating: 'A1', fitchRating: 'A', lpSizeBil: '30000000000', lpSizeCriteria: 'AUM',
  capitalCommitment: '$20.0M', ucM: '$10.0M',
  ubsAdvRatePct: 90, agentRatePct: 85, concLimitPct: 5, agentConcLimitPct: 7.5,
  included: true, notes: 'reviewed',
  ...over,
})

const exportRows = () => buildShadowExportRows({
  rows: [
    shadowRow(),
    shadowRow({ id: 52, investorName: 'Beta Trust', included: false, ubsLpCategory: undefined, _key: 'LPRecord-52' }),
  ],
  overrides: {
    'LPRecord-51': override(),
    'LPRecord-52': override({ investorName: 'Beta Trust', ubsLpCategory: '', included: false }),
  },
  editedKeys: {},
  ranks: { 'LPRecord-51': 1, 'LPRecord-52': 2 },
  totalCommitM: 40, totalUncalledM: 20,
  frozenTotalABB: 17, frozenTotalUBB: 18,
})

/** Reads the workbook back out of the Blob handed to file-saver. */
async function exportedSheet() {
  savedBlobs.length = 0
  await exportShadowBB('Fund IV', summaryExt(), exportRows())
  expect(savedBlobs).toHaveLength(1)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await savedBlobs[0].arrayBuffer())
  const ws = wb.getWorksheet('Shadow BB')
  if (!ws) throw new Error('workbook has no "Shadow BB" sheet')
  return ws
}

const fillArgb = (ws: ExcelJS.Worksheet, row: number, col: number) => {
  const fill = ws.getCell(row, col).fill
  return fill?.type === 'pattern' ? fill.fgColor?.argb : undefined
}

/** The grid header row — the one starting with "Rank". */
function headerRowNumber(ws: ExcelJS.Worksheet): number {
  for (let r = 1; r <= ws.rowCount; r++) {
    if (ws.getCell(r, 1).value === 'Rank') return r
  }
  throw new Error('no LP grid header row found')
}

describe('Shadow BB Excel export', () => {
  let ws: ExcelJS.Worksheet

  beforeAll(async () => { ws = await exportedSheet() })

  it('puts the four summary tables side by side on one row, each in navy', () => {
    const titleRow = 4
    expect(ws.getCell(titleRow, 1).value).toBe('LP Portfolio')
    expect(ws.getCell(titleRow, 5).value).toBe('Borrowing Base')
    expect(ws.getCell(titleRow, 9).value).toBe('BUSA')
    expect(ws.getCell(titleRow, 14).value).toBe('Agent')

    for (const col of [1, 5, 9, 14]) {
      expect(fillArgb(ws, titleRow, col)).toBe(NAVY)
      expect(ws.getCell(titleRow, col).font?.color?.argb).toBe('FFFFFFFF')
      expect(ws.getCell(titleRow, col).font?.bold).toBe(true)
    }
  })

  it('outlines each summary table in navy, with thin rules inside', () => {
    // LP Portfolio spans columns 1-3 over rows 4-15: navy on the four outer edges only.
    expect(ws.getCell(4, 1).border?.top).toEqual({ style: 'medium', color: { argb: NAVY } })
    expect(ws.getCell(4, 1).border?.left).toEqual({ style: 'medium', color: { argb: NAVY } })
    expect(ws.getCell(4, 1).border?.right).toEqual({ style: 'medium', color: { argb: NAVY } })
    expect(ws.getCell(15, 1).border?.bottom).toEqual({ style: 'medium', color: { argb: NAVY } })
    expect(ws.getCell(15, 3).border?.right).toEqual({ style: 'medium', color: { argb: NAVY } })

    // Inside the table the rules stay thin: the label column's right edge and a mid-table row.
    expect(ws.getCell(9, 1).border?.right).toEqual({ style: 'thin', color: { argb: 'FFD8D8D8' } })
    expect(ws.getCell(9, 1).border?.bottom).toEqual({ style: 'thin', color: { argb: 'FFD8D8D8' } })

    // The breakdown totals row keeps its own 2px rule above.
    expect(ws.getCell(8, 10).border?.top).toEqual({ style: 'medium', color: { argb: 'FFD8D8D8' } })
  })

  it('separates the tables with an empty, unfilled gutter column', () => {
    // Columns 4, 8 and 13 belong to the LP grid below; across the summary they stay blank.
    for (const gutter of [4, 8, 13]) {
      for (let row = 4; row <= 17; row++) {
        expect(ws.getCell(row, gutter).value).toBeNull()
        expect(fillArgb(ws, row, gutter)).toBeUndefined()
      }
    }
  })

  it('renders the key/value tables with their on-screen values and highlight rows', () => {
    expect(ws.getCell(5, 1).value).toBe('Total Capital Commitments')
    expect(ws.getCell(5, 3).value).toBe(2_000_000_000)
    expect(ws.getCell(9, 1).value).toBe('# of Limited Partners')
    expect(ws.getCell(9, 3).value).toBe(2)

    expect(ws.getCell(5, 5).value).toBe('Total Facility Size')
    expect(ws.getCell(5, 7).value).toBe(1_000_000_000)

    // Agent BB (amber) and UBS advance rate (blue) carry the screen's highlight fills.
    expect(ws.getCell(11, 5).value).toBe('Agent Borrowing Base')
    expect(fillArgb(ws, 11, 7)).toBe(AGENT_HL)
    expect(ws.getCell(11, 7).font?.color?.argb).toBe('FF7C6200')
    expect(ws.getCell(13, 5).value).toBe('UBS Advance Rate')
    expect(ws.getCell(13, 7).value).toBe(0.85)
    expect(fillArgb(ws, 13, 7)).toBe(UBS_RATE_HL)
  })

  it('renders the breakdown tables with column headers and a totals row', () => {
    expect([9, 10, 11, 12].map(c => ws.getCell(5, c).value)).toEqual(['Rate', '#', '$', '%'])
    expect([9, 10, 11, 12].map(c => ws.getCell(6, c).value)).toEqual(['90%', 1, 500_000_000, 0.5])
    // Two rates + a totals row: count 2, $1bn, 100%.
    expect([10, 11, 12].map(c => ws.getCell(8, c).value)).toEqual([2, 1_000_000_000, 1])
    expect(ws.getCell(8, 10).font?.bold).toBe(true)

    expect([14, 15, 16, 17].map(c => ws.getCell(5, c).value)).toEqual(['Rate', '#', '$', '%'])
    expect([14, 15, 16, 17].map(c => ws.getCell(6, c).value)).toEqual(['90%', 2, 1_000_000_000, 1])
  })

  it('follows the summary with a grid carrying every LP record column', () => {
    const hdr = headerRowNumber(ws)
    expect(hdr).toBeGreaterThan(4)
    const headers = Array.from({ length: 33 }, (_, i) => ws.getCell(hdr, i + 1).value)
    expect(headers).toEqual([
      'Rank', 'Investor Name', 'Parent', 'SPV', 'Region / Location', 'Investor Type',
      'Institutional vs HNW', 'Agent LP Classification', 'UBS LP Classification', 'Eligible',
      'Investment Grade', 'S&P', "Moody's", 'Fitch', 'Size Measure', 'LP Size',
      'Capital Commitments', '% of Capital Commitments', 'Called Capital', 'Uncalled Capital',
      '% of Uncalled Capital', '% of LP Called', 'Agent Advance Rate', 'UBS Advance Rate',
      'Agent Concentration Limit', 'UBS Concentration Limit', 'Agent Excess Concentration',
      'UBS Excess Concentration', 'Agent Borrowing Base', '% of Agent BB', 'UBS Borrowing Base',
      '% of UBS BB', 'Notes',
    ])
    expect(ws.getCell(hdr, 34).value).toBeNull()
  })

  it('keeps every grid header on one line, widening the column to fit it', () => {
    const hdr = headerRowNumber(ws)
    for (let c = 1; c <= 33; c++) {
      const header = String(ws.getCell(hdr, c).value)
      expect(ws.getCell(hdr, c).alignment?.wrapText).toBeFalsy()
      // Read-back widths are undefined only where the column keeps ExcelJS's 9-char default.
      expect(ws.getColumn(c).width ?? 9).toBeGreaterThanOrEqual(header.length)
    }
    // The longest header drives its own column rather than wrapping into a second line.
    expect(ws.getColumn(27).width).toBe('Agent Excess Concentration'.length + 4)
  })

  it('writes each LP row the way the grid renders it', () => {
    const first = headerRowNumber(ws) + 1
    expect(ws.getCell(first, 1).value).toBe(1)
    expect(ws.getCell(first, 2).value).toBe('Alpha Pension')
    expect(ws.getCell(first, 3).value).toBe('Alpha Group')
    expect(ws.getCell(first, 4).value).toBe('No')
    expect(ws.getCell(first, 9).value).toBe('Rated Investor')
    expect(ws.getCell(first, 10).value).toBe('Yes')
    expect(ws.getCell(first, 16).value).toBe('$30bn')
    expect(ws.getCell(first, 17).value).toBe(20_000_000)   // capital commitment, full dollars
    expect(ws.getCell(first, 18).value).toBe(0.5)          // 20 of 40M committed
    expect(ws.getCell(first, 19).value).toBe(10_000_000)   // called = commitment - uncalled
    expect(ws.getCell(first, 20).value).toBe(10_000_000)
    expect(ws.getCell(first, 23).value).toBe(0.85)         // agent advance rate as a fraction
    expect(ws.getCell(first, 24).value).toBe(0.9)
    expect(ws.getCell(first, 29).value).toBe(8_500_000)    // snapshot agent BB
    expect(ws.getCell(first, 30).value).toBe(0.5)
    expect(ws.getCell(first, 31).value).toBe(9_000_000)    // snapshot UBS BB
    expect(ws.getCell(first, 32).value).toBe(0.4)
    expect(ws.getCell(first, 33).value).toBe('reviewed')

    expect(ws.getCell(first, 17).numFmt).toBe('[$$-409]#,##0;[Red]-[$$-409]#,##0')
    expect(ws.getCell(first, 18).numFmt).toBe('0.0%')
  })

  it('flags an unclassified LP in red and marks it ineligible, as the grid does', () => {
    const second = headerRowNumber(ws) + 2
    expect(ws.getCell(second, 2).value).toBe('Beta Trust')
    expect(ws.getCell(second, 9).value).toBe('Unclassified')
    expect(ws.getCell(second, 9).font?.color?.argb).toBe('FFB91C1C')
    expect(ws.getCell(second, 10).value).toBe('No')
  })

  it('filters the grid and keeps the first two columns in view', () => {
    const hdr = headerRowNumber(ws)
    // Column 33 ("Notes") is AG; the range covers the header plus both LP rows.
    expect(ws.autoFilter).toBe(`A${hdr}:AG${hdr + 2}`)
    expect(ws.views[0]).toMatchObject({ state: 'frozen', xSplit: 2 })
  })
})
