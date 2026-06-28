import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTemplateService, resolveColumn, _resetForTesting } from '../services/templateService'

const MOCK_ALIAS_GROUPS = [
  { group: 'Identity & Core Hierarchy', fields: [
    { id: 1, canonical: 'Investor Name', lpMasterField: 'Identity & Core Hierarchy - Investor Name', disambiguation: null,
      aliases: [
        { id: 1, text: 'Investor Name',               tier: 'Core', bank: null },
        { id: 2, text: 'Investor Name (Agent Records)', tier: 'Core', bank: null },
        { id: 3, text: 'Investor',                     tier: 'Core', bank: null },
        { id: 4, text: 'LP Name',                      tier: 'Core', bank: null },
      ] },
    { id: 4, canonical: 'Parent / Sponsor', lpMasterField: 'Identity & Core Hierarchy - Parent / Sponsor', disambiguation: null,
      aliases: [
        { id: 20, text: 'Parent / Sponsor',           tier: 'Core', bank: null },
        { id: 21, text: 'Parent',                     tier: 'Core', bank: null },
        { id: 27, text: 'Parent / Sponsor / Manager', tier: 'Core', bank: null },
      ] },
  ]},
  { group: 'Commitment Data', fields: [
    { id: 6, canonical: 'Capital Commitments', lpMasterField: 'Commitment Data - Capital Commitments', disambiguation: null,
      aliases: [
        { id: 31, text: 'Capital Commitments',            tier: 'Core', bank: null },
        { id: 33, text: 'Original Commitment',            tier: 'Core', bank: null },
        { id: 35, text: 'Total Commitment',               tier: 'Core', bank: null },
        { id: 36, text: 'Commitment (USD)',                tier: 'Core', bank: null },
      ] },
    { id: 7, canonical: '% of Capital Commitments', lpMasterField: 'Commitment Data - % of Capital Commitments', disambiguation: null,
      aliases: [
        { id: 37, text: '% of Capital Commitments', tier: 'Core', bank: null },
        { id: 38, text: '% Commitment',             tier: 'Core', bank: null },
      ] },
  ]},
  { group: 'Uncalled Data', fields: [
    { id: 10, canonical: 'Uncalled Capital', lpMasterField: 'Uncalled Data - Uncalled Capital', disambiguation: null,
      aliases: [
        { id: 49, text: 'Uncalled Capital',            tier: 'Core', bank: null },
        { id: 50, text: 'Unfunded Capital Commitment', tier: 'Core', bank: null },
        { id: 52, text: 'Unfunded Commitment',         tier: 'Core', bank: null },
      ] },
    { id: 12, canonical: '% of LP Called', lpMasterField: 'Uncalled Data - % of LP Called', disambiguation: null,
      aliases: [
        { id: 63, text: '% Called',  tier: 'Core', bank: null },
      ] },
  ]},
  { group: 'Credit Ratings', fields: [
    { id: 24, canonical: 'S&P Rating', lpMasterField: 'Credit Ratings - S&P Rating', disambiguation: null,
      aliases: [
        { id: 112, text: "S&P",         tier: 'Core', bank: null },
        { id: 113, text: "S&P Rating",  tier: 'Core', bank: null },
      ] },
    { id: 25, canonical: "Moody's Rating", lpMasterField: "Credit Ratings - Moody's Rating", disambiguation: null,
      aliases: [
        { id: 118, text: "Moody's",        tier: 'Core', bank: null },
        { id: 119, text: "Moody's Rating", tier: 'Core', bank: null },
      ] },
  ]},
  { group: 'Borrowing Base', fields: [
    { id: 17, canonical: 'Advance Rate', lpMasterField: 'Borrowing Base - Advance Rate', disambiguation: null,
      aliases: [
        { id: 84, text: 'Advance Rate', tier: 'Core', bank: null },
      ] },
    { id: 22, canonical: 'Concentration Limit', lpMasterField: 'Borrowing Base - Concentration Limit', disambiguation: null,
      aliases: [
        { id: 104, text: 'Concentration Limit', tier: 'Core', bank: null },
      ] },
  ]},
]

beforeEach(async () => {
  _resetForTesting()
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const body = url.includes('field-mapping') ? MOCK_ALIAS_GROUPS : []
    return Promise.resolve({ json: () => Promise.resolve(body) })
  }))
  await initTemplateService()
})

describe('resolveColumn — exact matches', () => {
  it('resolves an exact canonical alias', () => {
    const m = resolveColumn('Investor Name')
    expect(m?.canonical).toBe('Investor Name')
    expect(m?.confidence).toBe(1)
  })

  it('resolves an exact bank-variant alias', () => {
    const m = resolveColumn('Investor Name (Agent Records)')
    expect(m?.canonical).toBe('Investor Name')
    expect(m?.confidence).toBe(1)
  })

  it('resolves Commitment (USD) to Capital Commitments, not a percent field', () => {
    const m = resolveColumn('Commitment (USD)')
    expect(m?.canonical).toBe('Capital Commitments')
    expect(m?.group).toBe('Commitment Data')
  })

  it('resolves % Commitment to % of Capital Commitments', () => {
    const m = resolveColumn('% Commitment')
    expect(m?.canonical).toBe('% of Capital Commitments')
  })

  it('resolves Unfunded Commitment to Uncalled Capital', () => {
    const m = resolveColumn('Unfunded Commitment')
    expect(m?.canonical).toBe('Uncalled Capital')
  })
})

describe('resolveColumn — percent-field guard', () => {
  it('does NOT resolve a non-percent header to a percent canonical', () => {
    // "Total Commitment" must not match "% of Capital Commitments"
    const m = resolveColumn('Total Commitment')
    expect(m?.canonical).not.toBe('% of Capital Commitments')
  })

  it('resolves % Called to a percent canonical', () => {
    const m = resolveColumn('% Called')
    expect(m?.canonical).toBe('% of LP Called')
  })
})

describe('resolveColumn — fuzzy matching', () => {
  it('matches near aliases above the Jaro-Winkler 0.900 threshold', () => {
    const m = resolveColumn('Capital Commit')
    expect(m?.canonical).toBe('Capital Commitments')
    expect(m?.confidence).toBeGreaterThanOrEqual(0.9)
    expect(m?.confidence).toBeLessThan(1)
  })

  it('returns null for headers with no close match', () => {
    expect(resolveColumn('XYZ Unknown Column 123')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(resolveColumn('')).toBeNull()
  })
})

describe('resolveColumn — contains match', () => {
  it('matches a multi-word alias contained within a longer header', () => {
    const m = resolveColumn('Parent / Sponsor / Manager')
    expect(m?.canonical).toBe('Parent / Sponsor')
    expect(m?.confidence).toBe(1)
  })
})
