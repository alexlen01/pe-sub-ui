// @ts-expect-error This browser tsconfig omits Node typings; Vitest supplies the Node runtime.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Rank is facility-specific, so LP Master must hide it under "All Facilities" (see the project
// CLAUDE.md "Rank display boundary"). Without jsdom this suite cannot render, so the guard is a
// source check on the one thing that carries the rule: the showRank prop LP Master passes down,
// and the panel gating its Rank field on it. Deliberately no assertions on JSX formatting —
// those only pin the source layout and break on unrelated refactors.
const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('LP rank display boundary', () => {
  it('drives Rank visibility from the selected facility, not from the record shape', () => {
    const lpMaster = source('../screens/LPMaster/index.tsx')
    const lpRecordPanel = source('../components/ui/LPRecordPanel.tsx')
    const shadowBb = source('../screens/ShadowBB/index.tsx')

    // The boundary is facFilter — a selected facility, not merely `lpRank` being present.
    expect(lpMaster).toContain('showRank={Boolean(facFilter)}')
    expect(lpRecordPanel).toContain('showRank &&')
    // Shadow BB is always facility-scoped, so it keeps Rank.
    expect(shadowBb).toContain('showRank')
  })

  it('shows the Facility column only on the mixed "All Facilities" table', () => {
    const lpMaster = source('../screens/LPMaster/index.tsx')

    // Facility is the mirror of Rank: it earns its place only where rows span facilities.
    expect(lpMaster).toContain('sortKey="facility"')
    expect(lpMaster).toContain('{!facFilter && (')
    // Rank and Facility are mutually exclusive, so exactly one column width is ever hidden.
    expect(lpMaster).toContain('tableWidth - (facFilter ? widths.facility : widths.rank)')
  })
})
