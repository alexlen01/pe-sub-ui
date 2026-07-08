import { describe, it, expect } from 'vitest'
import { ubsClassFromAgentRate, type ClassificationConfig } from '../services/configService'

const cfg = {
  AGENT_RATE_UBS_TIERS: [
    { min: 90, cls: 'Rated' },
    { min: 75, cls: 'Unrated AUM >$2bn' },
    { min: 65, cls: 'Unrated AUM $1-2bn' },
    { min: 50, cls: 'Eligible <$1bn' },
    { min: 0, cls: 'Excluded' },
  ],
} as unknown as ClassificationConfig

describe('ubsClassFromAgentRate', () => {
  it.each([
    [95, 'Rated'],
    [75, 'Unrated AUM >$2bn'],
    [65, 'Unrated AUM $1-2bn'],
    [50, 'Eligible <$1bn'],
    [0, 'Excluded'],
  ])('maps %i%% from backend-configured tiers to %s', (agentPct, expectedCls) => {
    expect(ubsClassFromAgentRate(cfg, agentPct)).toBe(expectedCls)
  })

  it('keeps rows unclassified when no agent rate is present', () => {
    expect(ubsClassFromAgentRate(cfg, '')).toBe('')
    expect(ubsClassFromAgentRate(cfg, undefined)).toBe('')
  })
})
