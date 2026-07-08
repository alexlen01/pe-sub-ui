import { describe, it, expect } from 'vitest'
import { countAutoPopulatedCls, getAutoPopulatedClsKind, parsePct } from '../screens/RunShadowBB'

// The Run Shadow BB "LP Category & Rate Assignment" step pre-fills UBS Classification,
// Advance Rate and Concentration Limit for LPs whose stored record carried no valid UBS
// class ("derived") or whose class was lifted by LP Master data ("upgraded"). Those rows
// are highlighted and counted in the amber banner. Once the user edits and saves a row it
// becomes user-owned: the screen filters that key out of the count (and clears its
// highlight), so the banner decrements. These tests pin the counting contract the
// component's manuallyAdjusted filter relies on.

const UBS_CLS = ['Rated', 'Unrated >2bn', 'Unrated 1-2bn', 'Unrated <1bn', 'Excluded']

describe('getAutoPopulatedClsKind', () => {
  it('returns "" when the override matches the stored class (nothing auto-mapped)', () => {
    expect(getAutoPopulatedClsKind({ cls: 'Rated' }, { cls: 'Rated' }, UBS_CLS)).toBe('')
  })

  it('returns "" when the override has no class', () => {
    expect(getAutoPopulatedClsKind({ cls: 'Rated' }, { cls: '' }, UBS_CLS)).toBe('')
    expect(getAutoPopulatedClsKind({ cls: 'Rated' }, undefined, UBS_CLS)).toBe('')
  })

  it('returns "derived" when a blank stored class was filled in', () => {
    expect(getAutoPopulatedClsKind({ cls: '' }, { cls: 'Unrated <1bn' }, UBS_CLS)).toBe('derived')
  })

  it('returns "upgraded" when a stored UBS class was lifted to another tier', () => {
    expect(getAutoPopulatedClsKind({ cls: 'Unrated <1bn' }, { cls: 'Rated' }, UBS_CLS)).toBe('upgraded')
  })
})

describe('countAutoPopulatedCls', () => {
  const lps = [
    { _key: 'a', cls: '' },              // derived
    { _key: 'b', cls: 'Unrated <1bn' },  // upgraded
    { _key: 'c', cls: 'Rated' },         // unchanged
  ]
  const overrides = {
    a: { cls: 'Unrated <1bn' },
    b: { cls: 'Rated' },
    c: { cls: 'Rated' },
  }

  it('tallies derived and upgraded auto-populations', () => {
    expect(countAutoPopulatedCls(lps, overrides, UBS_CLS)).toEqual({ derived: 1, upgraded: 1 })
  })

  it('decrements once a manually-adjusted row is filtered out (matches the screen)', () => {
    // The screen passes submissionLPs.filter(lp => !manuallyAdjusted.has(lp._key)).
    // Saving an edit to the derived row 'a' removes it from the count.
    const remaining = lps.filter(lp => !new Set(['a']).has(lp._key))
    expect(countAutoPopulatedCls(remaining, overrides, UBS_CLS)).toEqual({ derived: 0, upgraded: 1 })
  })

  it('drops to zero when every auto-mapped row has been manually adjusted', () => {
    const adjusted = new Set(['a', 'b'])
    const remaining = lps.filter(lp => !adjusted.has(lp._key))
    expect(countAutoPopulatedCls(remaining, overrides, UBS_CLS)).toEqual({ derived: 0, upgraded: 0 })
  })
})

describe('parsePct', () => {
  it('preserves explicit zero percent values', () => {
    expect(parsePct('0%')).toBe(0)
  })
})
