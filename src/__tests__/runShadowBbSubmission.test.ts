import { describe, expect, it } from 'vitest'
import { isRunShadowBbDisabled } from '../screens/RunShadowBB'

describe('Run Shadow BB submission availability', () => {
  it('does not block a run because LPs are unclassified', () => {
    // Unclassified rows are intentionally absent from the gate: the run maps them to Excluded.
    expect(isRunShadowBbDisabled(false, true, false, true)).toBe(false)
  })

  it('still blocks a run when its required data or edit permission is unavailable', () => {
    expect(isRunShadowBbDisabled(true, true, false, true)).toBe(true)
    expect(isRunShadowBbDisabled(false, false, false, true)).toBe(true)
    expect(isRunShadowBbDisabled(false, true, true, true)).toBe(true)
    expect(isRunShadowBbDisabled(false, true, false, false)).toBe(true)
  })
})
