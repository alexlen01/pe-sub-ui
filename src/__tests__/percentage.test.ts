import { describe, expect, it } from 'vitest'
import { formatPercentageFraction, formatPercentageText, formatPercentageValue, formatSignedPercentageFraction } from '../utils/percentage'

describe('percentage formatting', () => {
  it('drops the trailing zero for whole percentages', () => {
    expect(formatPercentageValue(75)).toBe('75%')
    expect(formatPercentageFraction(0.9)).toBe('90%')
    expect(formatPercentageText('55.00%')).toBe('55%')
  })

  it('retains one decimal and rounds to tenths', () => {
    expect(formatPercentageValue(75.44)).toBe('75.4%')
    expect(formatPercentageValue(75.45)).toBe('75.5%')
    expect(formatPercentageFraction(0.8333)).toBe('83.3%')
  })

  it('normalizes zero, signed values, and missing values', () => {
    expect(formatPercentageValue(-0)).toBe('0%')
    expect(formatSignedPercentageFraction(0)).toBe('0%')
    expect(formatSignedPercentageFraction(-0.018)).toBe('-1.8%')
    expect(formatSignedPercentageFraction(0.02)).toBe('+2%')
    expect(formatPercentageText(null)).toBe('—')
  })
})
