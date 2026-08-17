import { describe, it, expect } from 'vitest'
import { buildShadowRows } from '../screens/ShadowBB'
import type { ComputedLP } from '../types/bb'
import type { LPRecord } from '../services/lpService'

// The ShadowBB grid joins the snapshot's per-LP engine results (authoritative computed figures)
// with the live LP records (current input fields). These fixtures mirror the API contract:
// snapshot rows carry the engine outputs; live rows carry the editable inputs + rank. Keys match
// ComputedLpRecord / LpRecordDto, and advance rates travel as fractions (0.9 = 90%).

const snapRow = (over: Partial<ComputedLP>): ComputedLP => ({
  id: 51, investorName: 'Alpha Pension', ubsLpCategory: 'Rated Investor', included: true,
  uncalledCapital: '$10.0M', uncalledEligibleCapital: '$10.0M',
  uecM: 10, ubbM: 9, abbM: 8.5, deltaM: 0.5,
  concExcessM: 0, ucM: 10, agentExcessM: 2, pctAgentBB: 0.5, pctUbsBB: 0.5,
  ubsAdvanceRate: 0.9, agentAdvanceRate: 0.85, highQuality: true,
  ...over,
} as ComputedLP)

const liveRow = (over: Partial<LPRecord>): LPRecord => ({
  id: 51, investorName: 'Alpha Pension', ubsLpCategory: 'Rated Investor', included: true,
  uncalledCapital: '$10.0M', lpRank: 3, notes: 'reviewed',
  agentConcentrationLimit: '7.5%', ubsConcentrationLimit: '5%',
  capitalCommitment: '$20.0M', ubsAdvanceRate: null, agentAdvanceRate: 0.85,
  ...over,
} as LPRecord)

describe('buildShadowRows — snapshot ⋈ live join', () => {
  it('takes computed figures from the snapshot and input fields from the live record', () => {
    const rows = buildShadowRows(
      [snapRow({ abbM: 8.5, ubbM: 9, pctAgentBB: 0.5, agentExcessM: 2 })],
      [liveRow({ notes: 'reviewed', lpRank: 3, capitalCommitment: '$20.0M' })],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].abbM).toBeCloseTo(8.5)
    expect(rows[0].ubbM).toBeCloseTo(9)
    expect(rows[0].pctAgentBB).toBeCloseTo(0.5)
    expect(rows[0].agentExcessM).toBeCloseTo(2)
    expect(rows[0].notes).toBe('reviewed')
    expect(rows[0].lpRank).toBe(3)
    expect(rows[0].capitalCommitment).toBe('$20.0M')
    expect(rows[0]._key).toBe('LPRecord-51')
  })

  it('never lets a re-edited live string override a snapshot computed figure', () => {
    // The live record's stored BB strings may have drifted since the run (saveClassification
    // edits); the frozen snapshot numbers must win for computed columns.
    const rows = buildShadowRows(
      [snapRow({ ubbM: 9, concExcessM: 1.5 })],
      [liveRow({ ubsBorrowingBase: '$999.0M', ubsExcessConcentration: '$777.0M' })],
    )
    expect(rows[0].ubbM).toBeCloseTo(9)
    expect(rows[0].concExcessM).toBeCloseTo(1.5)
  })

  it('falls back to the snapshot-resolved UBS rate when the live record has none', () => {
    // The API sends null for an unset per-LP rate now that the column is NUMERIC.
    const blank = buildShadowRows([snapRow({ ubsAdvanceRate: 0.9 })], [liveRow({ ubsAdvanceRate: null })])
    expect(blank[0].ubsAdvanceRate).toBe(0.9)
    const saved = buildShadowRows([snapRow({ ubsAdvanceRate: 0.9 })], [liveRow({ ubsAdvanceRate: 0.75 })])
    expect(saved[0].ubsAdvanceRate).toBe(0.75)
  })

  it('keeps an explicit zero live rate rather than falling back to the snapshot', () => {
    const rows = buildShadowRows([snapRow({ ubsAdvanceRate: 0.9 })], [liveRow({ ubsAdvanceRate: 0 })])
    expect(rows[0].ubsAdvanceRate).toBe(0)
  })

  it('propagates a newly saved reclassified flag over an older snapshot value', () => {
    const rows = buildShadowRows(
      [snapRow({ reclassified: false })],
      [liveRow({ reclassified: true })],
    )

    expect(rows[0].reclassified).toBe(true)
  })

  it('uses the cleared live flag after approval instead of the historical snapshot flag', () => {
    const rows = buildShadowRows(
      [snapRow({ reclassified: true })],
      [liveRow({ reclassified: false })],
    )

    expect(rows[0].reclassified).toBe(false)
  })

  it('joins by id first, then by investor name for legacy snapshots without ids', () => {
    const byName = buildShadowRows(
      [snapRow({ id: undefined as unknown as number, investorName: 'Alpha Pension' })],
      [liveRow({ id: 51, investorName: 'Alpha Pension', notes: 'joined-by-name' })],
    )
    expect(byName[0].notes).toBe('joined-by-name')
    expect(byName[0]._key).toBe('LPRecord-51')
  })

  it('tolerates pre-extension snapshot rows that lack the new per-row fields', () => {
    const { ucM: _ucM, agentExcessM: _ax, pctAgentBB: _pa, pctUbsBB: _pu, ...legacy } = snapRow({})
    const rows = buildShadowRows([legacy as ComputedLP], [liveRow({})])
    expect(rows[0].agentExcessM).toBeUndefined()
    expect(rows[0].pctAgentBB).toBeUndefined()
    // Established figures still flow through.
    expect(rows[0].ubbM).toBeCloseTo(9)
  })

  it('keeps a snapshot row renderable when the live record was deleted after the run', () => {
    const rows = buildShadowRows([snapRow({})], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].investorName).toBe('Alpha Pension')
    expect(rows[0].abbM).toBeCloseTo(8.5)
  })
})
