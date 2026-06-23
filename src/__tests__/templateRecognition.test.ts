import { describe, it, expect } from 'vitest'
import {
  getTemplateProfiles, getTemplateProfile, detectTemplate, buildDocRecognition,
} from '../services/templateService'
import { TEMPLATE_PROFILES, ALL_GROUP_HEADERS } from '../data/templateProfiles'

describe('template registry', () => {
  it('holds the sampled Agent BB formats plus both Blue Owl templates (WF current, GS legacy)', () => {
    expect(TEMPLATE_PROFILES).toHaveLength(7)
    expect(getTemplateProfiles().map(p => p.id)).toEqual([
      'kkr-ascendant', 'audax-vii', 'ccp-vii-lev', 'aep-vii', 'cp-vii', 'wf-blue-owl', 'gs-blue-owl',
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

  it('captures the Wells Fargo Blue Owl format: 4 LP-category sections, 18 columns, row 18 header', () => {
    const wf = getTemplateProfile('wf-blue-owl')!
    expect(wf.fund).toBe('Blue Owl GP Stakes V')
    expect(wf.headerRow).toBe(18)
    expect(wf.groupHeaders).toHaveLength(4)
    expect(wf.groupHeaders[0]).toBe('A. Rated Investors')
    expect(wf.columns).toHaveLength(18)
    expect(wf.columns[0]).toBe('Investor')
    expect(wf.legend).toHaveLength(2)
  })

  it('captures the legacy Goldman Sachs Blue Owl as a flat list (no LP-category sections)', () => {
    const gs = getTemplateProfile('gs-blue-owl')!
    expect(gs.fund).toBe('Blue Owl GP Stakes V (May 2026)')
    expect(gs.headerRow).toBe(7)
    expect(gs.groupHeaders).toHaveLength(0)
    expect(gs.columns[0]).toBe('Investor Name (Agent Records)')
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
  it('recognises Blue Owl GP Stakes V as the Wells Fargo format (current agent)', () => {
    expect(detectTemplate({ facility: 'Blue Owl GP Stakes V' }).id).toBe('wf-blue-owl')
    expect(detectTemplate({ fileName: 'Agent-BB-Blue-Owl-GP-Stakes-V-May-2026.xlsx' }).id).toBe('wf-blue-owl')
  })
  it('recognises the legacy Goldman Sachs Blue Owl format when agent bank is in the metadata', () => {
    expect(detectTemplate({ fileName: 'Goldman-Sachs-Agent-BB.xlsx' }).id).toBe('gs-blue-owl')
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

  it('renders the Wells Fargo Blue Owl as 4 LP-category sections', () => {
    const rows = buildDocRecognition(getTemplateProfile('wf-blue-owl')!)
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]))
    expect(byLabel['LP grouping']).toMatch(/4 LP-category sections/)
    expect(byLabel['Legend']).toMatch(/2 cell-format rules/)
  })

  it('renders the legacy Goldman Sachs / Blue Owl pilot as a flat list', () => {
    const rows = buildDocRecognition(getTemplateProfile('gs-blue-owl')!)
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]))
    expect(byLabel['LP grouping']).toMatch(/Flat list/i)
  })
})
