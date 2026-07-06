import { describe, expect, it } from 'vitest'
import { rankLPsByUncalledCapital } from '../screens/LPMaster'
import type { LPRecord } from '../services/lpService'

const row = (name: string, uc: string): LPRecord => ({
  name,
  parent: '',
  spv: false,
  hq: true,
  type: 'Institutional',
  region: '',
  ig: false,
  cls: 'Eligible',
  clsTag: '',
  sp: '',
  mdy: '',
  fitch: '',
  aum: '',
  nav: '',
  pension: '',
  pensionFunded: '',
  capCommit: '',
  pctCapCommit: '',
  calledCap: '',
  inc: true,
  uc,
  pctUncalled: '',
  pctCalled: '',
  agentConc: '',
  ubsConc: '',
  rate: '',
  agentRate: '',
  abb: '',
  ubb: '',
  delta: '',
  uec: '',
  rcl: false,
  tf: false,
  notes: '',
})

describe('rankLPsByUncalledCapital', () => {
  it('ranks by uncalled capital, not row or page position', () => {
    const ranks = rankLPsByUncalledCapital([
      row("Arkansas Teachers' Retirement System", '11000000'),
      row('Larger LPRecord', '50000000'),
      row('Largest LPRecord', '90000000'),
    ])

    expect(ranks["Arkansas Teachers' Retirement System"]).toBe(3)
    expect(ranks['Largest LPRecord']).toBe(1)
  })

  it('assigns the same rank to equal uncalled capital values', () => {
    const ranks = rankLPsByUncalledCapital([
      row('Largest LPRecord', '$50M'),
      row('Beta LPRecord', '$25M'),
      row('Alpha LPRecord', '$25M'),
      row('Small LPRecord', '$10M'),
    ])

    expect(ranks['Largest LPRecord']).toBe(1)
    expect(ranks['Alpha LPRecord']).toBe(2)
    expect(ranks['Beta LPRecord']).toBe(2)
    expect(ranks['Small LPRecord']).toBe(4)
  })
})
