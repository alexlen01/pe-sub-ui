// @ts-expect-error This browser tsconfig omits Node typings; Vitest supplies the Node runtime.
import { readFileSync } from 'node:fs'
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

// The wizard's LP editor previously derived the badge by comparing the live draft against the
// stored record. Both sides differ on first render for almost every LP — the draft's categories
// come from extraction, LP Master and the rate schedule while the stored record is often blank —
// so untouched and even wholly unclassified rows showed the R badge and the "re-run Shadow BB"
// banner before any run existed. The card now renders the persisted flag only.
describe('Run Shadow BB LP editor badge source', () => {
  const src = readFileSync(new URL('../screens/RunShadowBB/index.tsx', import.meta.url), 'utf8')

  it('renders the badge from the persisted flag, not a draft-vs-stored comparison', () => {
    expect(src).toContain('const reclassified = Boolean(LPRecord.reclassified)')
    expect(src).not.toContain("String(draft.agentLpCategory ?? '').trim() !== String(LPRecord.agentLpCategory ?? '').trim()")
    expect(src).not.toContain("String(draft.ubsLpCategory ?? '').trim() !== String(LPRecord.ubsLpCategory ?? '').trim()")
  })
})
