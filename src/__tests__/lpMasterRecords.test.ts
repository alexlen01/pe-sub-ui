import { describe, it, expect, vi, afterEach } from 'vitest'
import { api } from '../services/api'
import { getMatchQueue } from '../services/matchingService'
import { descendantIds, displayParent, hasUnlinkedSponsor, isOwnUltimateParent, lpSizeOf, sizeMeasureOf } from '../screens/LPMasterRecords'
import { appliedEntity } from '../screens/MatchQueue'
import type { LpMasterRecord } from '../services/api'

/** Captures method/url/body so contract tests can assert what was actually sent. */
function stubFetch(routes: Record<string, unknown>, calls: { url: string; init?: RequestInit }[] = []) {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const path = String(url)
    const key = Object.keys(routes).find(k => path.includes(k))
    return Promise.resolve(new Response(JSON.stringify(key ? routes[key] : []), { status: 200 }))
  }))
  return calls
}

/**
 * Mirrors LpMasterDto exactly. The API omits or nulls string fields it never set, which is the
 * case the boundary normalisation exists for — the fixture keeps those keys absent on purpose.
 */
const apiRow = (over: Record<string, unknown> = {}) => ({
  id: 1,
  investorName: 'Apollo Global Management',
  parent: null,
  parentId: null,
  isUltimateParent: true,
  ultimateParent: null,
  childCount: 0,
  spv: false,
  highQuality: true,
  investorType: 'Private Equity',
  institutionalOrHnw: 'Institutional',
  regionLocation: 'North America',
  investmentGrade: true,
  ubsLpCategory: 'Rated Investor',
  spRating: 'A-',
  moodysRating: 'A3',
  fitchRating: '',
  aum: '$650.0B',
  nav: null,
  pensionAssets: null,
  fundingRatio: null,
  ubsDefaultAdvanceRate: 0.9,
  ubsDefaultConcentrationLimit: '7.5%',
  notes: null,
  ...over,
})

const record = (over: Partial<LpMasterRecord> = {}): LpMasterRecord => ({
  id: 1, investorName: 'LP', parent: '', parentId: null, isUltimateParent: true,
  ultimateParent: null, childCount: 0, spv: false, highQuality: true,
  investorType: '', institutionalOrHnw: '', regionLocation: '', investmentGrade: false,
  ubsLpCategory: '', spRating: '', moodysRating: '', fitchRating: '',
  aum: '', nav: '', pensionAssets: '', fundingRatio: null,
  ubsDefaultAdvanceRate: null, ubsDefaultConcentrationLimit: '', notes: '',
  ...over,
})

// ── api.lpMaster contract ─────────────────────────────────────────────────────

describe('api.lpMaster.list', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders the real curated profile values, not placeholders', async () => {
    stubFetch({ '/api/lp-master': [apiRow()] })
    const [row] = await api.lpMaster.list()

    expect(row.investorName).toBe('Apollo Global Management')
    expect(row.ubsLpCategory).toBe('Rated Investor')
    expect(row.spRating).toBe('A-')
    expect(row.moodysRating).toBe('A3')
    expect(row.aum).toBe('$650.0B')
    // Advance rate stays a fraction across the boundary — 0.9 is 90%, never 90.
    expect(row.ubsDefaultAdvanceRate).toBe(0.9)
    // The concentration limit keeps its percent-or-dollars display text.
    expect(row.ubsDefaultConcentrationLimit).toBe('7.5%')
  })

  it('pins absent string fields to "" so screens sort without null guards', async () => {
    stubFetch({ '/api/lp-master': [apiRow({ parent: null, nav: null, notes: null, fitchRating: null })] })
    const [row] = await api.lpMaster.list()

    expect(row.parent).toBe('')
    expect(row.nav).toBe('')
    expect(row.notes).toBe('')
    expect(row.fitchRating).toBe('')
    // Numeric absence stays null — '' would sort as a value.
    expect(row.fundingRatio).toBeNull()
    // ultimateParent is genuinely nullable: null means "this row is the ultimate entity".
    expect(row.ultimateParent).toBeNull()
  })

  it('carries the resolved hierarchy for a feeder', async () => {
    stubFetch({ '/api/lp-master': [apiRow({
      id: 2, investorName: 'Apollo GRE IV, LP',
      parent: 'Apollo Global Management', parentId: 1,
      isUltimateParent: false, ultimateParent: 'Apollo Global Management',
    })] })
    const [row] = await api.lpMaster.list()

    expect(row.parentId).toBe(1)
    expect(row.isUltimateParent).toBe(false)
    expect(row.ultimateParent).toBe('Apollo Global Management')
  })

  it('surfaces a failed load rather than returning empty data', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 500 }))))
    await expect(api.lpMaster.list()).rejects.toThrow('500')
  })
})

describe('api.lpMaster.update', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('PUTs the full editable subset to the record id', async () => {
    const calls = stubFetch({ '/api/lp-master/7': apiRow({ id: 7 }) })
    await api.lpMaster.update(7, {
      investorName: 'Apollo GRE IV, LP',
      parent: 'Apollo Global Management', parentId: 1,
      spv: true, highQuality: true, investmentGrade: false,
      investorType: 'Private Equity', institutionalOrHnw: 'Institutional',
      regionLocation: 'EMEA', ubsLpCategory: 'Rated Investor',
      spRating: '', moodysRating: '', fitchRating: '',
      aum: '', nav: '$1.2B', pensionAssets: '', fundingRatio: null,
      ubsDefaultAdvanceRate: 0.75, ubsDefaultConcentrationLimit: '5.0%',
      notes: '',
    })

    expect(calls[0].url).toContain('/api/lp-master/7')
    // PUT, not PATCH: the panel submits every field, so an omitted value means cleared.
    expect(calls[0].init?.method).toBe('PUT')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.parentId).toBe(1)
    expect(body.parent).toBe('Apollo Global Management')
    expect(body.nav).toBe('$1.2B')
    expect(body.ubsDefaultAdvanceRate).toBe(0.75)
  })

  it('propagates a rejected parent link as an error, not a silent no-op', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ detail: "'Apollo GRE IV, LP' is already a descendant of 'Apollo Global Management'" }),
      { status: 400 },
    ))))
    await expect(api.lpMaster.update(1, record() as never)).rejects.toThrow(/already a descendant/)
  })
})

describe('api.lpMaster.children / aliases', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches direct children for a record', async () => {
    stubFetch({ '/api/lp-master/1/children': [apiRow({ id: 2, investorName: 'Apollo GRE IV, LP' })] })
    const kids = await api.lpMaster.children(1)
    expect(kids).toHaveLength(1)
    expect(kids[0].investorName).toBe('Apollo GRE IV, LP')
  })

  it('fetches the accepted agent strings recorded against a record', async () => {
    stubFetch({ '/api/lp-master/1/aliases': ['APOLLO GRE IV', 'APOLLO GRE IV LP'] })
    expect(await api.lpMaster.aliases(1)).toEqual(['APOLLO GRE IV', 'APOLLO GRE IV LP'])
  })
})

// ── Match queue routing passthrough ───────────────────────────────────────────

describe('getMatchQueue parent routing', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('passes the API-resolved agent and ultimate parents through to the screen', async () => {
    stubFetch({ '/api/matching/queue': [{
      id: 1, submissionId: 9, agentName: 'Apollo Global Real Estate Fnd IV',
      masterName: 'Apollo GRE IV, LP', masterLpId: 2,
      agentParent: 'Apollo Global Mgmt', masterParent: 'Apollo Global Management',
      score: 89, decision: 'Pending', status: 'Pending', isNew: false,
    }] })

    const [row] = await getMatchQueue(9)
    expect(row.agentParent).toBe('Apollo Global Mgmt')
    expect(row.masterParent).toBe('Apollo Global Management')
    expect(row.masterLpId).toBe(2)
  })

  it('renders a null ultimate parent as empty, which the screen reads as "Self"', async () => {
    stubFetch({ '/api/matching/queue': [{
      id: 1, submissionId: 9, agentName: 'State Teachers Retirement Sys',
      masterName: 'State Teachers Ret. System', masterLpId: 5,
      agentParent: null, masterParent: null,
      score: 94, decision: 'Pending', status: 'Pending', isNew: false,
    }] })

    const [row] = await getMatchQueue(9)
    expect(row.agentParent).toBe('')
    expect(row.masterParent).toBe('')
  })
})

describe('appliedEntity — whose profile an Accept applies', () => {
  it('names the ultimate parent when the match is a feeder', () => {
    const applied = appliedEntity({ masterName: 'Apollo GRE IV, LP', masterParent: 'Apollo Global Management' })
    expect(applied).toEqual({ label: 'Apollo Global Management', routed: true, matched: true })
  })

  it('reads Self when the match is already the ultimate entity', () => {
    const applied = appliedEntity({ masterName: 'State Teachers Ret. System', masterParent: '' })
    expect(applied).toEqual({ label: 'Self', routed: false, matched: true })
  })

  it('distinguishes "no match at all" from "self" — a new LP applies nothing', () => {
    const applied = appliedEntity({ masterName: null, masterParent: '' })
    expect(applied.matched).toBe(false)
    expect(applied.routed).toBe(false)
  })

  it('treats a whitespace-only parent as self, not as a routed entity', () => {
    expect(appliedEntity({ masterName: 'Some LP', masterParent: '   ' }).label).toBe('Self')
  })
})

// ── Hierarchy helpers ─────────────────────────────────────────────────────────

describe('descendantIds — sponsor picker guard', () => {
  const tree = [
    record({ id: 1, investorName: 'Sponsor' }),
    record({ id: 2, investorName: 'Feeder A', parentId: 1, isUltimateParent: false }),
    record({ id: 3, investorName: 'Feeder B', parentId: 1, isUltimateParent: false }),
    record({ id: 4, investorName: 'SPV under A', parentId: 2, isUltimateParent: false }),
    record({ id: 5, investorName: 'Unrelated' }),
  ]

  it('collects the whole subtree, not just direct children', () => {
    expect([...descendantIds(1, tree)].sort()).toEqual([1, 2, 3, 4])
  })

  it('leaves unrelated rows selectable as a sponsor', () => {
    expect(descendantIds(1, tree).has(5)).toBe(false)
  })

  it('returns just the row itself for a leaf', () => {
    expect([...descendantIds(4, tree)]).toEqual([4])
  })

  it('terminates on a cyclic link instead of spinning', () => {
    const cyclic = [
      record({ id: 1, investorName: 'A', parentId: 2, isUltimateParent: false }),
      record({ id: 2, investorName: 'B', parentId: 1, isUltimateParent: false }),
    ]
    expect([...descendantIds(1, cyclic).values()].sort()).toEqual([1, 2])
  })
})

describe('displayParent — the feed\'s own-name "no parent" convention', () => {
  // The live LP Master feed writes a record's own name into `parent` to mean "no parent"; roughly
  // 2,500 of ~6,000 rows carry it. Showing that as a sponsor — or flagging it as an unlinked one —
  // would be wrong on nearly half the table.
  it('reads a self-named parent as no parent at all', () => {
    const r = record({ investorName: 'Apex Global Retirement Trust', parent: 'Apex Global Retirement Trust' })
    expect(displayParent(r)).toBe('')
    expect(hasUnlinkedSponsor(r)).toBe(false)
  })

  it('keeps a genuine sponsor name', () => {
    const r = record({ investorName: 'Apollo GRE IV, LP', parent: 'Apollo Global Management', parentId: 1 })
    expect(displayParent(r)).toBe('Apollo Global Management')
    expect(hasUnlinkedSponsor(r)).toBe(false)
  })

  it('flags a named sponsor that resolved to no record', () => {
    const r = record({ investorName: 'Apollo GRE IV, LP', parent: 'Sponsor Not Yet Onboarded', parentId: null })
    expect(displayParent(r)).toBe('Sponsor Not Yet Onboarded')
    expect(hasUnlinkedSponsor(r)).toBe(true)
  })

  it('treats a case-variant sponsor as a real one — those are distinct LP Master rows', () => {
    // The live data holds e.g. "BEACON STATE PENSION FUND" whose parent is "Beacon State Pension
    // Fund": two separate rows, genuinely linked. A case-insensitive check would erase that.
    const r = record({ investorName: 'BEACON STATE PENSION FUND', parent: 'Beacon State Pension Fund', parentId: 2106 })
    expect(displayParent(r)).toBe('Beacon State Pension Fund')
  })

  it('reads an empty parent as no parent', () => {
    expect(displayParent(record({ parent: '' }))).toBe('')
    expect(hasUnlinkedSponsor(record({ parent: '' }))).toBe(false)
  })
})

describe('isOwnUltimateParent — the Parent column\'s "Self" marker', () => {
  // The column used to render an em dash here, which reads as missing data on roughly half the
  // table. These rows are not missing a sponsor; they state that they are the top of their chain.
  it('holds for the feed\'s self-named parent', () => {
    const r = record({ investorName: 'Apex Global Retirement Trust', parent: 'Apex Global Retirement Trust' })
    expect(isOwnUltimateParent(r)).toBe(true)
  })

  it('holds for a row with no parent named at all', () => {
    expect(isOwnUltimateParent(record({ investorName: 'Apollo Global Management', parent: '' }))).toBe(true)
  })

  it('does not hold for a feeder under a real sponsor', () => {
    const r = record({ investorName: 'Apollo GRE IV, LP', parent: 'Apollo Global Management', parentId: 1, isUltimateParent: false })
    expect(isOwnUltimateParent(r)).toBe(false)
  })

  // The trap: the API derives `isUltimateParent` from `parentId`, so this row carries `true` even
  // though it names a sponsor. Reading that flag instead of the parent name would label it "Self"
  // and hide the ⚠ case the column exists to surface.
  it('does not hold for an unlinked sponsor, despite the API flagging the row ultimate', () => {
    const r = record({ investorName: 'Apollo GRE IV, LP', parent: 'Sponsor Not Yet Onboarded', parentId: null, isUltimateParent: true })
    expect(r.isUltimateParent).toBe(true)
    expect(isOwnUltimateParent(r)).toBe(false)
    expect(hasUnlinkedSponsor(r)).toBe(true)
  })
})

describe('LP size measure', () => {
  it('reports AUM when the record carries one', () => {
    const r = record({ aum: '$650.0B' })
    expect(sizeMeasureOf(r)).toBe('AUM')
    expect(lpSizeOf(r)).toBe('$650.0B')
  })

  it('falls through to NAV, then pension assets', () => {
    expect(sizeMeasureOf(record({ nav: '$1.2B' }))).toBe('NAV')
    expect(sizeMeasureOf(record({ pensionAssets: '$40.0B' }))).toBe('Assets')
  })

  it('reports no measure for a record with no size at all', () => {
    expect(sizeMeasureOf(record())).toBe('')
    expect(lpSizeOf(record())).toBe('')
  })

  it('ignores a whitespace-only value rather than treating it as a size', () => {
    expect(sizeMeasureOf(record({ aum: '   ', nav: '$1.2B' }))).toBe('NAV')
  })
})
