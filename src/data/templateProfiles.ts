// Agent BB template profiles — extracted from pe-sub-platform/public/BB_Templates.xlsx
// (5 sampled formats). Structural "recognition signatures" the ingestion/extraction engine
// uses to identify which Agent BB format a workbook is and locate the LP table, the
// LP-category group headers, and the per-LP column headers within it.
//
// Reference metadata (same in live and prototype mode) — describes the layout of each
// recognised format. The per-submission extraction results still flow through the normal
// screenMode-aware services. The new group-header labels ("...Investors" suffixes, feeder
// vehicles) extend the standard Agent LP Classification values in classificationConfig.

export interface TemplateLegendRule {
  style: string
  meaning: string
}

export interface TemplateProfile {
  id: string
  fund: string
  workbook: { tabs: 'single' | 'multiple'; tabLabel: string }
  title: { row: number; text: string }
  summaryRows: string | null
  headerRow: number | string   // number, or "84-85" for a stacked (two-row) header
  groupHeaders: string[]       // LP-category banner rows; each followed by an excluded subtotal
  columns: string[]            // ordered per-LP field headers (raw agent text)
  legend: TemplateLegendRule[] | null
  notes: string[]
}

export const TEMPLATE_PROFILES: TemplateProfile[] = [
  {
    id: 'kkr-ascendant',
    fund: 'KKR Ascendant Fund',
    workbook: { tabs: 'single', tabLabel: 'Borrowing Base' },
    title: { row: 2, text: 'KKR Ascendant – Borrowing Base' },
    summaryRows: '2-9',
    headerRow: 10,
    groupHeaders: [
      'Rated Included Investors',
      'Non-Rated Included Investors',
      'Designated Investors',
      'Borrowing Base Investors',
      'Hurdle Investors',
      'Excluded Investors',
    ],
    columns: [
      'Investor', 'Fund Sleeve', "Moody's", 'S&P', 'Net Worth',
      'Total Commitment', 'Funded Commitment', 'Unfunded Commitment',
      '% Total Unfunded Commitment', 'Concentration Limit',
      'Eligible Unfunded Commitment', 'Advance Rate', 'Borrowing Base',
    ],
    legend: null,
    notes: [],
  },
  {
    id: 'audax-vii',
    fund: 'Audax Fund VII',
    workbook: { tabs: 'multiple', tabLabel: 'Investor List' },
    title: { row: 4, text: 'Deal Name: Nerdio' },
    summaryRows: null,
    headerRow: 13,
    groupHeaders: [],
    columns: [
      'Transferred From', 'Investor', 'Borrowing Partnership', 'GA ID',
      'Included/Excluded Investor', 'Capital Commitments', 'Unfunded Commitment',
      '% Included Unfunded Commitment', 'Concentration Limit', 'Excess Concentration',
      'Post-CL Unfunded Commitment', 'Pre-Adjustment Borrowing Base Contribution',
      'Borrowing Base Adjustment',
    ],
    legend: null,
    notes: [
      'Borrowers listed at rows 9-10.',
      'Source detail reads "Column 13: Column Headers" — verify whether headers sit at row 13 or the table begins at spreadsheet column 13.',
    ],
  },
  {
    id: 'ccp-vii-lev',
    fund: 'CCP VII Lev M & M',
    workbook: { tabs: 'multiple', tabLabel: 'Investor List' },
    title: { row: 3, text: 'Comvest Credit Partners VII, LP.' },
    summaryRows: null,
    headerRow: 7,
    groupHeaders: [
      'Levered (Delaware) Feeder',
      '(Cayman) Feeder, L.P.',
      '(Delaware) Feeder, L.P.',
      'Lux Intermediate',
      'Lux Non-Treaty Feeder',
    ],
    columns: [
      'Investor Name', 'Excluded', 'Defaulting?', 'Claimed/Exercised Rights?',
      'Committed Capital', 'Recallable Distribution', 'Remaining Callable Capital',
      'Concentration Limit',
    ],
    legend: null,
    notes: ['Group headers are feeder vehicles (not credit-tier categories); each followed by a total.'],
  },
  {
    id: 'aep-vii',
    fund: 'AEP VII',
    workbook: { tabs: 'single', tabLabel: 'BB' },
    title: { row: 2, text: 'AURORA EQUITY PARTNERS VII LP' },
    summaryRows: '3-9',
    headerRow: 11,
    groupHeaders: [
      'Rated Included Investors',
      'Non-Rated Included Investors',
      'Designated Investors',
      'Excluded Investors',
    ],
    columns: [
      'Investor', "Moody's", 'S&P', 'Net Worth', 'Total Commitment',
      'Funded Commitment', 'Unfunded Commitment', '% Total Unfunded Commitment',
      'Concentration Limit', 'Excess Concentration', 'Eligible Unfunded Commitment',
      'Advance Rate',
    ],
    legend: [
      { style: 'Green shading',   meaning: 'LP new to the BB, NOT via LP Transfer' },
      { style: 'Yellow shading',  meaning: 'LP new to the BB via LP Transfer' },
      { style: 'Blue text',       meaning: 'LP with a change in Commitment Amount' },
      { style: 'Underlined text', meaning: 'LP with a change in Category' },
    ],
    notes: ['Cell formatting encodes LP-level deltas — capture during extraction, not just the cell value.'],
  },
  {
    id: 'cp-vii',
    fund: 'CP VII',
    workbook: { tabs: 'multiple', tabLabel: 'BB' },
    title: { row: 83, text: 'Carlyle Partners VII' },
    summaryRows: null,
    headerRow: '84-85',
    groupHeaders: [],
    columns: [
      'Investor', 'Total Capital Commitments', '% of Eligible Commitments',
      '% of All Commitments', 'Contributions Called to Date', 'Unfunded Commitment',
      'Excess Concentration %', 'Excess Concentration', 'Eligible Contribution',
      'Advance Rate', 'Availability',
    ],
    legend: null,
    notes: [
      'Title sits deep in the sheet (row 83) — anchor on the title row, do not assume row 1.',
      'Two-row stacked header (rows 84-85) — header cells must be joined across both rows before alias matching.',
    ],
  },
]

export const TEMPLATE_PROFILE_BY_ID: Record<string, TemplateProfile> =
  Object.fromEntries(TEMPLATE_PROFILES.map(p => [p.id, p]))

export const ALL_GROUP_HEADERS: string[] =
  [...new Set(TEMPLATE_PROFILES.flatMap(p => p.groupHeaders))]
