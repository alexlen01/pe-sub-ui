import { describe, expect, it } from 'vitest'

import { advanceRateGroupLabel } from '../utils/advanceRateFloorMap'

describe('advanceRateGroupLabel', () => {
  it.each([
    [100, '90%'],
    [90, '90%'],
    [89.9, '75%'],
    [75, '75%'],
    [74.9, '65%'],
    [65, '65%'],
    [64.9, '50%'],
    [50, '50%'],
    [49.9, '0%'],
    [0, '0%'],
  ])('slots %s%% into the %s group', (rate, expectedGroup) => {
    expect(advanceRateGroupLabel(rate)).toBe(expectedGroup)
  })

  it('accepts formatted percentage strings', () => {
    expect(advanceRateGroupLabel('89.9%')).toBe('75%')
  })
})
