import { afterEach, describe, it, expect, vi } from 'vitest'
import { getFacilityBBSnapshot } from '../services/bbCalculationService'
import { api } from '../services/api'
import type { CommitLpRow } from '../services/api'
import { getClassificationConfig } from '../services/configService'
import { getFacilities, getSubmissions, formatLastRun, formatUsdNoDecimals, parseMoneyToNumber } from '../services/facilityService'
import { getLPs, getLPByName, lookupLPsByName } from '../services/lpService'
import { getExtractedLPs } from '../services/extractionService'

// Stub global fetch with a path→body map. The first registered key contained in the request
// URL wins, so register only the routes a given test needs.
function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const path = String(url)
    const key  = Object.keys(routes).find(k => path.includes(k))
    const body = key ? routes[key] : []
    return Promise.resolve(new Response(JSON.stringify(body ?? []), { status: 200 }))
  }))
}

// ── formatLastRun ─────────────────────────────────────────────────────────────

describe('formatLastRun', () => {
  it('returns — for null', () => expect(formatLastRun(null)).toBe('—'))
  it('returns — for undefined', () => expect(formatLastRun(undefined)).toBe('—'))
  it('returns Xh ago for today', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    expect(formatLastRun(twoHoursAgo)).toMatch(/^\d+h ago$/)
  })
  it('returns Xd ago for yesterday', () => {
    const yesterday = new Date(Date.now() - 25 * 3_600_000).toISOString()
    expect(formatLastRun(yesterday)).toMatch(/^\d+d ago$/)
  })
})

// ── getFacilities (live, mocked API) ──────────────────────────────────────────

describe('getClassificationConfig', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('merges distinct LP Master investor types into dropdown options', async () => {
    stubFetch({
      '/api/lp-master/investor-types': ['Investment Consultant', 'Pension Fund', 'Hedge Fund'],
      '/api/config/classification': {
        INVESTOR_TYPE_OPTS: ['', 'Pension Fund', 'Endowment'],
      },
    })

    const cfg = await getClassificationConfig()

    expect(cfg.INVESTOR_TYPE_OPTS).toEqual([
      '',
      'Endowment',
      'Hedge Fund',
      'Investment Consultant',
      'Pension Fund',
    ])
  })
})

describe('getFacilities — live', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps API facilities to display rows, including Agent Bank Summary fields', async () => {
    stubFetch({
      '/api/facilities':  [{ id: 1, name: 'Test Fund', agentBank: 'Bank NA', status: 'Active', lpCount: 100,
                             accountNumber: '5VX1796', loanAmount: 2_500_000_000, maturityDate: '2029-03-15',
                             collateralDate: '2026-06-01', lastRunAt: null }],
      '/api/submissions': [],
    })
    const rows = await getFacilities()
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Test Fund')
    expect(rows[0].id).toBe(1)
    expect(rows[0].lps).toBe(100)
    // Real API values flow through — no client-side stub generation.
    expect(rows[0].accountNumber).toBe('5VX1796')
    expect(rows[0].loanAmount).toBe('$2,500,000,000')
    expect(rows[0].maturityDate).toBe('Mar 15, 2029')
    expect(rows[0].collateralDate).toBe('Jun 1, 2026')
  })

  it('maps facility size / UBS participation and derives the participation rate', async () => {
    stubFetch({
      '/api/facilities':  [{ id: 1, name: 'Test Fund', agentBank: 'Bank NA', status: 'Active', lpCount: 100,
                             facilitySize: 2_000_000_000, ubsParticipation: 500_000_000, lastRunAt: null }],
      '/api/submissions': [],
    })
    const rows = await getFacilities()
    expect(rows[0].facilitySize).toBe('$2.0B')
    expect(rows[0].ubsParticipation).toBe('$500.0M')
    expect(rows[0].ubsParticipationRate).toBe('25%')
  })

  it('shows — for facility size / participation when unset', async () => {
    stubFetch({
      '/api/facilities':  [{ id: 2, name: 'New Fund', agentBank: 'Citi', status: 'Not Started', lpCount: 0,
                             facilitySize: null, ubsParticipation: null, lastRunAt: null }],
      '/api/submissions': [],
    })
    const rows = await getFacilities()
    expect(rows[0].facilitySize).toBe('—')
    expect(rows[0].ubsParticipation).toBe('—')
    expect(rows[0].ubsParticipationRate).toBe('—')
  })

  it('shows — for unset Agent Bank Summary fields', async () => {
    stubFetch({
      '/api/facilities':  [{ id: 2, name: 'New Fund', agentBank: 'Citi', status: 'Not Started', lpCount: 0,
                             accountNumber: null, loanAmount: null, maturityDate: null, collateralDate: null, lastRunAt: null }],
      '/api/submissions': [],
    })
    const rows = await getFacilities()
    expect(rows[0].accountNumber).toBe('—')
    expect(rows[0].loanAmount).toBe('—')
    expect(rows[0].maturityDate).toBe('—')
    expect(rows[0].collateralDate).toBe('—')
  })

  it('maps the latest Shadow BB figures (Agent BB / UBS BB / delta / EAR) from the API', async () => {
    stubFetch({
      '/api/facilities':  [{ id: 1, name: 'Test Fund', agentBank: 'Bank NA', status: 'Active', lpCount: 100,
                             agentBB: 138.6, ubsBB: 130.4, bbDelta: -8.2, ear: 0.874, lastRunAt: null }],
      '/api/submissions': [],
    })
    const rows = await getFacilities()
    expect(rows[0].agentBB).toBe('$138.6M')
    expect(rows[0].ubsBB).toBe('$130.4M')
    expect(rows[0].delta).toBe('-$8.2M')
    expect(rows[0].ear).toBe('87.4%')
  })

  it('shows — for Shadow BB figures before any BB has been run', async () => {
    stubFetch({
      '/api/facilities':  [{ id: 2, name: 'New Fund', agentBank: 'Citi', status: 'Not Started', lpCount: 0,
                             agentBB: null, ubsBB: null, bbDelta: null, ear: null, lastRunAt: null }],
      '/api/submissions': [],
    })
    const rows = await getFacilities()
    expect(rows[0].agentBB).toBe('—')
    expect(rows[0].ubsBB).toBe('—')
    expect(rows[0].delta).toBe('—')
    expect(rows[0].ear).toBe('—')
  })

  it('derives the wizard step from the latest in-Review submission', async () => {
    stubFetch({
      '/api/facilities':  [{ id: 7, name: 'Apollo XI', agentBank: 'Citi', status: 'Review', lpCount: 50, lastRunAt: null }],
      '/api/submissions': [{ id: 3, facilityId: 7, status: 'Review', wizardStep: 4 }],
    })
    const rows = await getFacilities()
    expect(rows[0].step).toBe(4)
    expect(rows[0].latestSubmissionId).toBe(3)
  })
})

// ── parseMoneyToNumber ────────────────────────────────────────────────────────

describe('parseMoneyToNumber', () => {
  it('parses suffixed dollar amounts to plain numbers', () => {
    expect(parseMoneyToNumber('$2.5B')).toBe(2_500_000_000)
    expect(parseMoneyToNumber('150M')).toBe(150_000_000)
    expect(parseMoneyToNumber('$1,200,000')).toBe(1_200_000)
    expect(parseMoneyToNumber('500K')).toBe(500_000)
    expect(parseMoneyToNumber('500000000')).toBe(500_000_000)
  })
  it('returns null for blank / dash / unparseable input', () => {
    expect(parseMoneyToNumber('')).toBeNull()
    expect(parseMoneyToNumber('—')).toBeNull()
    expect(parseMoneyToNumber(null)).toBeNull()
    expect(parseMoneyToNumber('n/a')).toBeNull()
  })
})

describe('formatUsdNoDecimals', () => {
  it('formats dollar values with US grouping and no decimals', () => {
    expect(formatUsdNoDecimals(500_000_000)).toBe('$500,000,000')
  })
})

// ── api.facilities.update (PATCH /api/facilities/{id}) ─────────────────────────

describe('api.facilities.update', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('PATCHes the Agent Bank Summary fields and returns the saved facility', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return Promise.resolve(new Response(JSON.stringify({
        id: 1, name: 'Test Fund', agentBank: 'Bank NA', status: 'Active', lpCount: 100,
        accountNumber: '5VX1796', loanAmount: 2_500_000_000, maturityDate: '2029-03-15',
        collateralDate: '2026-06-01', lastRunAt: null,
      }), { status: 200 }))
    }))

    const saved = await api.facilities.update(1, { accountNumber: '5VX1796', loanAmount: 2_500_000_000, maturityDate: '2029-03-15', collateralDate: '2026-06-01' })

    expect(calls[0].url).toContain('/api/facilities/1')
    expect(calls[0].init?.method).toBe('PATCH')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ accountNumber: '5VX1796', loanAmount: 2_500_000_000, maturityDate: '2029-03-15', collateralDate: '2026-06-01' })
    expect(saved.accountNumber).toBe('5VX1796')
    expect(saved.loanAmount).toBe(2_500_000_000)
    expect(saved.maturityDate).toBe('2029-03-15')
    expect(saved.collateralDate).toBe('2026-06-01')
  })

  it('PATCHes the editable Identity fields (name + agentBank)', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return Promise.resolve(new Response(JSON.stringify({
        id: 1, name: 'Renamed Fund', agentBank: 'JPMorgan', status: 'Active', lpCount: 0, lastRunAt: null,
      }), { status: 200 }))
    }))

    const saved = await api.facilities.update(1, { name: 'Renamed Fund', agentBank: 'JPMorgan' })

    expect(calls[0].init?.method).toBe('PATCH')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ name: 'Renamed Fund', agentBank: 'JPMorgan' })
    expect(saved.name).toBe('Renamed Fund')
    expect(saved.agentBank).toBe('JPMorgan')
  })

  it('surfaces the API ProblemDetail message on a name conflict (409)', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ detail: 'A facility with this name already exists.' }), { status: 409 }))
    ))
    await expect(api.facilities.update(1, { name: 'Taken Name' }))
      .rejects.toThrow('A facility with this name already exists.')
  })
})

// ── api.facilities.setStatus (deactivate / reactivate) ─────────────────────────

describe('api.facilities.setStatus', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('PATCHes the status to Inactive (deactivate)', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return Promise.resolve(new Response(JSON.stringify({
        id: 4, name: 'Idle Fund', agentBank: 'Citi', status: 'Inactive', lpCount: 0, lastRunAt: null,
      }), { status: 200 }))
    }))

    const saved = await api.facilities.setStatus(4, 'Inactive')

    expect(calls[0].url).toContain('/api/facilities/4/status')
    expect(calls[0].init?.method).toBe('PATCH')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ status: 'Inactive' })
    expect(saved.status).toBe('Inactive')
  })

  it('surfaces the API ProblemDetail message when deactivation is blocked (409)', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ detail: 'Cannot deactivate a facility that has LP records.' }), { status: 409 }))
    ))
    await expect(api.facilities.setStatus(4, 'Inactive'))
      .rejects.toThrow('Cannot deactivate a facility that has LP records.')
  })
})

// ── api.facilities.remove (DELETE /api/facilities/{id}) ────────────────────────

describe('api.facilities.remove', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('issues a DELETE to the facility resource', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return Promise.resolve(new Response(null, { status: 204 }))
    }))

    await api.facilities.remove(9)

    expect(calls[0].url).toContain('/api/facilities/9')
    expect(calls[0].init?.method).toBe('DELETE')
  })

  it('rejects with the API ProblemDetail message when the facility still has LP records (409)', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ detail: 'Cannot delete a facility that has LP records (3). Remove its LP records first.' }), { status: 409 }))
    ))
    await expect(api.facilities.remove(9)).rejects.toThrow('Cannot delete a facility that has LP records')
  })
})

// ── getSubmissions (live, mocked API) ─────────────────────────────────────────

describe('getSubmissions — live', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps API submissions to display rows', async () => {
    stubFetch({
      '/api/submissions': [{ id: 5, facilityId: 1, facilityName: 'Test Fund', status: 'Review', wizardStep: 3, fileName: 'bb.xlsx', agentBank: 'Bank NA', notes: null, createdAt: '2026-06-01T00:00:00' }],
    })
    const rows = await getSubmissions()
    expect(rows[0].facility).toBe('Test Fund')
    expect(rows[0].action).toBe('Resolve')
    expect(rows[0].step).toBe(3)
  })
})

// ── LP service (live, mocked API) ─────────────────────────────────────────────

describe('getLPs / getLPByName / lookupLPsByName — live', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('getLPs returns the API LP list', async () => {
    stubFetch({ '/api/lpRecords': [{ name: 'CalPERS' }, { name: 'CalSTRS' }] })
    const lps = await getLPs()
    expect(lps.map(l => l.name)).toEqual(['CalPERS', 'CalSTRS'])
  })

  it('getLPs passes the facility-specific rank through from the API', async () => {
    // The API serves the persisted competition rank (by uncalled capital) on each LP record;
    // non-rankable LPs (e.g. Excluded / not-included) carry a null rank.
    stubFetch({ '/api/lpRecords': [
      { name: 'CalPERS', rank: 1 },
      { name: 'CalSTRS', rank: 2 },
      { name: 'Tiny Fund LLC', rank: null },
    ] })
    const lps = await getLPs()
    expect(lps.map(l => l.rank)).toEqual([1, 2, null])
  })

  it('getLPByName returns the exact match from lookup', async () => {
    stubFetch({ '/api/lpRecords/lookup': [{ name: 'CalPERS' }, { name: 'CalPERS Trust' }] })
    const LPRecord = await getLPByName('CalPERS')
    expect(LPRecord?.name).toBe('CalPERS')
  })

  it('getLPByName returns null when no exact match', async () => {
    stubFetch({ '/api/lpRecords/lookup': [{ name: 'CalPERS Trust' }] })
    const LPRecord = await getLPByName('CalPERS')
    expect(LPRecord).toBeNull()
  })

  it('lookupLPsByName passes through API results', async () => {
    stubFetch({ '/api/lpRecords/lookup': [{ name: 'Apollo Global' }] })
    const rows = await lookupLPsByName('apollo')
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Apollo Global')
  })
})

// ── getFacilityBBSnapshot (live, mocked fetch) ────────────────────────────────

describe('getFacilityBBSnapshot — live mode', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the snapshot summary when the API has a snapshot', async () => {
    const summary = { totalUBB: 410.2, totalABB: 455.7, includedCount: 42 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ facilityId: 1, result: { summary } }), { status: 200 })
    ))
    const result = await getFacilityBBSnapshot(1)
    expect(result).toEqual({ summary, breaches: [] })
  })

  it('passes through the snapshot breaches persisted with the run', async () => {
    const summary  = { totalUBB: 410.2 }
    const breaches = [
      { type: 'single-lp', severity: 'breach', message: 'CalPERS exceeds 40% single-lp concentration', value: 0.5, limit: 0.4 },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ facilityId: 1, result: { summary, breaches } }), { status: 200 })
    ))
    const result = await getFacilityBBSnapshot(1)
    expect(result?.breaches).toHaveLength(1)
    expect(result?.breaches[0].type).toBe('single-lp')
    expect(result?.breaches[0].limit).toBeCloseTo(0.4)
  })

  it('returns null when the API responds 204 (no snapshot yet)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(getFacilityBBSnapshot(1)).resolves.toBeNull()
  })

  it('returns null when the API responds 200 with an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
    await expect(getFacilityBBSnapshot(1)).resolves.toBeNull()
  })

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })))
    await expect(getFacilityBBSnapshot(1)).rejects.toThrow('500')
  })
})

// ── api.matching.decideBatch ──────────────────────────────────────────────────

describe('api.matching.decideBatch', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('PATCHes all decisions to /queue/decisions in one request', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return Promise.resolve(new Response(JSON.stringify([
        { id: 11, decision: 'Accepted' },
        { id: 12, decision: 'Rejected' },
      ]), { status: 200 }))
    }))

    const saved = await api.matching.decideBatch([
      { id: 11, decision: 'Accepted' },
      { id: 12, decision: 'Rejected' },
    ])

    // One round-trip for the whole selection, not one PATCH per row.
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('/api/matching/queue/decisions')
    expect(calls[0].init?.method).toBe('PATCH')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      decisions: [
        { id: 11, decision: 'Accepted' },
        { id: 12, decision: 'Rejected' },
      ],
    })
    expect(saved).toHaveLength(2)
    expect(saved[1].decision).toBe('Rejected')
  })
})

// ── api.bb.run — LP commit payload ────────────────────────────────────────────

describe('api.bb.run — LP commit', () => {
  const snapshot = { id: 7, facilityId: 1, calculatedAt: '2026-06-12T21:00:00', result: { lps: [], summary: { totalUBB: 120.5 }, breaches: [] } }

  const LPRecord: CommitLpRow = {
    name: 'CalPERS', parent: null, spv: false, hq: true,
    instVsHnw: 'Institutional', region: 'North America', ig: true, cls: 'Rated',
    sp: 'AAA', mdy: 'Aaa', fitch: '',
    aum: '$500.0B', nav: null, pension: null, pensionFunded: null,
    capCommit: '$20.0M', pctCapCommit: null, calledCap: '$14.0M',
    uc: '$20.0M', pctUncalled: null, pctCalled: null,
    agentConc: '7.5%', ubsConc: '7.5%', ubsRate: '90%', agentRate: '95.0%', abb: '$19.0M',
    inc: true, rcl: false, notes: null,
  }

  afterEach(() => vi.unstubAllGlobals())

  it('POSTs LP array in request body and returns snapshot', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot), { status: 201 }))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await api.bb.run(1, [LPRecord])
    expect(result.id).toBe(7)

    const call = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('/api/bb/run/1')
    expect(call[1].method).toBe('POST')
    const body = JSON.parse(call[1].body as string) as { lps: CommitLpRow[] }
    expect(body.lps).toHaveLength(1)
    expect(body.lps[0].name).toBe('CalPERS')
    expect(body.lps[0].ubsConc).toBe('7.5%')
    // The resolved UBS advance rate must round-trip so it reaches LP Master (writeBack reads it).
    expect(body.lps[0].ubsRate).toBe('90%')
  })

  it('returns the config-driven breaches from the run response', async () => {
    // Mirrors the API contract: the engine evaluates the conc_limits config on every run and
    // persists the verdict in the snapshot — the UI must surface this list, not recompute it.
    const withBreaches = {
      ...snapshot,
      result: {
        ...snapshot.result,
        breaches: [
          { type: 'single-lp', severity: 'breach',  message: 'CalPERS exceeds 40% single-lp concentration', value: 0.5,    limit: 0.4 },
          { type: 'top10',     severity: 'warning', message: 'Top-10 LPs between 80–90% of UBS BB',          value: 0.8333, limit: 0.9 },
        ],
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(withBreaches), { status: 201 })))

    const result = await api.bb.run(1, [LPRecord])
    expect(result.result.breaches).toHaveLength(2)
    expect(result.result.breaches[0].type).toBe('single-lp')
    expect(result.result.breaches[0].limit).toBeCloseTo(0.4)
    expect(result.result.breaches[1].severity).toBe('warning')
  })

  it('POSTs with no body when no LPs provided', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot), { status: 201 }))
    vi.stubGlobal('fetch', fetchSpy)

    await api.bb.run(1)

    const call = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(call[1].body).toBeUndefined()
  })

  it('throws on API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 500 })))
    await expect(api.bb.run(1, [LPRecord])).rejects.toThrow('500')
  })
})

// ── api.lpRecords.saveClassification — Shadow BB "Save" ─────────────────────────────

describe('api.lpRecords.saveClassification', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('PATCHes the classification rows and returns the updated count', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ updated: 2 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await api.lpRecords.saveClassification({
      facilityId: 3,
      effectiveDate: '2026-06',
      rows: [
        {
          name: 'CalPERS',
          fundSleeve: 'Main Fund',
          region: 'North America',
          investorType: 'Public Pension',
          instVsHnw: 'Institutional',
          cls: 'Rated',
          sp: 'AAA',
          inc: true,
          uc: '$20.0M',
          ubsAdvRatePct: 90,
          ubsConcLimitPct: 7.5,
        },
        { name: 'Tiny Fund LLC', cls: 'Excluded', inc: false },
      ],
    })
    expect(result.updated).toBe(2)

    const call = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('/api/lpRecords/classification')
    expect(call[1].method).toBe('PATCH')
    const body = JSON.parse(call[1].body as string) as { facilityId: number; rows: Array<{ name: string }> }
    expect(body.facilityId).toBe(3)
    expect(body.rows).toHaveLength(2)
    expect(body.rows[0].name).toBe('CalPERS')
    expect(body.rows[0]).toMatchObject({
      fundSleeve: 'Main Fund',
      region: 'North America',
      investorType: 'Public Pension',
      instVsHnw: 'Institutional',
    })
  })

  it('throws on API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 400 })))
    await expect(api.lpRecords.saveClassification({ facilityId: 1, rows: [] })).rejects.toThrow('400')
  })
})

// ── getExtractedLPs — Agent BB % derivation ───────────────────────────────────

describe('getExtractedLPs — Agent BB % derivation', () => {
  afterEach(() => vi.unstubAllGlobals())

  // The API serializes unmapped columns as empty strings (e.g. "pctBBFmt":""), not null —
  // these fixtures mirror that contract exactly.
  it('calculates "% of Borrowing Base" and flags it when the file maps Borrowing Base but no BB-% column', async () => {
    stubFetch({
      '/extracted-lps': [
        { id: 1, name: 'CalPERS', agentBBFmt: '$60,000,000', pctBBFmt: '' },
        { id: 2, name: 'CalSTRS', agentBBFmt: '$40,000,000', pctBBFmt: '' },
      ],
    })
    const rows = await getExtractedLPs(1)
    // Each LP's share = its Borrowing Base ÷ total Borrowing Base ($100M)
    expect(rows[0].pctBBFmt).toBe('60.00%')
    expect(rows[1].pctBBFmt).toBe('40.00%')
    expect(rows[0].pctBBCalculated).toBe(true)
    expect(rows[1].pctBBCalculated).toBe(true)
  })

  it('leaves a file-provided "% of Borrowing Base" untouched and does not flag it as calculated', async () => {
    stubFetch({
      '/extracted-lps': [
        { id: 1, name: 'CalPERS', agentBBFmt: '$60,000,000', pctBBFmt: '55.00%' },
      ],
    })
    const rows = await getExtractedLPs(1)
    // Provided value passes through — not recomputed to the 100% single-row share
    expect(rows[0].pctBBFmt).toBe('55.00%')
    expect(rows[0].pctBBCalculated).toBe(false)
  })

  it('does not flag BB % as calculated when no Borrowing Base column was mapped', async () => {
    // BB $ here is itself derived (uncalled × rate) and its column is blank ("");
    // with no mapped Borrowing Base column the BB-% is not surfaced as calculated.
    stubFetch({
      '/extracted-lps': [
        { id: 1, name: 'CalPERS', agentBBFmt: '', pctBBFmt: '', uncalled: '$100,000,000', agentRate: '90%' },
      ],
    })
    const rows = await getExtractedLPs(1)
    expect(rows[0].pctBBCalculated).toBe(false)
  })
})
