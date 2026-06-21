import { afterEach, describe, it, expect, vi } from 'vitest'
import { getFacilityBBSnapshot } from '../services/bbCalculationService'
import { api } from '../services/api'
import type { CommitLpRow } from '../services/api'
import { getFacilities, getSubmissions, formatLastRun } from '../services/facilityService'
import { getLPs, getLPByName, lookupLPsByName } from '../services/lpService'

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

describe('getFacilities — live', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps API facilities to display rows', async () => {
    stubFetch({
      '/api/facilities':  [{ id: 1, name: 'Test Fund', agentBank: 'Bank NA', status: 'Active', lpCount: 100, lastRunAt: null }],
      '/api/submissions': [],
    })
    const rows = await getFacilities()
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Test Fund')
    expect(rows[0].id).toBe(1)
    expect(rows[0].lps).toBe(100)
    expect(rows[0].accountNumber).toMatch(/^5V/)
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
    stubFetch({ '/api/lps': [{ name: 'CalPERS' }, { name: 'CalSTRS' }] })
    const lps = await getLPs()
    expect(lps.map(l => l.name)).toEqual(['CalPERS', 'CalSTRS'])
  })

  it('getLPByName returns the exact match from lookup', async () => {
    stubFetch({ '/api/lps/lookup': [{ name: 'CalPERS' }, { name: 'CalPERS Trust' }] })
    const lp = await getLPByName('CalPERS')
    expect(lp?.name).toBe('CalPERS')
  })

  it('getLPByName returns null when no exact match', async () => {
    stubFetch({ '/api/lps/lookup': [{ name: 'CalPERS Trust' }] })
    const lp = await getLPByName('CalPERS')
    expect(lp).toBeNull()
  })

  it('lookupLPsByName passes through API results', async () => {
    stubFetch({ '/api/lps/lookup': [{ name: 'Apollo Global' }] })
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
    expect(result).toEqual(summary)
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

// ── api.bb.run — LP commit payload ────────────────────────────────────────────

describe('api.bb.run — LP commit', () => {
  const snapshot = { id: 7, facilityId: 1, calculatedAt: '2026-06-12T21:00:00', result: { lps: [], summary: { totalUBB: 120.5 }, breaches: [] } }

  const lp: CommitLpRow = {
    name: 'CalPERS', parent: null, spv: false, hq: true,
    type: 'Institutional', region: 'North America', ig: true, cls: 'Rated',
    sp: 'AAA', mdy: 'Aaa', fitch: '',
    aum: '$500.0B', nav: null, pension: null, pensionFunded: null,
    capCommit: '$20.0M', pctCapCommit: null, calledCap: '$14.0M',
    uc: '$20.0M', pctUncalled: null, pctCalled: null,
    agentConc: '7.5%', ubsConc: '$25.0M', agentRate: '95.0%', abb: '$19.0M',
    inc: true, rcl: false, notes: null,
  }

  afterEach(() => vi.unstubAllGlobals())

  it('POSTs LP array in request body and returns snapshot', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot), { status: 201 }))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await api.bb.run(1, [lp])
    expect(result.id).toBe(7)

    const call = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('/api/bb/run/1')
    expect(call[1].method).toBe('POST')
    const body = JSON.parse(call[1].body as string) as { lps: CommitLpRow[] }
    expect(body.lps).toHaveLength(1)
    expect(body.lps[0].name).toBe('CalPERS')
    expect(body.lps[0].ubsConc).toBe('$25.0M')
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
    await expect(api.bb.run(1, [lp])).rejects.toThrow('500')
  })
})

// ── api.lps.saveClassification — Shadow BB "Save" ─────────────────────────────

describe('api.lps.saveClassification', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('PATCHes the classification rows and returns the updated count', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ updated: 2 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await api.lps.saveClassification({
      facilityId: 3,
      effectiveDate: '2026-06',
      rows: [
        { name: 'CalPERS', cls: 'Rated', sp: 'AAA', inc: true, uc: '$20.0M', ubsAdvRatePct: 90, ubsConcLimitPct: 7.5 },
        { name: 'Tiny Fund LLC', cls: 'Excluded', inc: false },
      ],
    })
    expect(result.updated).toBe(2)

    const call = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('/api/lps/classification')
    expect(call[1].method).toBe('PATCH')
    const body = JSON.parse(call[1].body as string) as { facilityId: number; rows: Array<{ name: string }> }
    expect(body.facilityId).toBe(3)
    expect(body.rows).toHaveLength(2)
    expect(body.rows[0].name).toBe('CalPERS')
  })

  it('throws on API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 400 })))
    await expect(api.lps.saveClassification({ facilityId: 1, rows: [] })).rejects.toThrow('400')
  })
})
