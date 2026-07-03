import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  initTemplateService, getTemplateProfiles, getTemplateProfile,
  detectTemplate, buildDocRecognition, _resetForTesting,
} from '../services/templateService'

const MOCK_TEMPLATES = [
  {
    id: 1,
    templateName: 'KKR Ascendant Fund',
    templateClass: 'STANDARD',
    sheetName: 'Borrowing Base',
    headerRowIndex: 10,
    autoLearned: false,
    trancheCount: 1,
    hasGroupingRows: true,
    hasColorFlags: false,
    summaryRowsAboveHeader: 0,
    detectKeys: [], legend: [], notes: [],
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
    tabs: [
      {
        id: 1, tabRole: 'MAIN', tabSort: 1, sheetName: 'Borrowing Base',
        headerRowIndex: 10, headerRowSpan: 1, skipRowKeywords: [],
        groups: [
          { id: 1, groupSort: 1, headerText: 'Rated Included Investors',     classification: 'RATED_INCLUDED' },
          { id: 2, groupSort: 2, headerText: 'Non-Rated Included Investors',  classification: 'NON_RATED_INCLUDED' },
          { id: 3, groupSort: 3, headerText: 'Designated Investors',          classification: 'DESIGNATED' },
          { id: 4, groupSort: 4, headerText: 'Borrowing Base Investors',      classification: 'BB' },
          { id: 5, groupSort: 5, headerText: 'Hurdle Investors',              classification: 'HURDLE' },
          { id: 6, groupSort: 6, headerText: 'Excluded Investors',            classification: 'EXCLUDED' },
        ],
      },
    ],
  },
  {
    id: 2,
    templateName: 'Audax Fund VII',
    templateClass: 'MULTI_TAB',
    sheetName: 'Investor List',
    headerRowIndex: 13,
    autoLearned: false,
    trancheCount: 3,
    hasGroupingRows: false,
    hasColorFlags: false,
    summaryRowsAboveHeader: 0,
    detectKeys: [], legend: [], notes: [],
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
    tabs: [
      { id: 2, tabRole: 'MAIN', tabSort: 1, sheetName: 'Investor List', headerRowIndex: 13, headerRowSpan: 1, skipRowKeywords: [], groups: [] },
    ],
  },
  {
    id: 3,
    templateName: 'Carlyle Partners VII',
    templateClass: 'STACKED_HEADER',
    sheetName: 'BB',
    headerRowIndex: 84,
    autoLearned: false,
    trancheCount: 1,
    hasGroupingRows: false,
    hasColorFlags: false,
    summaryRowsAboveHeader: 0,
    detectKeys: [], legend: [], notes: [],
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
    tabs: [
      { id: 3, tabRole: 'MAIN', tabSort: 1, sheetName: 'BB', headerRowIndex: 84, headerRowSpan: 2, skipRowKeywords: [], groups: [] },
    ],
  },
  {
    id: 4,
    templateName: 'AEP VII',
    templateClass: 'STANDARD',
    sheetName: 'BB',
    headerRowIndex: 11,
    autoLearned: false,
    trancheCount: 1,
    hasGroupingRows: true,
    hasColorFlags: true,
    summaryRowsAboveHeader: 9,
    detectKeys: [],
    // hasColorFlags templates carry their colour-coding rules in `legend` (API contract:
    // BbTemplate.legend is always an array; non-empty when the workbook is colour-coded).
    legend: [{ style: 'Orange fill', meaning: 'RCL / recallable distribution row' }],
    notes: [],
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
    tabs: [
      {
        id: 4, tabRole: 'MAIN', tabSort: 1, sheetName: 'BB',
        headerRowIndex: 11, headerRowSpan: 1, skipRowKeywords: [],
        groups: [
          { id: 7, groupSort: 1, headerText: 'Rated Included Investors',    classification: 'RATED_INCLUDED' },
          { id: 8, groupSort: 2, headerText: 'Non-Rated Included Investors', classification: 'NON_RATED_INCLUDED' },
          { id: 9, groupSort: 3, headerText: 'Designated Investors',         classification: 'DESIGNATED' },
          { id: 10, groupSort: 4, headerText: 'Excluded Investors',          classification: 'EXCLUDED' },
        ],
      },
    ],
  },
]

const MOCK_ALIAS_GROUPS = [
  {
    group: 'Identity & Core Hierarchy',
    fields: [
      { id: 1, canonical: 'Investor Name', lpMasterField: 'Identity & Core Hierarchy - Investor Name', disambiguation: null,
        aliases: [{ id: 1, text: 'Investor Name', tier: 'Core', bank: null }] },
    ],
  },
]

beforeEach(() => {
  _resetForTesting()
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const body = url.includes('field-mapping') ? MOCK_ALIAS_GROUPS : MOCK_TEMPLATES
    return Promise.resolve({ json: () => Promise.resolve(body) })
  }))
})

describe('initTemplateService / cache', () => {
  it('populates the profile cache from the API response', async () => {
    await initTemplateService()
    expect(getTemplateProfiles()).toHaveLength(4)
    expect(getTemplateProfiles().map(p => p.fund)).toContain('KKR Ascendant Fund')
  })

  it('is idempotent — second call reuses the cached promise', async () => {
    await initTemplateService()
    await initTemplateService()
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2) // only the initial two fetches
  })
})

describe('adaptTemplate mapping', () => {
  beforeEach(() => initTemplateService())

  it('maps id as string, fund as templateName', () => {
    const kkr = getTemplateProfile('1')
    expect(kkr).not.toBeNull()
    expect(kkr!.fund).toBe('KKR Ascendant Fund')
  })

  it('maps a single-tranche template as single-tab', () => {
    const kkr = getTemplateProfile('1')!
    expect(kkr.workbook.tabs).toBe('single')
    expect(kkr.workbook.tabLabel).toBe('Borrowing Base')
  })

  it('maps a multi-tranche template as multiple-tab', () => {
    const audax = getTemplateProfile('2')!
    expect(audax.workbook.tabs).toBe('multiple')
  })

  it('maps group headers in sort order', () => {
    const kkr = getTemplateProfile('1')!
    expect(kkr.groupHeaders).toHaveLength(6)
    expect(kkr.groupHeaders[0]).toBe('Rated Included Investors')
    expect(kkr.groupHeaders[3]).toBe('Borrowing Base Investors')
  })

  it('derives flat-list (no groups) for Carlyle Partners VII', () => {
    const cp = getTemplateProfile('3')!
    expect(cp.groupHeaders).toHaveLength(0)
  })

  it('maps stacked header row as "N-M" string when headerRowSpan > 1', () => {
    const cp = getTemplateProfile('3')!
    expect(String(cp.headerRow)).toBe('84-85')
  })

  it('maps hasColorFlags to a single legend rule', () => {
    const aep = getTemplateProfile('4')!
    expect(aep.legend).not.toBeNull()
    expect(aep.legend!.length).toBeGreaterThan(0)
  })

  it('maps summaryRowsAboveHeader > 0 to a summaryRows string', () => {
    const aep = getTemplateProfile('4')!
    expect(aep.summaryRows).toBe('1-9')
  })

  it('maps hasColorFlags=false to null legend', () => {
    const kkr = getTemplateProfile('1')!
    expect(kkr.legend).toBeNull()
  })

  it('maps summaryRowsAboveHeader=0 to null summaryRows', () => {
    const kkr = getTemplateProfile('1')!
    expect(kkr.summaryRows).toBeNull()
  })
})

describe('detectTemplate', () => {
  beforeEach(() => initTemplateService())

  it('matches a template by fund name in the file name', () => {
    expect(detectTemplate({ fileName: 'Agent-BB-KKR-Ascendant-Fund-May-2026.xlsx' }).fund).toBe('KKR Ascendant Fund')
  })

  it('matches by facility name', () => {
    expect(detectTemplate({ facility: 'Carlyle Partners VII Facility' }).fund).toBe('Carlyle Partners VII')
  })

  it('falls back to the first template when nothing matches', () => {
    expect(detectTemplate({ fileName: 'unknown.xlsx' }).id).toBe('1')
  })
})

describe('buildDocRecognition', () => {
  beforeEach(() => initTemplateService())

  it('renders flat list for Carlyle Partners VII (no groups)', () => {
    const rows = buildDocRecognition(getTemplateProfile('3')!)
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]))
    expect(byLabel['LP grouping']).toMatch(/Flat list/i)
  })

  it('renders stacked-header row label for Carlyle Partners VII', () => {
    const rows = buildDocRecognition(getTemplateProfile('3')!)
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]))
    expect(byLabel['Column header row']).toMatch(/stacked/i)
  })

  it('renders 4 LP-category sections for AEP VII', () => {
    const rows = buildDocRecognition(getTemplateProfile('4')!)
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]))
    expect(byLabel['LP grouping']).toMatch(/4 LP-category sections/)
  })

  it('renders legend count when hasColorFlags is true', () => {
    const rows = buildDocRecognition(getTemplateProfile('4')!)
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]))
    expect(byLabel['Legend']).toMatch(/cell-format rules/)
  })

  it('renders summary block when summaryRowsAboveHeader > 0', () => {
    const rows = buildDocRecognition(getTemplateProfile('4')!)
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]))
    expect(byLabel['Summary block']).toMatch(/Rows 1-9/)
  })

  it('honours live columnsMatched / columnsTotal overrides', () => {
    const rows = buildDocRecognition(getTemplateProfile('1')!, { columnsMatched: 11, columnsTotal: 13 })
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]))
    expect(byLabel['Columns matched']).toBe('11 of 13 mapped to canonical LP fields')
  })
})
