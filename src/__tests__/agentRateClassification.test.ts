import { describe, it, expect } from 'vitest'
import { ubsClassFromAgentRate, UBS_CLS_DEFAULT_RATE } from '../config/classificationConfig'

// PE_SUB_SOLUTION rule: the Agent Advance Rate reflects each LP's credit quality and seeds a
// default UBS LP Classification; the UBS Advance Rate then follows that class. Both stay editable.

describe('ubsClassFromAgentRate — canonical agent tiers', () => {
  const cases: Array<[number, string, string]> = [
    [95, 'Rated Investor',             '90%'],
    [75, 'FoF & Other > $10Bn AUM',    '75%'],
    [65, 'Corp Pension > $5Bn Assets', '65%'],
    [50, 'Other Institutional',        '50%'],
    [0,  'Excluded',                   '0%'],
  ]

  it.each(cases)('agent %i%% → %s (UBS rate %s)', (agentPct, expectedCls, expectedRate) => {
    const cls = ubsClassFromAgentRate(agentPct)
    expect(cls).toBe(expectedCls)
    // The UBS Advance Rate that the screen seeds from the derived class.
    expect(UBS_CLS_DEFAULT_RATE[cls]).toBe(expectedRate)
  })
})

describe('ubsClassFromAgentRate — edge cases', () => {
  it('returns "" for a blank/missing agent rate so the row stays unclassified', () => {
    expect(ubsClassFromAgentRate('')).toBe('')
    expect(ubsClassFromAgentRate(undefined)).toBe('')
  })

  it('matches non-canonical rates to the nearest lower tier (never over-rating)', () => {
    expect(ubsClassFromAgentRate(90)).toBe('Rated Investor')             // top tier floor
    expect(ubsClassFromAgentRate(70)).toBe('Corp Pension > $5Bn Assets') // 70 < 75 → 65 tier
    expect(ubsClassFromAgentRate(55)).toBe('Other Institutional')        // 55 < 65 → 50 tier
    expect(ubsClassFromAgentRate(40)).toBe('Other Institutional')        // below lowest positive tier
  })

  it('treats a 0% agent rate as Excluded', () => {
    expect(ubsClassFromAgentRate(0)).toBe('Excluded')
    expect(UBS_CLS_DEFAULT_RATE.Excluded).toBe('0%')
  })
})
