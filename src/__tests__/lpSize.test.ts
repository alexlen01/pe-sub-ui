import { describe, it, expect } from 'vitest'
import { lpSizeFormat } from '../utils/lpSize'

describe('lpSizeFormat', () => {
  it('shows already-abbreviated / unit-bearing values verbatim', () => {
    expect(lpSizeFormat('$700Mn')).toBe('$700Mn')
    expect(lpSizeFormat('240B')).toBe('240B')
    expect(lpSizeFormat('2T')).toBe('2T')
    expect(lpSizeFormat('$4.8 bn')).toBe('$4.8 bn')
    expect(lpSizeFormat('$21 bn+')).toBe('$21 bn+')
    expect(lpSizeFormat('1.33. tn')).toBe('1.33. tn')
    expect(lpSizeFormat('57 bn')).toBe('57 bn')
  })

  it('condenses a purely numeric value into short currency', () => {
    expect(lpSizeFormat('1000000000')).toBe('$1bn')
    expect(lpSizeFormat('7650000000')).toBe('$7.65bn')
    expect(lpSizeFormat('2000000000000')).toBe('$2tn')
    expect(lpSizeFormat('500000000')).toBe('$500mn')
    expect(lpSizeFormat('50000')).toBe('$50k')
    expect(lpSizeFormat('85.51')).toBe('$85.51')
  })

  it('handles a leading $ and thousands separators on numeric values', () => {
    expect(lpSizeFormat('$1000000000')).toBe('$1bn')
    expect(lpSizeFormat('1,000,000,000')).toBe('$1bn')
    expect(lpSizeFormat('$700,000,000')).toBe('$700mn')
  })

  it('trims trailing zeros in the condensed form', () => {
    expect(lpSizeFormat('7600000000')).toBe('$7.6bn')
    expect(lpSizeFormat('7000000000')).toBe('$7bn')
  })

  it('returns the fallback for blank input', () => {
    expect(lpSizeFormat('')).toBe('—')
    expect(lpSizeFormat(null)).toBe('—')
    expect(lpSizeFormat(undefined)).toBe('—')
    expect(lpSizeFormat('—')).toBe('—')
  })
})
