import { describe, it, expect } from 'vitest'
import { buildExecRows, buildExecRowsFromSummary, parseM, parsePct } from '../utils/execSummary'
import type { FacilityRow } from '../services/facilityService'
import type { BBSummary } from '../types/bb'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Blue Owl GP Stakes V prototype fixture: ubsBB $138.6M, agentBB $142.3M, ear 87.4%
const ACTIVE: Partial<FacilityRow> = {
  name:     'Blue Owl GP Stakes V',
  ubsBB:    '$138.6M',
  agentBB:  '$142.3M',
  ear:      '87.4%',
  status:   'Active',
  lastRun:  'Jun 5',
}

// Live-mode placeholder: API populates these as '—' before BB extraction runs
const PLACEHOLDER: Partial<FacilityRow> = {
  name:    'Live Facility A',
  ubsBB:   '—',
  agentBB: '—',
  ear:     '—',
  status:  'Active',
  lastRun: '—',
}

function row(f: Partial<FacilityRow>, metric: string) {
  return buildExecRows(f as FacilityRow).find(r => r.metric === metric)!
}

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

// ── parsePct ──────────────────────────────────────────────────────────────────

describe('parsePct', () => {
  it('parses percentage strings to fractions', () => {
    expect(parsePct('87.4%')).toBeCloseTo(0.874)
    expect(parsePct('100%')).toBeCloseTo(1.0)
    expect(parsePct('0.0%')).toBe(0)
  })
  it('returns 0 for placeholder dash', () => expect(parsePct('—')).toBe(0))
  it('returns 0 for null', () => expect(parsePct(null)).toBe(0))
  it('returns 0 for undefined', () => expect(parsePct(undefined)).toBe(0))
})

// ── buildExecRows — structural ────────────────────────────────────────────────

describe('buildExecRows', () => {
  it('returns [] for null', () => {
    expect(buildExecRows(null)).toEqual([])
  })

  it('always returns exactly 5 rows', () => {
    expect(buildExecRows(ACTIVE as FacilityRow)).toHaveLength(5)
    expect(buildExecRows(PLACEHOLDER as FacilityRow)).toHaveLength(5)
  })

  it('row metrics are in the expected order', () => {
    const metrics = buildExecRows(ACTIVE as FacilityRow).map(r => r.metric)
    expect(metrics).toEqual([
      'Total Eligible Uncalled',
      'Total Borrowing Base',
      'BB Delta',
      'Effective Advance Rate',
      'EAR Delta',
    ])
  })

  it('BB Delta and EAR Delta rows have delta: true', () => {
    const rows = buildExecRows(ACTIVE as FacilityRow)
    expect(rows.find(r => r.metric === 'BB Delta')!.delta).toBe(true)
    expect(rows.find(r => r.metric === 'EAR Delta')!.delta).toBe(true)
  })

  it('Total Borrowing Base row has bold: true', () => {
    expect(row(ACTIVE, 'Total Borrowing Base').bold).toBe(true)
  })
})

// ── buildExecRows — with real prototype data ───────────────────────────────────

describe('buildExecRows — active facility with real data', () => {
  it('BB Delta is -$3.7M (UBS $138.6M minus Agent $142.3M)', () => {
    expect(row(ACTIVE, 'BB Delta').ubs).toBe('-$3.7M')
  })

  it('EAR Delta contains no NaN', () => {
    const val = row(ACTIVE, 'EAR Delta').ubs
    expect(val).not.toContain('NaN')
    expect(val).toMatch(/^[+-]\d+\.\d+%$/)
  })

  it('EAR Delta is negative (UBS EAR lower than Agent EAR)', () => {
    // ubbM=138.6, abbM=142.3, earF=0.874
    // uecM = 138.6 / 0.874 ≈ 158.6; agentEarF = 142.3 / 158.6 ≈ 0.897
    // earDelta = 0.874 - 0.897 = -0.023 → -2.3%
    expect(row(ACTIVE, 'EAR Delta').ubs).toBe('-2.3%')
  })

  it('Total Eligible Uncalled UBS and Agent values match (shared denominator)', () => {
    const tuc = row(ACTIVE, 'Total Eligible Uncalled')
    expect(tuc.ubs).toBe(tuc.agent)
    expect(tuc.ubs).toMatch(/^\$[\d.]+M$/)
  })

  it('Effective Advance Rate UBS value passes through from facility', () => {
    expect(row(ACTIVE, 'Effective Advance Rate').ubs).toBe('87.4%')
  })
})

// ── buildExecRows — placeholder data (live mode before extraction) ─────────────

describe('buildExecRows — placeholder data (live mode)', () => {
  it('BB Delta shows — not NaN', () => {
    const val = row(PLACEHOLDER, 'BB Delta').ubs
    expect(val).toBe('—')
    expect(val).not.toContain('NaN')
  })

  it('EAR Delta shows — not NaN', () => {
    const val = row(PLACEHOLDER, 'EAR Delta').ubs
    expect(val).toBe('—')
    expect(val).not.toContain('NaN')
  })

  it('Total Eligible Uncalled shows — when data unavailable', () => {
    const tuc = row(PLACEHOLDER, 'Total Eligible Uncalled')
    expect(tuc.ubs).toBe('—')
    expect(tuc.agent).toBe('—')
  })

  it('Total Borrowing Base passes through facility values unchanged', () => {
    const tbb = row(PLACEHOLDER, 'Total Borrowing Base')
    expect(tbb.ubs).toBe('—')
    expect(tbb.agent).toBe('—')
  })
})

// ── buildExecRows — sign formatting ──────────────────────────────────────────

describe('buildExecRows — BB Delta sign formatting', () => {
  it('prefixes + when UBS BB > Agent BB', () => {
    const f = { ...ACTIVE, ubsBB: '$150.0M', agentBB: '$140.0M' } as FacilityRow
    expect(row(f, 'BB Delta').ubs).toMatch(/^\+\$/)
  })

  it('prefixes - when UBS BB < Agent BB', () => {
    expect(row(ACTIVE as FacilityRow, 'BB Delta').ubs).toMatch(/^-\$/)
  })

  it('shows +$0.0M when UBS BB equals Agent BB', () => {
    const f = { ...ACTIVE, ubsBB: '$100.0M', agentBB: '$100.0M' } as FacilityRow
    expect(row(f, 'BB Delta').ubs).toBe('+$0.0M')
  })
})

// ── buildExecRows — edge cases ────────────────────────────────────────────────

describe('buildExecRows — edge cases', () => {
  it('handles 0% EAR without division error', () => {
    const f = { ...ACTIVE, ear: '0.0%' } as FacilityRow
    // earF=0 → uecM=0 → hasData=false (ubsBB and agentBB are set but ear is 0%)
    // Actually 0.0% is parseable (not placeholder), but uecM=0 so agentEarF=0
    expect(() => buildExecRows(f)).not.toThrow()
    expect(buildExecRows(f)).toHaveLength(5)
  })

  it('handles undefined BB fields without throwing', () => {
    const f = { ...ACTIVE, ubsBB: undefined as unknown as string } as FacilityRow
    expect(() => buildExecRows(f)).not.toThrow()
  })

  it('handles null facility', () => {
    expect(buildExecRows(null)).toEqual([])
  })
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

  it('returns the same 5 metrics in order', () => {
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
