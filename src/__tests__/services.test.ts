import { describe, it, expect } from 'vitest'
import { getFacilities, getSubmissions, formatLastRun } from '../services/facilityService'
import { getLPs, getLPById, lookupLPsByName } from '../services/lpService'
import { LP_DATA } from '../data/lpData'
import { FACILITIES } from '../data/facilityData'

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
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].date >= rows[i].date || rows[i - 1].facility <= rows[i].facility).toBe(true)
    }
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
