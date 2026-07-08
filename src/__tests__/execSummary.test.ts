import { describe, it, expect } from 'vitest'
import { buildExecRowsFromSummary, parseM } from '../utils/execSummary'
import type { BBSummary } from '../types/bb'

// ── parseM ────────────────────────────────────────────────────────────────────

describe('parseM', () => {
  it('parses standard dollar-million strings', () => {
    expect(parseM('$138.6M')).toBeCloseTo(138.6)
    expect(parseM('$0')).toBe(0)
  })
  it('returns 0 for placeholder dash', () => expect(parseM('—')).toBe(0))
  it('returns 0 for null', () => expect(parseM(null)).toBe(0))
  it('returns 0 for undefined', () => expect(parseM(undefined)).toBe(0))
  it('returns 0 for empty string', () => expect(parseM('')).toBe(0))
})

// ── buildExecRowsFromSummary — from persisted Shadow BB snapshot ───────────────

// Blue Owl GP Stakes V snapshot summary (values in $millions, rates as fractions).
const SUMMARY: BBSummary = {
  totalUBB: 22822.1,
  totalABB: 23544.9,
  bbDelta:  -722.8,
  ear:      0.829,
  agentEar: 0.855,
  earDelta: -0.026,
  includedCount: 880,
  excludedCount: 20,
}

describe('buildExecRowsFromSummary', () => {
  it('returns [] when no snapshot exists yet', () => {
    expect(buildExecRowsFromSummary(null)).toEqual([])
    expect(buildExecRowsFromSummary(undefined)).toEqual([])
  })

  it('returns the 5 metrics in order', () => {
    expect(buildExecRowsFromSummary(SUMMARY).map(r => r.metric)).toEqual([
      'Total Eligible Uncalled',
      'Total Borrowing Base',
      'BB Delta',
      'Effective Advance Rate',
      'EAR Delta',
    ])
  })

  it('renders the persisted UBS and Agent borrowing base', () => {
    const tbb = buildExecRowsFromSummary(SUMMARY).find(r => r.metric === 'Total Borrowing Base')!
    expect(tbb.ubs).toBe('$22822.1M')
    expect(tbb.agent).toBe('$23544.9M')
    expect(tbb.bold).toBe(true)
  })

  it('renders BB Delta and EAR Delta from the snapshot (signed)', () => {
    const rows = buildExecRowsFromSummary(SUMMARY)
    expect(rows.find(r => r.metric === 'BB Delta')!.ubs).toBe('-$722.8M')
    expect(rows.find(r => r.metric === 'EAR Delta')!.ubs).toBe('-2.6%')
  })

  it('renders UBS and Agent effective advance rates', () => {
    const ear = buildExecRowsFromSummary(SUMMARY).find(r => r.metric === 'Effective Advance Rate')!
    expect(ear.ubs).toBe('82.9%')
    expect(ear.agent).toBe('85.5%')
  })

  it('derives Total Eligible Uncalled = UBS BB / EAR', () => {
    const tuc = buildExecRowsFromSummary(SUMMARY).find(r => r.metric === 'Total Eligible Uncalled')!
    // 22822.1 / 0.829 ≈ 27529.7
    expect(tuc.ubs).toBe(tuc.agent)
    expect(tuc.ubs).toMatch(/^\$[\d.]+M$/)
  })

  it('does not divide by zero when EAR is 0', () => {
    const z = buildExecRowsFromSummary({ ...SUMMARY, ear: 0 })
    expect(z.find(r => r.metric === 'Total Eligible Uncalled')!.ubs).toBe('$0.0M')
  })
})
