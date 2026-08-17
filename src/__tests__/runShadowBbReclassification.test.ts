import { describe, expect, it } from 'vitest'
import { marksReclassificationOnSave } from '../screens/RunShadowBB'

const stored = { agentLpCategory: 'Included', ubsLpCategory: 'Eligible', reclassified: false }

describe('Reclassification marking on the Run Shadow BB screen', () => {
  it('marks nothing during wizard steps 1-5, before the submission has been run', () => {
    expect(marksReclassificationOnSave(false, { ubsLpCategory: 'Rated' }, stored)).toBe(false)
    expect(marksReclassificationOnSave(false, { agentLpCategory: 'Excluded' }, stored)).toBe(false)
  })

  it('does not resurrect an already-flagged record before the run either', () => {
    expect(marksReclassificationOnSave(false, { ubsLpCategory: 'Eligible' },
      { ...stored, reclassified: true })).toBe(false)
  })

  it('marks a UBS or Agent category change once the Shadow BB exists', () => {
    expect(marksReclassificationOnSave(true, { ubsLpCategory: 'Rated' }, stored)).toBe(true)
    expect(marksReclassificationOnSave(true, { agentLpCategory: 'Excluded' }, stored)).toBe(true)
  })

  it('leaves an unchanged record unmarked after the run', () => {
    expect(marksReclassificationOnSave(true,
      { agentLpCategory: 'Included', ubsLpCategory: 'Eligible' }, stored)).toBe(false)
  })

  it('keeps the flag on a record the server already marked, after the run', () => {
    expect(marksReclassificationOnSave(true, { ubsLpCategory: 'Eligible' },
      { ...stored, reclassified: true })).toBe(true)
  })
})
