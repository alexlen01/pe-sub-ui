import { api, type DocRecognition } from './api'
import { formatPercentageFraction, formatPercentageText } from '../utils/percentage'

function parseMoney(s: string): number {
  const cleaned = (s || '').replace(/[$,]/g, '')
  const m = cleaned.match(/^([0-9.]+)([BMTKbmtk]?)$/)
  if (!m) return 0
  const mult: Record<string, number> = { B: 1e9, M: 1e6, T: 1e12, K: 1e3, '': 1 }
  return parseFloat(m[1]) * (mult[m[2].toUpperCase()] ?? 1)
}

function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function formatPct(n: number): string {
  return formatPercentageFraction(n)
}

function enrichBBFields(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const withRaw: Array<Record<string, unknown> & { agentBBRaw: number; eligibleCommitmentRaw: number }> = rows.map(r => {
    const rate = parseFloat((r.agentAdvanceRate as string || '').replace('%', '')) / 100 || 0
    const agentBBRaw =
      typeof r.agentBBRaw === 'number'
        ? r.agentBBRaw
        : parseMoney(r.agentBBFmt as string) || Math.round(parseMoney(r.uncalled as string) * rate)
    const eligibleCommitmentRaw =
      parseMoney(r.eligibleCommitmentFmt as string) ||
      parseMoney(r.eligibleCommitment as string) ||
      (rate && agentBBRaw ? Math.round(agentBBRaw / rate) : parseMoney(r.uncalled as string))
    return { ...r, agentBBRaw, eligibleCommitmentRaw }
  })
  const totalUncalled = withRaw.reduce((s, r) => s + parseMoney(r.uncalled as string), 0)
  const totalEligible = withRaw.reduce((s, r) => s + ((r.eligibleCommitmentRaw as number) || 0), 0)
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
      ? formatPercentageText(r.pctCalledFmt, '')
      : (c && uncalledStr.trim() ? formatPercentageFraction(Math.max(0, (c - u) / c), '') : '')
    const bb = (r.agentBBRaw as number) || 0
    const eligible = (r.eligibleCommitmentRaw as number) || 0
    const excess = Math.max(0, u - eligible)
    // Agent BB % ("% of Borrowing Base") is each LP's share of the facility borrowing
    // base = its BB contribution ÷ total BB. When the Agent BB file maps a Borrowing Base
    // column but no BB-% column, we derive it here and flag it so the extraction review
    // grid can highlight the cell and message that the value was calculated, not extracted.
    // The API serializes absent columns as "" (not null), so treat blank as not-provided.
    const bbProvided     = String(r.agentBBFmt ?? '').trim() !== ''
    const pctBBProvided  = String(r.pctBBFmt ?? '').trim() !== ''
    const computedPctBB  = totalBB && bb ? formatPct(bb / totalBB) : ''
    const pctBBCalculated = bbProvided && !pctBBProvided && computedPctBB !== ''
    return {
      ...r,
      pctCalledFmt,
      pctUnfundedFmt: r.pctUnfundedFmt != null ? formatPercentageText(r.pctUnfundedFmt, '') : (totalUncalled && u ? formatPct(u / totalUncalled) : ''),
      pctEligibleUnfundedFmt: r.pctEligibleUnfundedFmt != null ? formatPercentageText(r.pctEligibleUnfundedFmt, '') : (totalEligible && eligible ? formatPct(eligible / totalEligible) : ''),
      excessConcFmt: r.excessConcFmt ?? (u ? formatMoney(excess) : ''),
      eligibleCommitmentFmt: r.eligibleCommitmentFmt ?? (eligible ? formatMoney(eligible) : ''),
      agentBBFmt: r.agentBBFmt ?? (bb ? formatMoney(bb) : ''),
      // Only the BB-mapped-without-BB% case changes; every other row keeps its prior value.
      pctBBFmt:   pctBBCalculated ? computedPctBB : (r.pctBBFmt != null ? formatPercentageText(r.pctBBFmt, '') : computedPctBB),
      pctBBCalculated,
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
    ...(r.forcedTemplate ? [{ label: 'Forced format', value: r.forcedTemplate }] : []),
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
