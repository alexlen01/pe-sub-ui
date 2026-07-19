// @ts-expect-error This browser tsconfig omits Node typings; Vitest supplies the Node runtime.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('LP Master facility Shadow BB cue', () => {
  it('renders an accessible badge only for facilities with an existing Shadow BB', () => {
    const lpMaster = source('../screens/LPMaster/index.tsx')

    expect(lpMaster).toContain('facility.hasShadowBB && (')
    expect(lpMaster).toContain('aria-label="Existing Shadow BB"')
    expect(lpMaster).toContain('◆ BB')
  })
})
