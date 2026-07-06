import { describe, it, expect } from 'vitest'
import { toBreachDisplayRows } from '../screens/ShadowBB'
import type { BBBreach } from '../types/bb'

// The Shadow BB Results screen shows the snapshot's persisted concentration breaches
// (the engine's verdict against the Concentration Limits config) in a table above the
// LP table: rule label, message detail, and the actual vs configured limit as percents.

const breaches: BBBreach[] = [
  { type: 'single-lp', severity: 'breach',  message: 'CalPERS exceeds 40% single-lp concentration', value: 0.5,    limit: 0.4 },
  { type: 'top10',     severity: 'warning', message: 'Top-10 LPs between 80–90% of UBS BB',          value: 0.8333, limit: 0.9 },
  { type: 'non-us',    severity: 'breach',  message: 'Non-US LP aggregate exceeds 30% of UBS BB',    value: 0.454,  limit: 0.3 },
]

describe('toBreachDisplayRows', () => {
  it('maps server breaches to labelled display rows with formatted percents', () => {
    const rows = toBreachDisplayRows(breaches)
    expect(rows).toEqual([
      { severity: 'breach',  rule: 'single-lp limit',      detail: 'CalPERS exceeds 40% single-lp concentration', current: '50.0%', limit: '40.0%' },
      { severity: 'warning', rule: 'Top-10 concentration', detail: 'Top-10 LPs between 80–90% of UBS BB',          current: '83.3%', limit: '90.0%' },
      { severity: 'breach',  rule: 'Non-US aggregate',     detail: 'Non-US LP aggregate exceeds 30% of UBS BB',    current: '45.4%', limit: '30.0%' },
    ])
  })

  it('returns no rows for a clean snapshot', () => {
    expect(toBreachDisplayRows([])).toEqual([])
  })
})
