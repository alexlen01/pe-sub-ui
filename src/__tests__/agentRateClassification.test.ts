import { describe, it, expect } from 'vitest'
import {
  agentClassFromInvestorProfile,
  investorTypeFromAgentClass,
  ubsClassFromAgentRate,
  ubsClassFromInvestorProfile,
  type ClassificationConfig,
} from '../services/configService'

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

// PE_SUB_SOLUTION rule: the Agent Advance Rate reflects each LPRecord's credit quality and seeds a
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

describe('ubsClassFromInvestorProfile', () => {
  it('upgrades rated pensions and sovereign funds to Rated Investor', () => {
    expect(ubsClassFromInvestorProfile(cfg, {
      investorType: 'Public Pension',
      sp: 'A-',
      lpSizeBil: '$1.0B',
      lpSizeCriteria: 'AUM',
    })).toBe('Rated Investor')

    expect(ubsClassFromInvestorProfile(cfg, {
      investorType: 'Sovereign Wealth Fund',
      mdy: 'Aa3',
    })).toBe('Rated Investor')
  })

  it('routes unrated institutional entities by profile and size', () => {
    expect(ubsClassFromInvestorProfile(cfg, {
      investorType: 'Endowment',
      lpSizeBil: '$1.2B',
      lpSizeCriteria: 'NAV',
    })).toBe('Unrated NAV > $1Bn')

    expect(ubsClassFromInvestorProfile(cfg, {
      investorType: 'Pension Fund',
      lpSizeBil: '$6.0B',
      lpSizeCriteria: 'Pension Assets',
    })).toBe('Corp Pension > $5Bn Assets')

    expect(ubsClassFromInvestorProfile(cfg, {
      investorType: 'Insurance Company',
      lpSizeBil: '$900M',
      lpSizeCriteria: 'AUM',
    })).toBe('Other Institutional')
  })

  it('excludes family offices, HNW, SPVs, and hard exception flags', () => {
    expect(ubsClassFromInvestorProfile(cfg, { investorType: 'Family Office' })).toBe('Excluded')
    expect(ubsClassFromInvestorProfile(cfg, { investorType: 'HNW' })).toBe('Excluded')
    expect(ubsClassFromInvestorProfile(cfg, { investorType: 'Pension Fund', spv: true })).toBe('Excluded')
    expect(ubsClassFromInvestorProfile(cfg, {
      investorType: 'Sovereign Wealth Fund',
      sp: 'AA',
      notes: 'KYC incomplete',
    })).toBe('Excluded')
  })
})

describe('agentClassFromInvestorProfile', () => {
  it('derives agent classification from investor profile without copying Investor Type verbatim', () => {
    expect(agentClassFromInvestorProfile({ investorType: 'Public Pension' })).toBe('Non-Rated Included')
    expect(agentClassFromInvestorProfile({ investorType: 'Public Pension', sp: 'A-' })).toBe('Rated Included')
    expect(agentClassFromInvestorProfile({ investorType: 'Family Office' })).toBe('Ineligible Investors')
  })

  it('leaves unknown investor types blank instead of inventing an agent classification', () => {
    expect(agentClassFromInvestorProfile({ investorType: 'Trust' })).toBe('')
  })
})

describe('investorTypeFromAgentClass', () => {
  it('only reverse-infers investor type from structural labels', () => {
    expect(investorTypeFromAgentClass('Pension Fund')).toBe('Pension Fund')
    expect(investorTypeFromAgentClass('Rated Included')).toBe('')
    expect(investorTypeFromAgentClass('Designated Institutional')).toBe('')
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
