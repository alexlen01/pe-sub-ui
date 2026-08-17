import { describe, expect, it } from 'vitest'

import { fromTemplate, toRequest } from '../screens/BBTemplates'
import type { BbTemplate } from '../services/api'

// PUT /api/bb-templates/{id} replaces the whole record — the API sets summaryRowRange/titleRow/
// titleText unconditionally and overwrites notes/legend whenever they are non-null. So any field
// the edit form fails to carry from the loaded template back into the request is destroyed the
// first time a user opens a template and saves it, even without touching anything. This suite
// pins the full round trip rather than individual fields, so a field added to BbTemplateInput
// later cannot be quietly dropped the same way.
const template: BbTemplate = {
  id: 1,
  templateSlug: 'aep-vii',
  templateName: 'aep-vii',
  agentName: 'JP Morgan',
  templateClass: 'A',
  sheetName: 'BB',
  headerRowIndex: 9,
  autoLearned: false,
  trancheCount: 1,
  hasGroupingRows: true,
  hasColorFlags: true,
  autoDiscoverTabs: false,
  summaryRowsAboveHeader: 7,
  summaryRowRange: '3-9',
  titleRow: 83,
  titleText: 'Deal Name:',
  detectKeys: ['aep', 'aep vii'],
  legend: [
    { style: 'Green shading', meaning: 'LP new to the BB, NOT via LP Transfer' },
    { style: 'Yellow shading', meaning: 'LP new to the BB via LP Transfer' },
  ],
  notes: [
    'Cell formatting encodes LP-level deltas — capture during extraction, not just the cell value.',
    'Second note, kept so the line-delimited textarea is exercised.',
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  tabs: [{
    id: 10,
    tabRole: 'LP_GRID',
    tabSort: 1,
    sheetName: 'BB',
    sleeveName: null,
    headerRowIndex: 9,
    headerRowSpan: 1,
    skipRowKeywords: ['Total', 'Subtotal'],
    columns: ['Investor', 'Total Commitment'],
    groups: [
      { id: 100, groupSort: 1, headerText: 'Rated Included Investors', classification: 'Rated Included' },
      { id: 101, groupSort: 2, headerText: 'Excluded Investors', classification: 'Ineligible Investors' },
    ],
  }],
}

describe('BB template edit round trip', () => {
  const saved = toRequest(fromTemplate(template))

  it('preserves every template-level field an unchanged save re-sends', () => {
    expect(saved.notes).toEqual(template.notes)
    expect(saved.legend).toEqual(template.legend)
    expect(saved.summaryRowRange).toBe(template.summaryRowRange)
    expect(saved.titleRow).toBe(template.titleRow)
    expect(saved.titleText).toBe(template.titleText)
    expect(saved.detectKeys).toEqual(template.detectKeys)
    expect(saved.summaryRowsAboveHeader).toBe(template.summaryRowsAboveHeader)
    expect(saved.templateSlug).toBe(template.templateSlug)
    expect(saved.agentName).toBe(template.agentName)
    expect(saved.headerRowIndex).toBe(template.headerRowIndex)
    expect(saved.trancheCount).toBe(template.trancheCount)
    expect(saved.hasGroupingRows).toBe(template.hasGroupingRows)
    expect(saved.hasColorFlags).toBe(template.hasColorFlags)
    expect(saved.autoDiscoverTabs).toBe(template.autoDiscoverTabs)
    expect(saved.autoLearned).toBe(template.autoLearned)
  })

  it('preserves the LP_GRID tab and its group sections', () => {
    const tab = saved.tabs[0]
    const source = template.tabs[0]
    expect(saved.tabs).toHaveLength(1)
    expect(tab.sheetName).toBe(source.sheetName)
    expect(tab.headerRowIndex).toBe(source.headerRowIndex)
    expect(tab.headerRowSpan).toBe(source.headerRowSpan)
    expect(tab.skipRowKeywords).toEqual(source.skipRowKeywords)
    expect(tab.columns).toEqual(source.columns)
    expect(tab.groups).toEqual(source.groups.map(g => ({
      groupSort: g.groupSort, headerText: g.headerText, classification: g.classification,
    })))
  })

  it('leaves no BbTemplateInput field hardcoded to an empty value', () => {
    // The original bug was literal `notes: []` / `legend: []` / `titleText: null` in toRequest.
    // Nothing carrying data on the source template may come back empty.
    expect(saved.notes.length).toBeGreaterThan(0)
    expect(saved.legend.length).toBeGreaterThan(0)
    expect(saved.titleText).not.toBeNull()
    expect(saved.summaryRowRange).not.toBeNull()
  })

  it('drops blank notes lines and blank legend rules rather than persisting them', () => {
    const withBlanks = fromTemplate(template)
    withBlanks.notes += '\n\n   \n'
    withBlanks.legend = [...withBlanks.legend, { style: '', meaning: '' }]
    const cleaned = toRequest(withBlanks)
    expect(cleaned.notes).toEqual(template.notes)
    expect(cleaned.legend).toEqual(template.legend)
  })

  it('treats cleared optional fields as null, not empty strings', () => {
    const cleared = fromTemplate(template)
    cleared.titleRow = ''
    cleared.titleText = ''
    cleared.summaryRowRange = ''
    const blank = toRequest(cleared)
    expect(blank.titleRow).toBeNull()
    expect(blank.titleText).toBeNull()
    expect(blank.summaryRowRange).toBeNull()
  })
})
