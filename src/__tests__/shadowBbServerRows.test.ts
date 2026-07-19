import { describe, it, expect } from 'vitest'
import { buildShadowRows } from '../screens/ShadowBB'
import type { ComputedLP } from '../types/bb'
import type { LPRecord } from '../services/lpService'

// The ShadowBB grid joins the snapshot's per-LP engine results (authoritative computed figures)
// with the live LP records (current input fields). These fixtures mirror the API contract:
// snapshot rows carry the engine outputs; live rows carry the editable inputs + rank.

const snapRow = (over: Partial<ComputedLP>): ComputedLP => ({
  id: 51, name: 'Alpha Pension', cls: 'Rated Investor', inc: true,
  uc: '$10.0M', uec: '$10.0M', uecM: 10, ubbM: 9, abbM: 8.5, deltaM: 0.5,
  concExcessM: 0, ucM: 10, agentExcessM: 2, pctAgentBB: 0.5, pctUbsBB: 0.5,
  rate: '90%', agentRate: '85%', highQuality: true,
  ...over,
} as ComputedLP)

const liveRow = (over: Partial<LPRecord>): LPRecord => ({
  id: 51, name: 'Alpha Pension', cls: 'Rated Investor', inc: true,
  uc: '$10.0M', rank: 3, notes: 'reviewed', agentConc: '7.5%', ubsConc: '5%',
  capCommit: '$20.0M', rate: '', agentRate: '85%',
  ...over,
} as LPRecord)

describe('buildShadowRows — snapshot ⋈ live join', () => {
  it('takes computed figures from the snapshot and input fields from the live record', () => {
    const rows = buildShadowRows(
      [snapRow({ abbM: 8.5, ubbM: 9, pctAgentBB: 0.5, agentExcessM: 2 })],
      [liveRow({ notes: 'reviewed', rank: 3, capCommit: '$20.0M' })],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].abbM).toBeCloseTo(8.5)
    expect(rows[0].ubbM).toBeCloseTo(9)
    expect(rows[0].pctAgentBB).toBeCloseTo(0.5)
    expect(rows[0].agentExcessM).toBeCloseTo(2)
    expect(rows[0].notes).toBe('reviewed')
    expect(rows[0].rank).toBe(3)
    expect(rows[0].capCommit).toBe('$20.0M')
    expect(rows[0]._key).toBe('LPRecord-51')
  })

  it('never lets a re-edited live string override a snapshot computed figure', () => {
    // The live record's stored ubb/abb strings may have drifted since the run (saveClassification
    // edits); the frozen snapshot numbers must win for computed columns.
    const rows = buildShadowRows(
      [snapRow({ ubbM: 9, concExcessM: 1.5 })],
      [liveRow({ ubb: '$999.0M', ubsExcessConc: '$777.0M' } as Partial<LPRecord>)],
    )
    expect(rows[0].ubbM).toBeCloseTo(9)
    expect(rows[0].concExcessM).toBeCloseTo(1.5)
  })

  it('falls back to the snapshot-resolved UBS rate when the live record has none', () => {
    // API may send '' or null for an unset per-LP rate (empty-string contract).
    const blank = buildShadowRows([snapRow({ rate: '90%' })], [liveRow({ rate: '' })])
    expect(blank[0].rate).toBe('90%')
    const saved = buildShadowRows([snapRow({ rate: '90%' })], [liveRow({ rate: '75%' })])
    expect(saved[0].rate).toBe('75%')
  })

  it('joins by id first, then by investor name for legacy snapshots without ids', () => {
    const byName = buildShadowRows(
      [snapRow({ id: undefined as unknown as number, name: 'Alpha Pension' })],
      [liveRow({ id: 51, name: 'Alpha Pension', notes: 'joined-by-name' })],
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
    expect(rows[0].name).toBe('Alpha Pension')
    expect(rows[0].abbM).toBeCloseTo(8.5)
  })
})
