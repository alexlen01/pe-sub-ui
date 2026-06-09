import { EXTRACTED_LPS, EXTRACTION_FIELD_MAP, DOC_RECOGNITION, UNRECOGNIZED_COLUMNS } from '../data/extractionData'
import { ALL_CANONICAL_FIELDS } from '../data/fieldMappingData'
import { api, type DocRecognition } from './api'

function parseMoney(s: string): number {
  const cleaned = (s || '').replace(/[$,]/g, '')
  const m = cleaned.match(/^([0-9.]+)([BMTKbmtk]?)$/)
  if (!m) return 0
  const mult: Record<string, number> = { B: 1e9, M: 1e6, T: 1e12, K: 1e3, '': 1 }
  return parseFloat(m[1]) * (mult[m[2].toUpperCase()] ?? 1)
}

function enrichBBFields(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const withRaw = rows.map(r => {
    if (r.agentBBFmt !== undefined) return r
    const bbRaw = Math.round(parseMoney(r.uncalled as string) * (parseFloat((r.agentRate as string || '').replace('%', '')) / 100 || 0))
    return { ...r, agentBBRaw: bbRaw }
  })
  const totalBB = withRaw.reduce((s, r) => s + ((r.agentBBRaw as number) || 0), 0)
  return withRaw.map(r => {
    if (r.agentBBFmt !== undefined) return r
    const bb = (r.agentBBRaw as number) || 0
    return {
      ...r,
      agentBBFmt: bb ? '$' + bb.toLocaleString('en-US') : '',
      pctBBFmt:   totalBB && bb ? (bb / totalBB * 100).toFixed(2) + '%' : '',
    }
  })
}

export async function getExtractedLPs(live: boolean, submissionId: number) {
  if (!live) return EXTRACTED_LPS
  const rows = await api.extraction.extractedLPs(submissionId)
  return enrichBBFields(rows as unknown as Record<string, unknown>[])
}

export async function getExtractionFieldMap(live: boolean, submissionId: number) {
  if (!live) return EXTRACTION_FIELD_MAP
  return await api.extraction.fieldMap(submissionId)
}

export async function getDocRecognition(live: boolean, submissionId: number) {
  if (!live) return DOC_RECOGNITION
  const raw = await api.extraction.docRecognition(submissionId)
  return toDocRecList(raw)
}

function toDocRecList(r: DocRecognition): typeof DOC_RECOGNITION {
  return [
    { label: 'Document',          value: r.document },
    { label: 'Format',            value: r.format },
    { label: 'Tables identified', value: r.tablesIdentified ?? '1 borrowing-base table' },
    { label: 'Table location',    value: r.tableLocation ?? '—' },
    { label: 'Header row',        value: r.headerInfo },
    { label: 'LP rows extracted', value: String(r.totalRows) },
  ]
}

export async function getUnrecognizedColumns(live: boolean, submissionId: number) {
  if (!live) return UNRECOGNIZED_COLUMNS
  const cols = await api.extraction.unrecognizedColumns(submissionId)
  return cols.map(c => ({ extracted: c, reason: 'Not matched to any canonical field' }))
}

export async function getAllCanonicalFields(live: boolean) {
  if (!live) return ALL_CANONICAL_FIELDS
  return await api.fieldMapping.canonicalFields()
}
