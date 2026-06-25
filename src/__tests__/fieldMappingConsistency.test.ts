import { describe, it, expect } from 'vitest'
import { ALIAS_GROUPS, ALL_CANONICAL_FIELDS } from '../data/fieldMappingData'
import { resolveColumn } from '../services/templateService'

describe('ALIAS_GROUPS structural integrity', () => {
  it('all 31 canonical fields are defined', () => {
    const totalFields = ALIAS_GROUPS.reduce((sum, g) => sum + g.fields.length, 0)
    expect(totalFields).toBe(31)
  })

  it('every field has at least one alias', () => {
    for (const { group, fields } of ALIAS_GROUPS) {
      for (const f of fields) {
        expect(
          f.aliases.length,
          `${group} › ${f.canonical} has no aliases`
        ).toBeGreaterThan(0)
      }
    }
  })

  it('no duplicate canonical names', () => {
    const seen = new Set<string>()
    for (const { fields } of ALIAS_GROUPS) {
      for (const f of fields) {
        expect(seen.has(f.canonical), `Duplicate canonical: "${f.canonical}"`).toBe(false)
        seen.add(f.canonical)
      }
    }
  })

  it('no duplicate alias texts across all fields (case-insensitive)', () => {
    const seen = new Map<string, string>() // normalised text → "group › canonical"
    for (const { group, fields } of ALIAS_GROUPS) {
      for (const f of fields) {
        for (const alias of f.aliases) {
          const key = alias.text.toLowerCase()
          const owner = `${group} › ${f.canonical}`
          const existing = seen.get(key)
          expect(
            existing,
            `Duplicate alias "${alias.text}" appears on both "${existing}" and "${owner}"`
          ).toBeUndefined()
          seen.set(key, owner)
        }
      }
    }
  })

  it('lpMasterField matches pattern "<group> - <canonical>"', () => {
    for (const { group, fields } of ALIAS_GROUPS) {
      for (const f of fields) {
        expect(f.lpMasterField).toBe(`${group} - ${f.canonical}`)
      }
    }
  })
})

describe('Map To dropdown — derived fields are selectable', () => {
  // The ExtractionPreview "Map To" dropdown sources its options from the full canonical
  // field list. Derived fields (Borrowing Base, % of Borrowing Base, Eligible Commitment)
  // must be offered as manual mapping targets — they are not filtered out.
  it('exposes derived Borrowing Base fields as canonical options', () => {
    const values = ALL_CANONICAL_FIELDS.map(f => f.value)
    expect(values).toContain('Borrowing Base')
    expect(values).toContain('% of Borrowing Base')
    expect(values).toContain('Eligible Commitment')
  })

  it('Borrowing Base field carries the exact "Borrowing Base" alias so the bare header auto-matches', () => {
    const bb = ALIAS_GROUPS.flatMap(g => g.fields).find(f => f.canonical === 'Borrowing Base')
    expect(bb).toBeDefined()
    expect(bb!.aliases.map(a => a.text)).toContain('Borrowing Base')
  })

  it('Financial Scale starts with LP Size Grouping fields before AUM', () => {
    const financialScale = ALIAS_GROUPS.find(g => g.group === 'Financial Scale')
    expect(financialScale?.fields.slice(0, 3).map(f => f.canonical)).toEqual([
      'Size Metric Type',
      'Size Value / Tier',
      'AUM',
    ])
    expect(financialScale?.fields[0].aliases.map(a => a.text)).toEqual(
      expect.arrayContaining(['Size Metric Type', 'LP Size Metric', 'Financial Size Metric'])
    )
    expect(financialScale?.fields[1].aliases.map(a => a.text)).toEqual(
      expect.arrayContaining(['Size Value / Tier', 'Size Tier', 'Size Bucket'])
    )
  })

  it('Financial Scale includes Net Worth with common aliases', () => {
    const netWorth = ALIAS_GROUPS.find(g => g.group === 'Financial Scale')?.fields.find(f => f.canonical === 'Net Worth')
    expect(netWorth?.aliases.map(a => a.text)).toEqual(
      expect.arrayContaining(['Net Worth', 'Total Net Worth', 'Investor Net Worth', 'Net Worth (USD)'])
    )
  })

  it('does not expose the removed numeric rating helper fields', () => {
    const values = ALL_CANONICAL_FIELDS.map(f => f.value)
    expect(values).not.toContain('S&P Numeric Score')
    expect(values).not.toContain("Moody's Numeric Score")
    expect(values).not.toContain('Numeric Rating')
  })

  it('auto-suggests near aliases at the Jaro-Winkler 0.900 threshold', () => {
    const match = resolveColumn('Capital Commit')
    expect(match?.canonical).toBe('Capital Commitments')
    expect(match?.group).toBe('Commitment Data')
    expect(match?.confidence).toBeGreaterThanOrEqual(0.9)
    expect(match?.confidence).toBeLessThan(0.95)
  })

  it('maps Commitment (USD) to Capital Commitments, not % of Capital Commitments', () => {
    const match = resolveColumn('Commitment (USD)')
    expect(match?.canonical).toBe('Capital Commitments')
    expect(match?.group).toBe('Commitment Data')
  })

  it('still maps explicit percent commitment headers to % of Capital Commitments', () => {
    const match = resolveColumn('% Commitment')
    expect(match?.canonical).toBe('% of Capital Commitments')
    expect(match?.group).toBe('Commitment Data')
  })

  it('maps NAV Range (USD) to NAV, not AUM', () => {
    const match = resolveColumn('NAV Range (USD)')
    expect(match?.canonical).toBe('NAV')
    expect(match?.group).toBe('Financial Scale')
  })
})
