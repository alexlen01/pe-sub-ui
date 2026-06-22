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
    // % Called is derived (Called ÷ Commitment) — always present it, even when the
    // API already supplied the BB columns.
    const c = parseMoney(r.commit as string)
    const uncalledStr = (r.uncalled as string) || ''
    const u = parseMoney(uncalledStr)
    // Only compute % Called when we actually have both commit and uncalled values.
    // parseMoney('') returns 0, which would make (c-0)/c = 100% — a misleading result.
    const pctCalledFmt = r.pctCalledFmt !== undefined
      ? r.pctCalledFmt
      : (c && uncalledStr.trim() ? Math.max(0, (c - u) / c * 100).toFixed(1) + '%' : '')
    if (r.agentBBFmt !== undefined) return { ...r, pctCalledFmt }
    const bb = (r.agentBBRaw as number) || 0
    return {
      ...r,
      pctCalledFmt,
      agentBBFmt: bb ? '$' + bb.toLocaleString('en-US') : '',
      pctBBFmt:   totalBB && bb ? (bb / totalBB * 100).toFixed(2) + '%' : '',
    }
  })
}

export async function getExtractedLPs(submissionId: number) {
  const rows = await api.extraction.extractedLPs(submissionId)
  return enrichBBFields(rows as unknown as Record<string, unknown>[])
}

export async function getExtractionFieldMap(submissionId: number) {
  return await api.extraction.fieldMap(submissionId)
}

export interface DocRecognitionRow { label: string; value: string }

export async function getDocRecognition(submissionId: number): Promise<DocRecognitionRow[]> {
  const raw = await api.extraction.docRecognition(submissionId)
  return toDocRecList(raw)
}

function toDocRecList(r: DocRecognition): DocRecognitionRow[] {
  return [
    { label: 'Document',          value: r.document },
    { label: 'Format',            value: r.format },
    { label: 'Tables identified', value: r.tablesIdentified ?? '1 borrowing-base table' },
    { label: 'Table location',    value: r.tableLocation ?? '—' },
    { label: 'Header row',        value: r.headerInfo },
    { label: 'LP rows extracted', value: String(r.totalRows) },
  ]
}

export interface UnrecognizedColumn { extracted: string; reason: string }

export async function getUnrecognizedColumns(submissionId: number): Promise<UnrecognizedColumn[]> {
  const cols = await api.extraction.unrecognizedColumns(submissionId)
  return cols.map(c => ({ extracted: c, reason: 'Not matched to any canonical field' }))
}

export async function getAllCanonicalFields() {
  return await api.fieldMapping.canonicalFields()
}
