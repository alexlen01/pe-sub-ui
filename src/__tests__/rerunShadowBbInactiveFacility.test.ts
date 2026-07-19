// @ts-expect-error This browser tsconfig omits Node typings; Vitest supplies the Node runtime.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('Re-run Shadow BB availability', () => {
  it('disables and guards the action for an inactive facility on every screen that exposes it', () => {
    const lpMaster = source('../screens/LPMaster/index.tsx')
    const shadowBb = source('../screens/ShadowBB/index.tsx')

    expect(lpMaster).toContain("facFilter.status === 'Inactive'")
    expect(lpMaster).toContain("if (!facFilter?.id || facFilter.status === 'Inactive') return")
    expect(shadowBb).toContain("?.status === 'Inactive'")
    expect(shadowBb).toContain('if (facilityId == null || facilityInactive) return')
    expect(shadowBb).toContain('shadowRows.length === 0 || facilityInactive')
  })

  it('shows an explanation when the inactive disabled state is clicked', () => {
    const lpMaster = source('../screens/LPMaster/index.tsx')
    const shadowBb = source('../screens/ShadowBB/index.tsx')
    const message = 'Re-run Shadow BB is unavailable because this facility is inactive.'

    expect(lpMaster).toContain(message)
    expect(lpMaster).toContain("onClick={facFilter.status === 'Inactive' ? explainInactiveRerun : undefined}")
    expect(shadowBb).toContain(message)
    expect(shadowBb).toContain('onClick={facilityInactive ? explainInactiveRerun : undefined}')
  })
})
