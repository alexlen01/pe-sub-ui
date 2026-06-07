import { EXTRACTED_LPS, EXTRACTION_FIELD_MAP, DOC_RECOGNITION, UNRECOGNIZED_COLUMNS } from '../data/extractionData'
import { ALL_CANONICAL_FIELDS } from '../data/fieldMappingData'
import { api, type DocRecognition } from './api'

export async function getExtractedLPs(live: boolean, submissionId: number) {
  if (!live) return EXTRACTED_LPS
  return await api.extraction.extractedLPs(submissionId)
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
