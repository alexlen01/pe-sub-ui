import { afterEach, describe, it, expect, vi } from 'vitest'
import { getFacilityBBSnapshot } from '../services/bbCalculationService'
import { api } from '../services/api'
import type { CommitLpRow } from '../services/api'
import { getFacilities, getSubmissions, formatLastRun } from '../services/facilityService'
import { getLPs, getLPById, lookupLPsByName } from '../services/lpService'
import { LP_DATA } from '../data/lpData'
import { FACILITIES, SUBMISSIONS } from '../data/facilityData'

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

// ── getFacilities (prototype mode) ────────────────────────────────────────────

describe('getFacilities — prototype mode', () => {
  it('returns an array', async () => {
    const rows = await getFacilities(false)
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('every row has required display fields', async () => {
    const rows = await getFacilities(false)
    for (const row of rows) {
      expect(typeof row.name).toBe('string')
      expect(typeof row.agentBank).toBe('string')
      expect(typeof row.status).toBe('string')
      expect(typeof row.lastRun).toBe('string')
    }
  })

  it('status values are valid', async () => {
    const valid = new Set(['Certified', 'Needs Review', 'In Progress', 'Not Started'])
    const rows = await getFacilities(false)
    for (const row of rows) {
      expect(valid.has(row.status), `Unexpected status: ${row.status}`).toBe(true)
    }
  })

  it('total row count matches FACILITIES data', async () => {
    const rows = await getFacilities(false)
    expect(rows.length).toBe(FACILITIES.length)
  })

  it('prototype id and latestSubmissionId are absent (undefined)', async () => {
    const rows = await getFacilities(false)
    for (const row of rows) {
      expect(row.id).toBeUndefined()
      expect(row.latestSubmissionId).toBeUndefined()
    }
  })
})

// ── getSubmissions (prototype mode) ──────────────────────────────────────────

describe('getSubmissions — prototype mode', () => {
  it('returns an array with facility and date fields', async () => {
    const rows = await getSubmissions(false)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(typeof row.facility).toBe('string')
      expect(typeof row.date).toBe('string')
      expect(typeof row.status).toBe('string')
    }
  })

  it('rows are sorted most-recent first', async () => {
    const rows = await getSubmissions(false)
    const expectedOrder = [...SUBMISSIONS]
      .sort((a, b) => b.date.localeCompare(a.date) || a.facility.localeCompare(b.facility))
      .map(s => s.facility)
    expect(rows.map(r => r.facility)).toEqual(expectedOrder)
  })
})

// ── LP service (prototype mode) ───────────────────────────────────────────────

describe('getLPs — prototype mode', () => {
  it('returns LP_DATA unchanged', async () => {
    const lps = await getLPs(false)
    expect(lps).toEqual(LP_DATA)
  })

  it('every LP has required typed fields', async () => {
    const lps = await getLPs(false)
    for (const lp of lps) {
      expect(typeof lp.name).toBe('string')
      expect(typeof lp.rank).toBe('number')
      expect(typeof lp.cls).toBe('string')
      expect(typeof lp.pension).toBe('string')
      expect(typeof lp.pensionFunded).toBe('string')
    }
  })
})

describe('getLPById — prototype mode', () => {
  it('returns matching LP by rank', async () => {
    const lp = await getLPById(false, 1)
    expect(lp).not.toBeNull()
    expect(lp!.rank).toBe(1)
  })

  it('returns null for non-existent rank', async () => {
    const lp = await getLPById(false, 99999)
    expect(lp).toBeNull()
  })
})

describe('lookupLPsByName — prototype mode', () => {
  it('filters by name case-insensitively', async () => {
    const results = await lookupLPsByName(false, 'apollo')
    expect(results.length).toBeGreaterThan(0)
    for (const lp of results) {
      expect(lp.name.toLowerCase()).toContain('apollo')
    }
  })

  it('limits results to 8', async () => {
    const results = await lookupLPsByName(false, 'a')
    expect(results.length).toBeLessThanOrEqual(8)
  })

  it('returns empty array for no match', async () => {
    const results = await lookupLPsByName(false, 'ZZZNOMATCH_XYZ')
    expect(results).toHaveLength(0)
  })
})

// ── getFacilityBBSnapshot (live mode, mocked fetch) ───────────────────────────

describe('getFacilityBBSnapshot — live mode', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the snapshot summary when the API has a snapshot', async () => {
    const summary = { totalUBB: 410.2, totalABB: 455.7, includedCount: 42 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ facilityId: 1, result: { summary } }), { status: 200 })
    ))
    const result = await getFacilityBBSnapshot(true, 1)
    expect(result).toEqual(summary)
  })

  it('returns null when the API responds 204 (no snapshot yet)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(getFacilityBBSnapshot(true, 1)).resolves.toBeNull()
  })

  it('returns null when the API responds 200 with an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
    await expect(getFacilityBBSnapshot(true, 1)).resolves.toBeNull()
  })

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })))
    await expect(getFacilityBBSnapshot(true, 1)).rejects.toThrow('500')
  })

  it('returns null in prototype mode without calling the API', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(getFacilityBBSnapshot(false, 1)).resolves.toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
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
