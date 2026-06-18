import { describe, it, expect } from 'vitest'
import { ALIAS_GROUPS } from '../data/fieldMappingData'
import { EXTRACTION_FIELD_MAP } from '../data/extractionData'

// Build lookup tables from the Field Mapping Dictionary (source of truth)
const lpMasterFieldToGroup = new Map<string, string>()
const lpMasterFieldToCanonical = new Map<string, string>()
for (const { group, fields } of ALIAS_GROUPS) {
  for (const f of fields) {
    lpMasterFieldToGroup.set(f.lpMasterField, group)
    lpMasterFieldToCanonical.set(f.lpMasterField, f.canonical)
  }
}

describe('EXTRACTION_FIELD_MAP group values match Field Mapping Dictionary', () => {
  for (const entry of EXTRACTION_FIELD_MAP) {
    it(`"${entry.extracted}" → group "${entry.group}"`, () => {
      const expectedGroup = lpMasterFieldToGroup.get(entry.canonical)
      expect(
        expectedGroup,
        `"${entry.extracted}": canonical "${entry.canonical}" not found in ALIAS_GROUPS lpMasterField values`
      ).toBeDefined()
      expect(entry.group).toBe(expectedGroup)
    })
  }
})

describe('EXTRACTION_FIELD_MAP canonical values match Field Mapping Dictionary lpMasterField', () => {
  for (const entry of EXTRACTION_FIELD_MAP) {
    it(`"${entry.extracted}" → canonical "${entry.canonical}"`, () => {
      const exists = lpMasterFieldToGroup.has(entry.canonical)
      expect(
        exists,
        `"${entry.extracted}": canonical "${entry.canonical}" is not any field's lpMasterField in ALIAS_GROUPS`
      ).toBe(true)
    })
  }
})

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
