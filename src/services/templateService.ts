// Template recognition: identifies which Agent BB format a submission is and exposes
// its structural profile (tabs, title anchor, header row, LP-category group sections,
// column headers, legend) for the extraction preview. Mirrors the backend recognition
// contract (pe-sub-extraction TemplateDetector → ClassificationRowDetector).

import { TEMPLATE_PROFILES, TEMPLATE_PROFILE_BY_ID, type TemplateProfile } from '../data/templateProfiles'
import { ALIAS_GROUPS } from '../data/fieldMappingData'

export type { TemplateProfile } from '../data/templateProfiles'

export interface DocRecognitionRow {
  label: string
  value: string
  wide?: boolean
}

export interface ColumnMapping {
  canonical: string
  group: string
  tier: string
}

export interface MappedColumn {
  header: string
  mapping: ColumnMapping | null
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

// Resolve a raw column header to its canonical LP Master field via the alias dictionary.
// Mirrors the prototype templateService + backend HeaderMatcher. Returns null when unmatched.
export function resolveColumn(header: string): ColumnMapping | null {
  const target = normalize(header)
  if (!target) return null
  for (const grp of ALIAS_GROUPS) {
    for (const field of grp.fields) {
      for (const alias of field.aliases) {
        const a = normalize(alias.text)
        const exact = target === a
        const contains = a.includes(' ') && target.includes(a)
        if (exact || contains) {
          return { canonical: field.canonical, group: grp.group, tier: alias.tier ?? 'Core' }
        }
      }
    }
  }
  return null
}

// Annotate a profile's columns with their canonical mapping (or null when unmatched), so
// the Template Recognition card can accent recognised vs. unrecognised headers.
export function mapColumns(profile: TemplateProfile | null): MappedColumn[] {
  if (!profile) return []
  return profile.columns.map(header => ({ header, mapping: resolveColumn(header) }))
}

// Heuristic format recognition from submission metadata. The backend keys off workbook
// content (title-anchor + tab pattern); here we match the fund label, title anchor, or any
// extra recognition keys (agent bank / file-name fragments). Falls back to the first profile
// so the preview always has a format to show.
export function detectTemplate(meta: { fileName?: string; facility?: string; fund?: string }): TemplateProfile {
  const hay = normalize(`${meta.fileName ?? ''} ${meta.facility ?? ''} ${meta.fund ?? ''}`)
  return TEMPLATE_PROFILES.find(p => {
    const fund = normalize(p.fund)
    const title = normalize(p.title.text)
    const keys = (p.detectKeys ?? []).map(normalize)
    return (fund.length > 0 && hay.includes(fund))
        || (title.length > 0 && hay.includes(title))
        || keys.some(k => k.length > 0 && hay.includes(k))
  }) ?? TEMPLATE_PROFILES[0]
}

// Build the structural recognition rows (label/value) for a detected profile. Row set and
// order mirror the pe-sub-platform prototype so the Document Recognition grid matches it.
export function buildDocRecognition(
  profile: TemplateProfile,
  opts: { fileName?: string; columnsMatched?: number; columnsTotal?: number } = {},
): DocRecognitionRow[] {
  const tabs = profile.workbook.tabs === 'single'
    ? `Single tab · "${profile.workbook.tabLabel}"`
    : `Multiple tabs · one "${profile.workbook.tabLabel}" tab per borrower/sleeve`
  const headerRow = String(profile.headerRow).includes('-')
    ? `Rows ${profile.headerRow} (stacked — joined before matching)`
    : `Row ${profile.headerRow}`
  const grouping = profile.groupHeaders.length > 0
    ? `${profile.groupHeaders.length} LP-category sections (subtotal row excluded per section)`
    : 'Flat list — no LP-category sections'
  // Prefer the live extraction's column counts when supplied; fall back to the static
  // profile only in prototype mode (no submission to extract from).
  const matched = opts.columnsMatched ?? mapColumns(profile).filter(c => c.mapping).length
  const total   = opts.columnsTotal ?? profile.columns.length

  return [
    { label: 'Document',          value: opts.fileName || '—' },
    { label: 'Recognized format', value: profile.fund, wide: true },
    { label: 'Workbook',          value: tabs, wide: true },
    { label: 'Title anchor',      value: `Row ${profile.title.row} · "${profile.title.text}"`, wide: true },
    { label: 'Column header row', value: headerRow },
    { label: 'Summary block',     value: profile.summaryRows ? `Rows ${profile.summaryRows} (skipped)` : 'None' },
    { label: 'LP grouping',       value: grouping, wide: true },
    { label: 'Columns matched',   value: `${matched} of ${total} mapped to canonical LP fields` },
    { label: 'Legend',            value: profile.legend ? `${profile.legend.length} cell-format rules` : 'None' },
  ]
}
