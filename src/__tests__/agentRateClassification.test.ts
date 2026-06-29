import { describe, it, expect } from 'vitest'
import { ubsClassFromAgentRate, type ClassificationConfig } from '../services/configService'

const cfg = {
  UBS_CLS_DEFAULT_RATE: {
    'Rated Investor': '90%',
    'FoF & Other > $10Bn AUM': '75%',
    'Corp Pension > $5Bn Assets': '65%',
    'Other Institutional': '50%',
    Excluded: '0%',
  },
  AGENT_RATE_UBS_TIERS: [
    { min: 90, cls: 'Rated Investor' },
    { min: 75, cls: 'FoF & Other > $10Bn AUM' },
    { min: 65, cls: 'Corp Pension > $5Bn Assets' },
    { min: 50, cls: 'Other Institutional' },
  ],
  AGENT_CLS_UBS_MAP: {},
} as unknown as ClassificationConfig

// PE_SUB_SOLUTION rule: the Agent Advance Rate reflects each LP's credit quality and seeds a
// default UBS LP Category; the UBS Advance Rate then follows that category. Both stay editable.

describe('ubsClassFromAgentRate — canonical agent tiers', () => {
  const cases: Array<[number, string, string]> = [
    [95, 'Rated Investor',             '90%'],
    [75, 'FoF & Other > $10Bn AUM',    '75%'],
    [65, 'Corp Pension > $5Bn Assets', '65%'],
    [50, 'Other Institutional',        '50%'],
    [0,  'Excluded',                   '0%'],
  ]

  it.each(cases)('agent %i%% → %s (UBS rate %s)', (agentPct, expectedCls, expectedRate) => {
    const cls = ubsClassFromAgentRate(cfg, agentPct)
    expect(cls).toBe(expectedCls)
    // The UBS Advance Rate that the screen seeds from the derived class.
    expect(cfg.UBS_CLS_DEFAULT_RATE[cls]).toBe(expectedRate)
  })
})

describe('ubsClassFromAgentRate — edge cases', () => {
  it('returns "" for a blank/missing agent rate so the row stays unclassified', () => {
    expect(ubsClassFromAgentRate(cfg, '')).toBe('')
    expect(ubsClassFromAgentRate(cfg, undefined)).toBe('')
  })

  it('matches non-canonical rates to the nearest lower tier (never over-rating)', () => {
    expect(ubsClassFromAgentRate(cfg, 90)).toBe('Rated Investor')             // top tier floor
    expect(ubsClassFromAgentRate(cfg, 70)).toBe('Corp Pension > $5Bn Assets') // 70 < 75 -> 65 tier
    expect(ubsClassFromAgentRate(cfg, 55)).toBe('Other Institutional')        // 55 < 65 -> 50 tier
    expect(ubsClassFromAgentRate(cfg, 40)).toBe('Other Institutional')        // below lowest positive tier
  })

  it('treats a 0% agent rate as Excluded', () => {
    expect(ubsClassFromAgentRate(cfg, 0)).toBe('Excluded')
    expect(cfg.UBS_CLS_DEFAULT_RATE.Excluded).toBe('0%')
  })
})
