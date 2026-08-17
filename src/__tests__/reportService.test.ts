import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CollateralReport } from '../services/api'
import {
  breachTypeForTest,
  buildAgentBankRows,
  buildBreachRows,
  buildCertClassRows,
  buildCertRows,
  buildEarTrendRows,
  formatUsdAmount,
  buildHistoryRows,
  getAgentBankExposure,
  getCollateralReport,
  getConcentrationBreaches,
  getEarTrend,
  getReportHistory,
  recordReport,
} from '../services/reportService'
import type { BBBreach } from '../types/bb'

// Stub global fetch with a path→body map (same pattern as services.test.ts).
function stubFetch(routes: Record<string, unknown>) {
  const spy = vi.fn((url: string) => {
    const path = String(url)
    const key  = Object.keys(routes).find(k => path.includes(k))
    const body = key ? routes[key] : []
    return Promise.resolve(new Response(JSON.stringify(body ?? []), { status: 200 }))
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

// Mirrors the pe-sub-api CollateralReportDto contract. TEST ONLY fixture.
const COLLATERAL_FIXTURE: CollateralReport = {
  facilityId: 7,
  facilityName: 'Apex Growth Fund IV',
  agentBank: 'Wells Fargo',
  snapshotId: 42,
  calculatedAt: '2026-07-01T11:30:00',
  summary: {
    totalUBB: 26.5, totalABB: 26.5, bbDelta: -3.6784,
    ear: 0.874, agentEar: 0.892, earDelta: -0.018,
    includedCount: 2, excludedCount: 1,
  },
  totalEligibleUncalledM: 30,
  classBreakdown: [
    // ubsAdvanceRate is a fraction on the wire (CollateralReportDto.ClassBreakdownRow).
    { ubsLpCategory: 'Rated',        count: 1, uncalledM: 20, ubbM: 18,  ubsAdvanceRate: 0.9  },
    { ubsLpCategory: 'Unrated >2bn', count: 1, uncalledM: 10, ubbM: 7.5, ubsAdvanceRate: 0.75 },
    { ubsLpCategory: 'Excluded',     count: 1, uncalledM: 0,  ubbM: 0,   ubsAdvanceRate: 0    },
  ],
}

afterEach(() => vi.unstubAllGlobals())

// ── API wrappers (mocked fetch, mirroring the API contract) ───────────────────

describe('getCollateralReport', () => {
  it('fetches the certificate payload for a facility', async () => {
    stubFetch({ '/api/reports/collateral/7': COLLATERAL_FIXTURE })
    const r = await getCollateralReport(7)
    expect(r.facilityName).toBe('Apex Growth Fund IV')
    expect(r.summary.totalUBB).toBe(26.5)
    expect(r.classBreakdown).toHaveLength(3)
  })

  it('passes an explicit snapshotId as a query parameter', async () => {
    const spy = stubFetch({ '/api/reports/collateral/7': COLLATERAL_FIXTURE })
    await getCollateralReport(7, 42)
    expect(String(spy.mock.calls[0][0])).toContain('snapshotId=42')
  })
})

describe('getEarTrend', () => {
  it('returns one point per snapshot', async () => {
    stubFetch({ '/api/reports/ear/7': [
      { calculatedAt: '2026-06-01T10:00:00', ear: 0.87, agentEar: 0.89, earDelta: -0.02 },
      { calculatedAt: '2026-07-01T10:00:00', ear: 0.88, agentEar: 0.89, earDelta: -0.01 },
    ]})
    const points = await getEarTrend(7)
    expect(points).toHaveLength(2)
    expect(points[0].ear).toBe(0.87)
  })
})

describe('getAgentBankExposure', () => {
  it('returns per-bank aggregation rows', async () => {
    stubFetch({ '/api/reports/agent-banks': [
      { agentBank: 'Wells Fargo', facilityCount: 2, lpCount: 40, ubsBBM: 120.5, agentBBM: 118.2, deltaM: 2.3 },
    ]})
    const rows = await getAgentBankExposure()
    expect(rows[0].agentBank).toBe('Wells Fargo')
    expect(rows[0].ubsBBM).toBe(120.5)
  })
})

describe('getConcentrationBreaches', () => {
  it('unwraps the breaches array', async () => {
    stubFetch({ '/api/reports/concentration/7': { breaches: [
      { type: 'single-lp', severity: 'breach', message: 'CalPERS exceeds 15%', value: 0.68, limit: 0.15 },
    ]}})
    const breaches = await getConcentrationBreaches(7)
    expect(breaches).toHaveLength(1)
    expect(breaches[0].type).toBe('single-lp')
  })

  it('returns [] when the API sends no breaches field', async () => {
    stubFetch({ '/api/reports/concentration/7': {} })
    expect(await getConcentrationBreaches(7)).toEqual([])
  })
})

describe('report history service', () => {
  it('fetches history entries', async () => {
    stubFetch({ '/api/reports/history': [
      { id: 1, report: 'Collateral & Coverage', facilityId: 7, facilityName: 'Apex Growth Fund IV',
        snapshotLabel: 'Jul 1, 2026', format: 'PDF', userName: 'J. Smith', createdAt: '2026-07-01T12:00:00' },
    ]})
    const entries = await getReportHistory()
    expect(entries[0].report).toBe('Collateral & Coverage')
    expect(entries[0].facilityName).toBe('Apex Growth Fund IV')
  })

  it('POSTs a new history entry and returns the created record', async () => {
    const spy = stubFetch({ '/api/reports/history': {
      id: 2, report: 'Agent Bank Exposure', facilityId: null, facilityName: null,
      snapshotLabel: 'July 2026', format: 'XLSX', userName: 'J. Smith', createdAt: '2026-07-03T09:00:00',
    }})
    const created = await recordReport({ report: 'Agent Bank Exposure', format: 'XLSX' })
    expect(created.id).toBe(2)
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body)).report).toBe('Agent Bank Exposure')
  })
})

// ── Certificate view model ────────────────────────────────────────────────────

describe('buildCertRows', () => {
  it('formats the 6 certificate metrics from the numeric summary', () => {
    const rows = buildCertRows(COLLATERAL_FIXTURE)
    expect(rows.map(r => r.metric)).toEqual([
      'Total Eligible Uncalled Capital', 'Included LP Count', 'Total Borrowing Base',
      'Effective Advance Rate (EAR)', 'UBS BB Delta', 'UBS EAR Delta',
    ])
    expect(rows[0].ubs).toBe('$30,000,000')
    expect(rows[1].ubs).toBe('2')
    expect(rows[2].ubs).toBe('$26,500,000')
    expect(rows[2].cls).toBe('total')
    expect(rows[3].ubs).toBe('87.4%')
    expect(rows[3].agent).toBe('89.2%')
    expect(rows[4].ubs).toBe('-$3,678,400')
    expect(rows[4].cls).toBe('delta')
    expect(rows[5].ubs).toBe('-1.8%')
  })

  it('renders rounded-zero deltas without a sign', () => {
    const rows = buildCertRows({
      ...COLLATERAL_FIXTURE,
      summary: {
        ...COLLATERAL_FIXTURE.summary,
        bbDelta: -0.0000001,
        earDelta: -0.00001,
      },
    })
    expect(rows[4].ubs).toBe('$0')
    expect(rows[5].ubs).toBe('0%')
  })
})

describe('buildCertClassRows', () => {
  it('formats tiers and renders zero-money tiers as dashes', () => {
    const rows = buildCertClassRows(COLLATERAL_FIXTURE)
    expect(rows[0]).toEqual({
      ubsLpCategory: 'Rated', n: 1,
      uncalledCapital: '$20,000,000', ubsBorrowingBase: '$18,000,000', ubsAdvanceRate: '90%',
    })
    // Excluded tier carries no BB — must render '-' not '$0.0M'
    expect(rows[2]).toEqual({
      ubsLpCategory: 'Excluded', n: 1,
      uncalledCapital: '-', ubsBorrowingBase: '-', ubsAdvanceRate: '0%',
    })
  })

  it('returns [] for an empty breakdown', () => {
    expect(buildCertClassRows({ ...COLLATERAL_FIXTURE, classBreakdown: [] })).toEqual([])
  })
})

// ── Other view models ─────────────────────────────────────────────────────────

describe('buildEarTrendRows', () => {
  it('formats fractions as percentages with signed delta', () => {
    const rows = buildEarTrendRows([
      { calculatedAt: '2026-07-01T11:30:00', ear: 0.874, agentEar: 0.892, earDelta: -0.018 },
    ])
    expect(rows[0].ear).toBe('87.4%')
    expect(rows[0].agentEar).toBe('89.2%')
    expect(rows[0].delta).toBe('-1.8%')
    expect(rows[0].date).toContain('2026')
  })
})

describe('buildAgentBankRows', () => {
  it('formats amounts in default USD with no decimals', () => {
    const rows = buildAgentBankRows([
      { agentBank: 'Citi', facilityCount: 1, lpCount: 12, ubsBBM: 55.25, agentBBM: 60, deltaM: -4.75 },
    ])
    expect(rows[0]).toEqual({
      agentBank: 'Citi', facilities: 1, lps: 12,
      ubsBB: '$55,250,000', agentBB: '$60,000,000', delta: '-$4,750,000',
    })
  })
})

describe('concentration test mapping', () => {
  const BREACHES: BBBreach[] = [
    { type: 'single-lp', severity: 'breach',  message: 'CalPERS exceeds 15% single-lp concentration', value: 0.68, limit: 0.15 },
    { type: 'top10',     severity: 'warning', message: 'Top-10 LPs between 50–60% of UBS BB',          value: 0.55, limit: 0.60 },
  ]

  it('maps configured test labels to engine breach types', () => {
    expect(breachTypeForTest('single-lp limit breach (>15% of UBS BB)')).toBe('single-lp')
    expect(breachTypeForTest('Top-10 LP concentration breach (>60% of UBS BB)')).toBe('top10')
    expect(breachTypeForTest('Unrated aggregate exposure (>50% of UBS BB)')).toBe('unrated')
    expect(breachTypeForTest('Non-US LP aggregate exposure (>30% of UBS BB)')).toBe('non-us')
    expect(breachTypeForTest('Some unknown test')).toBeNull()
  })

  it('keeps only breaches whose type matches a selected test', () => {
    const rows = buildBreachRows(
      [{ facility: 'Apex Growth Fund IV', breaches: BREACHES }],
      ['single-lp limit breach (>15% of UBS BB)'],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].test).toBe('single-lp limit')
    expect(rows[0].value).toBe('68%')
    expect(rows[0].limit).toBe('15%')
  })

  it('returns no rows when no tests are selected', () => {
    expect(buildBreachRows([{ facility: 'F', breaches: BREACHES }], [])).toEqual([])
  })
})

describe('buildHistoryRows', () => {
  it('maps API entries to display rows', () => {
    const rows = buildHistoryRows([
      { id: 1, report: 'Collateral & Coverage', facilityId: 7, facilityName: 'Apex Growth Fund IV',
        snapshotLabel: 'Jul 1, 2026', format: 'PDF', userName: 'J. Smith', createdAt: '2026-07-01T12:00:00' },
    ])
    expect(rows[0].report).toBe('Collateral & Coverage')
    expect(rows[0].facility).toBe('Apex Growth Fund IV')
    expect(rows[0].fmt).toBe('PDF')
    expect(rows[0].user).toBe('J. Smith')
  })

  it('falls back to All Facilities / placeholders for null fields (portfolio-wide reports)', () => {
    const rows = buildHistoryRows([
      { id: 2, report: 'Agent Bank Exposure', facilityId: null, facilityName: null,
        snapshotLabel: null, format: null, userName: null, createdAt: '2026-07-03T09:00:00' },
    ])
    expect(rows[0].facility).toBe('All Facilities')
    expect(rows[0].report).toBe('Agent Bank Exposure')
    expect(rows[0].snap).toBe('—')
  })
})

describe('formatUsdAmount', () => {
  it('normalizes signed zero to plain $0 for tiny negative values', () => {
    expect(formatUsdAmount('-0.0000001M')).toBe('$0')
  })
})
