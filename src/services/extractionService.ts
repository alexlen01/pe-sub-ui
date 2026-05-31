import { EXTRACTED_LPS, EXTRACTION_FIELD_MAP, DOC_RECOGNITION, UNRECOGNIZED_COLUMNS } from '../data/extractionData'
import { ALL_CANONICAL_FIELDS } from '../data/fieldMappingData'
import { api } from './api'

export async function getExtractedLPs() {
  try { return await api.extraction.extractedLPs(1) }
  catch { return EXTRACTED_LPS }
}

export function getExtractionFieldMap() { return EXTRACTION_FIELD_MAP }
export function getDocRecognition()     { return DOC_RECOGNITION }

export async function getUnrecognizedColumns() {
  try { return await api.extraction.unrecognizedColumns(1) }
  catch { return UNRECOGNIZED_COLUMNS }
}

export async function getAllCanonicalFields() {
  try { return await api.fieldMapping.canonicalFields() }
  catch { return ALL_CANONICAL_FIELDS }
}
