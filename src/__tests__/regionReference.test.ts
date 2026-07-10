import { describe, it, expect } from 'vitest'
import {
  searchRegions,
  formatRegion,
  regionOf,
  parseRegionToken,
  tokenForEntry,
  toRegionToken,
  REGION_ENTRIES,
} from '../config/regionReference'

// The Region/Location typeahead resolves every commit to a canonical token so the borrowing-base
// and concentration logic can key off structured region/country codes. These cover the search
// behaviour that powers the typeahead and the token<->label round-trip used in table + form.

describe('searchRegions (typeahead matching)', () => {
  it('matches PE domiciles by nickname alias', () => {
    expect(searchRegions('cayman').map(e => e.country)).toContain('KY')
    expect(searchRegions('lux').map(e => e.country)).toContain('LU')
    expect(searchRegions('delaware').map(e => e.sub)).toContain('DE')
  })

  it('matches by ISO2 country code and by macro region name', () => {
    expect(searchRegions('KY').map(e => e.country)).toContain('KY')
    // "asia" should surface APAC members, not silently drop
    expect(searchRegions('asia').every(e => e.region === 'APAC')).toBe(true)
    expect(searchRegions('asia').length).toBeGreaterThan(0)
  })

  it('offers Domestic as a canonical US region selection', () => {
    const domestic = searchRegions('domestic')[0]
    expect(domestic.label).toBe('Domestic')
    expect(tokenForEntry(domestic)).toBe('NAM|US|DOM')
    expect(formatRegion('NAM|US|DOM')).toBe('Domestic')
  })

  it('ranks an exact label prefix above alias-only matches', () => {
    const results = searchRegions('ire')
    expect(results[0].country).toBe('IE') // "Ireland" prefix wins
  })

  it('returns pinned domiciles for an empty query', () => {
    const pinned = searchRegions('')
    expect(pinned.length).toBeGreaterThan(0)
    expect(pinned.every(e => e.pinned)).toBe(true)
  })

  it('NEGATIVE: an unrecognised query yields no matches (never a silent wrong pick)', () => {
    expect(searchRegions('zzz-not-a-place')).toEqual([])
  })
})

describe('token <-> label round-trip', () => {
  it('formats a subdivision token to its canonical label and back to a region code', () => {
    const delaware = REGION_ENTRIES.find(e => e.sub === 'DE' && e.country === 'US')!
    const token = tokenForEntry(delaware)
    expect(token).toBe('NAM|US|DE')
    expect(formatRegion(token)).toBe('Delaware, US')
    expect(regionOf(token)).toBe('NAM')
    expect(parseRegionToken(token)).toEqual({ region: 'NAM', country: 'US', sub: 'DE' })
  })

  it('formats a country-level token (Cayman) to its label', () => {
    expect(formatRegion('LATAM|KY|')).toBe('Cayman Islands')
    expect(regionOf('LATAM|KY|')).toBe('LATAM')
  })

  it('is tolerant of legacy free-text values (renders + classifies without a backfill)', () => {
    expect(formatRegion('North America')).toBe('North America') // passthrough, unchanged
    expect(regionOf('North America')).toBe('NAM')
    expect(regionOf('Europe')).toBe('EMEA')
  })

  it('returns empty for empty/unknown input rather than throwing', () => {
    expect(formatRegion('')).toBe('')
    expect(regionOf('')).toBe('')
    expect(regionOf('Atlantis')).toBe('')
  })

  it('accepts a bespoke free-text jurisdiction verbatim (region-unknown)', () => {
    // The typeahead saves raw text when nothing matches; it must render exactly as entered and
    // resolve to no macro region (so it is treated conservatively as non-US downstream).
    expect(formatRegion('Principality of Sealand')).toBe('Principality of Sealand')
    expect(regionOf('Principality of Sealand')).toBe('')
  })
})

describe('toRegionToken (backfill normaliser)', () => {
  it('leaves an existing structured token unchanged', () => {
    expect(toRegionToken('NAM|US|DE')).toBe('NAM|US|DE')
  })

  it('maps a legacy region name to a region-only token that round-trips', () => {
    const token = toRegionToken('North America')
    expect(token).toBe('NAM||')
    expect(regionOf(token)).toBe('NAM')
    expect(formatRegion(token)).toBe('North America')
  })

  it('returns empty for an unmappable value so a backfill can flag it', () => {
    expect(toRegionToken('somewhere else')).toBe('')
    expect(toRegionToken('')).toBe('')
  })
})
