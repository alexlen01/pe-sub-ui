// Template recognition: identifies which Agent BB format a submission is and exposes
// its structural profile (tabs, title anchor, header row, LP-category group sections,
// column headers, legend) for the extraction preview. Mirrors the backend recognition
// contract (pe-sub-extraction TemplateDetector → ClassificationRowDetector).

import { TEMPLATE_PROFILES, TEMPLATE_PROFILE_BY_ID, type TemplateProfile } from '../data/templateProfiles'

export type { TemplateProfile } from '../data/templateProfiles'

export interface DocRecognitionRow {
  label: string
  value: string
  wide?: boolean
}

export function getTemplateProfiles(): TemplateProfile[] {
  return TEMPLATE_PROFILES
}

export function getTemplateProfile(id: string): TemplateProfile | null {
  return TEMPLATE_PROFILE_BY_ID[id] ?? null
}

function normalize(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Heuristic format recognition from submission metadata. The backend keys off workbook
// content (title-anchor + tab pattern); here we match the fund label. Falls back to the
// first profile so the preview always has a format to show.
export function detectTemplate(meta: { fileName?: string; facility?: string; fund?: string }): TemplateProfile {
  const hay = normalize(`${meta.fileName ?? ''} ${meta.facility ?? ''} ${meta.fund ?? ''}`)
  return TEMPLATE_PROFILES.find(p => {
    const fund = normalize(p.fund)
    const title = normalize(p.title.text)
    return (fund.length > 0 && hay.includes(fund)) || (title.length > 0 && hay.includes(title))
  }) ?? TEMPLATE_PROFILES[0]
}

// Build the structural recognition rows (label/value) for a detected profile.
export function buildDocRecognition(profile: TemplateProfile): DocRecognitionRow[] {
  const tabs = profile.workbook.tabs === 'single'
    ? `Single tab · "${profile.workbook.tabLabel}"`
    : `Multiple tabs · one "${profile.workbook.tabLabel}" tab per borrower/sleeve`
  const headerRow = String(profile.headerRow).includes('-')
    ? `Rows ${profile.headerRow} (stacked — joined before matching)`
    : `Row ${profile.headerRow}`
  const grouping = profile.groupHeaders.length > 0
    ? `${profile.groupHeaders.length} LP-category sections (subtotal row excluded per section)`
    : 'Flat list — no LP-category sections'

  return [
    { label: 'Recognized format', value: profile.fund, wide: true },
    { label: 'Workbook',          value: tabs, wide: true },
    { label: 'Title anchor',      value: `Row ${profile.title.row} · "${profile.title.text}"`, wide: true },
    { label: 'Column header row', value: headerRow },
    { label: 'Summary block',     value: profile.summaryRows ? `Rows ${profile.summaryRows} (skipped)` : 'None' },
    { label: 'Columns',           value: `${profile.columns.length} per-LP fields` },
    { label: 'LP grouping',       value: grouping, wide: true },
    { label: 'Legend',            value: profile.legend ? `${profile.legend.length} cell-format rules` : 'None' },
  ]
}
