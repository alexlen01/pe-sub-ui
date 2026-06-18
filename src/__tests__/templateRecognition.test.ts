import { describe, it, expect } from 'vitest'
import {
  getTemplateProfiles, getTemplateProfile, detectTemplate, buildDocRecognition,
} from '../services/templateService'
import { TEMPLATE_PROFILES, ALL_GROUP_HEADERS } from '../data/templateProfiles'

describe('template registry', () => {
  it('holds the 5 sampled Agent BB formats', () => {
    expect(TEMPLATE_PROFILES).toHaveLength(5)
    expect(getTemplateProfiles().map(p => p.id)).toEqual([
      'kkr-ascendant', 'audax-vii', 'ccp-vii-lev', 'aep-vii', 'cp-vii',
    ])
  })

  it('exposes the new group-header superset that extends the standard values', () => {
    expect(ALL_GROUP_HEADERS).toContain('Borrowing Base Investors')
    expect(ALL_GROUP_HEADERS).toContain('Hurdle Investors')
    expect(ALL_GROUP_HEADERS).toContain('Levered (Delaware) Feeder')
  })

  it('captures KKR Ascendant structure: single tab, 6 sections, 13 columns', () => {
    const kkr = getTemplateProfile('kkr-ascendant')
    expect(kkr).not.toBeNull()
    expect(kkr!.workbook.tabs).toBe('single')
    expect(kkr!.headerRow).toBe(10)
    expect(kkr!.groupHeaders).toHaveLength(6)
    expect(kkr!.columns).toHaveLength(13)
  })

  it('captures CP VII stacked header and flat (no-section) layout', () => {
    const cp = getTemplateProfile('cp-vii')!
    expect(cp.headerRow).toBe('84-85')
    expect(cp.groupHeaders).toHaveLength(0)
  })

  it('captures the AEP VII cell-format legend', () => {
    const aep = getTemplateProfile('aep-vii')!
    expect(aep.legend).not.toBeNull()
    expect(aep.legend!.map(r => r.style)).toContain('Green shading')
  })
})

describe('detectTemplate', () => {
  it('matches a format by fund label in the file name', () => {
    expect(detectTemplate({ fileName: 'Agent-BB-KKR-Ascendant-May-2026.xlsx' }).id).toBe('kkr-ascendant')
  })
  it('matches by facility text', () => {
    expect(detectTemplate({ facility: 'Carlyle CP VII Facility' }).id).toBe('cp-vii')
  })
  it('falls back to the first profile when nothing matches', () => {
    expect(detectTemplate({ fileName: 'unknown.xlsx' }).id).toBe('kkr-ascendant')
  })
})

describe('buildDocRecognition', () => {
  it('renders stacked-header and grouping detail for CP VII', () => {
    const rows = buildDocRecognition(getTemplateProfile('cp-vii')!)
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]))
    expect(byLabel['Column header row']).toMatch(/stacked/i)
    expect(byLabel['LP grouping']).toMatch(/Flat list/i)
  })

  it('reports the section count and legend for AEP VII', () => {
    const rows = buildDocRecognition(getTemplateProfile('aep-vii')!)
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]))
    expect(byLabel['LP grouping']).toMatch(/4 LP-category sections/)
    expect(byLabel['Legend']).toMatch(/4 cell-format rules/)
  })
})
