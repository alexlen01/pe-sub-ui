import { describe, it, expect } from 'vitest'
import { buildExecRows, parseM, parsePct } from '../utils/execSummary'
import type { FacilityRow } from '../services/facilityService'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Blue Owl GP Stakes V prototype fixture: ubsBB $138.6M, agentBB $142.3M, ear 87.4%
const CERTIFIED: Partial<FacilityRow> = {
  name:     'Blue Owl GP Stakes V',
  ubsBB:    '$138.6M',
  agentBB:  '$142.3M',
  ear:      '87.4%',
  status:   'Certified',
  lastRun:  'Jun 5',
}

// Live-mode placeholder: API populates these as '—' before BB extraction runs
const PLACEHOLDER: Partial<FacilityRow> = {
  name:    'Live Facility A',
  ubsBB:   '—',
  agentBB: '—',
  ear:     '—',
  status:  'Certified',
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
    expect(buildExecRows(CERTIFIED as FacilityRow)).toHaveLength(5)
    expect(buildExecRows(PLACEHOLDER as FacilityRow)).toHaveLength(5)
  })

  it('row metrics are in the expected order', () => {
    const metrics = buildExecRows(CERTIFIED as FacilityRow).map(r => r.metric)
    expect(metrics).toEqual([
      'Total Eligible Uncalled',
      'Total Borrowing Base',
      'BB Delta',
      'Effective Advance Rate',
      'EAR Delta',
    ])
  })

  it('BB Delta and EAR Delta rows have delta: true', () => {
    const rows = buildExecRows(CERTIFIED as FacilityRow)
    expect(rows.find(r => r.metric === 'BB Delta')!.delta).toBe(true)
    expect(rows.find(r => r.metric === 'EAR Delta')!.delta).toBe(true)
  })

  it('Total Borrowing Base row has bold: true', () => {
    expect(row(CERTIFIED, 'Total Borrowing Base').bold).toBe(true)
  })
})

// ── buildExecRows — with real prototype data ───────────────────────────────────

describe('buildExecRows — certified facility with real data', () => {
  it('BB Delta is -$3.7M (UBS $138.6M minus Agent $142.3M)', () => {
    expect(row(CERTIFIED, 'BB Delta').ubs).toBe('-$3.7M')
  })

  it('EAR Delta contains no NaN', () => {
    const val = row(CERTIFIED, 'EAR Delta').ubs
    expect(val).not.toContain('NaN')
    expect(val).toMatch(/^[+-]\d+\.\d+%$/)
  })

  it('EAR Delta is negative (UBS EAR lower than Agent EAR)', () => {
    // ubbM=138.6, abbM=142.3, earF=0.874
    // uecM = 138.6 / 0.874 ≈ 158.6; agentEarF = 142.3 / 158.6 ≈ 0.897
    // earDelta = 0.874 - 0.897 = -0.023 → -2.3%
    expect(row(CERTIFIED, 'EAR Delta').ubs).toBe('-2.3%')
  })

  it('Total Eligible Uncalled UBS and Agent values match (shared denominator)', () => {
    const tuc = row(CERTIFIED, 'Total Eligible Uncalled')
    expect(tuc.ubs).toBe(tuc.agent)
    expect(tuc.ubs).toMatch(/^\$[\d.]+M$/)
  })

  it('Effective Advance Rate UBS value passes through from facility', () => {
    expect(row(CERTIFIED, 'Effective Advance Rate').ubs).toBe('87.4%')
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
    const f = { ...CERTIFIED, ubsBB: '$150.0M', agentBB: '$140.0M' } as FacilityRow
    expect(row(f, 'BB Delta').ubs).toMatch(/^\+\$/)
  })

  it('prefixes - when UBS BB < Agent BB', () => {
    expect(row(CERTIFIED as FacilityRow, 'BB Delta').ubs).toMatch(/^-\$/)
  })

  it('shows +$0.0M when UBS BB equals Agent BB', () => {
    const f = { ...CERTIFIED, ubsBB: '$100.0M', agentBB: '$100.0M' } as FacilityRow
    expect(row(f, 'BB Delta').ubs).toBe('+$0.0M')
  })
})

// ── buildExecRows — edge cases ────────────────────────────────────────────────

describe('buildExecRows — edge cases', () => {
  it('handles 0% EAR without division error', () => {
    const f = { ...CERTIFIED, ear: '0.0%' } as FacilityRow
    // earF=0 → uecM=0 → hasData=false (ubsBB and agentBB are set but ear is 0%)
    // Actually 0.0% is parseable (not placeholder), but uecM=0 so agentEarF=0
    expect(() => buildExecRows(f)).not.toThrow()
    expect(buildExecRows(f)).toHaveLength(5)
  })

  it('handles undefined BB fields without throwing', () => {
    const f = { ...CERTIFIED, ubsBB: undefined as unknown as string } as FacilityRow
    expect(() => buildExecRows(f)).not.toThrow()
  })

  it('handles null facility', () => {
    expect(buildExecRows(null)).toEqual([])
  })
})
