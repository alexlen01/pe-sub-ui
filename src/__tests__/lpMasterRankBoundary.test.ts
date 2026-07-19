// @ts-expect-error This browser tsconfig omits Node typings; Vitest supplies the Node runtime.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('LP rank display boundary', () => {
  it('shows Rank for a selected facility but not for All Facilities', () => {
    const lpMaster = source('../screens/LPMaster/index.tsx')
    const lpRecordPanel = source('../components/ui/LPRecordPanel.tsx')
    const shadowBb = source('../screens/ShadowBB/index.tsx')

    expect(lpMaster).toMatch(/facFilter && \(\s*<SortableHeader sortKey="rank"/)
    expect(lpMaster).toMatch(/facFilter && <td[^>]*>\{LPRecord\.rank/)
    expect(lpMaster).toContain('showRank={Boolean(facFilter)}')
    expect(lpRecordPanel).toContain("showRank && calc('Rank', LPRecord.rank")
    expect(shadowBb).toContain('showRank')
  })
})
