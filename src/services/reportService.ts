import { utils, writeFile } from 'xlsx'

import {
  api,
  type AgentBankExposureRow,
  type CollateralReport,
  type EARDataPoint,
  type RecordReportRequest,
  type ReportHistoryEntry,
} from './api'
import { fmtDeltaPct, fmtPct } from '../utils/execSummary'
import type { BBBreach, BreachType } from '../types/bb'

const USD0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
export const formatUsdMillions = (millions: number): string => {
  const dollars = millions * 1_000_000
  return USD0.format(Math.round(dollars) === 0 ? 0 : dollars)
}
export const formatSignedUsdMillions = (millions: number): string => {
  const formatted = formatUsdMillions(Math.abs(millions))
  return formatted === '$0' ? formatted : `${millions > 0 ? '+' : '-'}${formatted}`
}
export function formatUsdAmount(value: string | null | undefined): string {
  if (value == null) return '—'
  const cleaned = value.trim().replace(/[$,]/g, '')
  if (!cleaned) return '—'
  const match = cleaned.match(/^(-?[\d.]+)\s*([KMB])?$/i)
  if (!match) return value
  const scale = ({ K: 1_000, M: 1_000_000, B: 1_000_000_000 } as Record<string, number>)[(match[2] ?? '').toUpperCase()] ?? 1
  const dollars = Number(match[1]) * scale
  return USD0.format(Math.round(dollars) === 0 ? 0 : dollars)
}

// ── API wrappers ──────────────────────────────────────────────────────────────

export const getCollateralReport = (facilityId: number, snapshotId?: number): Promise<CollateralReport> =>
  api.reports.collateral(facilityId, snapshotId)

export async function downloadCollateralPdf(facilityId: number, facilityName: string,
                                            params: Record<string, string | number | undefined>): Promise<void> {
  const blob = await api.reports.collateralPdf(facilityId, params)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `bb-certificate-${facilityName.replace(/\s+/g, '-').toLowerCase()}.pdf`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export const getEarTrend = (facilityId: number): Promise<EARDataPoint[]> =>
  api.reports.ear(facilityId)

export const getAgentBankExposure = (): Promise<AgentBankExposureRow[]> =>
  api.reports.agentBanks()

export const getConcentrationBreaches = (facilityId: number): Promise<BBBreach[]> =>
  api.reports.concentration(facilityId).then(r => r.breaches ?? [])

export const getReportHistory = (): Promise<ReportHistoryEntry[]> =>
  api.reports.history()

export const recordReport = (body: RecordReportRequest): Promise<ReportHistoryEntry> =>
  api.reports.recordHistory(body)

// ── Certificate view model ────────────────────────────────────────────────────

export interface CertRow {
  metric: string
  ubs:    string
  agent:  string
  cls:    '' | 'total' | 'delta'
}

/** The 6 certificate summary metrics (UBS vs Agent), from a persisted snapshot's numeric
 *  summary. Eligible uncalled capital is the same base for both BB calculations. */
export function buildCertRows(r: CollateralReport): CertRow[] {
  const s = r.summary
  return [
    { metric: 'Total Eligible Uncalled Capital', ubs: formatUsdMillions(r.totalEligibleUncalledM), agent: formatUsdMillions(r.totalEligibleUncalledM), cls: 'total' },
    { metric: 'Included LP Count',               ubs: String(s.includedCount),        agent: String(s.includedCount),        cls: ''      },
    { metric: 'Total Borrowing Base',            ubs: formatUsdMillions(s.totalUBB),  agent: formatUsdMillions(s.totalABB),  cls: 'total' },
    { metric: 'Effective Advance Rate (EAR)',    ubs: fmtPct(s.ear),                  agent: fmtPct(s.agentEar),             cls: ''      },
    { metric: 'UBS BB Delta',                    ubs: formatSignedUsdMillions(s.bbDelta), agent: '',                          cls: 'delta' },
    { metric: 'UBS EAR Delta',                   ubs: fmtDeltaPct(s.earDelta),        agent: '',                             cls: 'delta' },
  ]
}

export interface CertClassRow {
  cls:  string
  n:    number
  uc:   string
  ubb:  string
  rate: string
}

export function buildCertClassRows(r: CollateralReport): CertClassRow[] {
  return r.classBreakdown.map(row => ({
    cls:  row.cls,
    n:    row.count,
    uc:   row.uncalledM > 0 ? formatUsdMillions(row.uncalledM) : '-',
    ubb:  row.ubbM > 0 ? formatUsdMillions(row.ubbM) : '-',
    rate: row.rate,
  }))
}

// ── Formatting for the other report previews ──────────────────────────────────

export function formatReportTimestamp(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export interface EarTrendRow { date: string; ear: string; agentEar: string; delta: string }

export function buildEarTrendRows(points: EARDataPoint[]): EarTrendRow[] {
  return points.map(p => ({
    date:     formatReportTimestamp(p.calculatedAt),
    ear:      fmtPct(p.ear),
    agentEar: fmtPct(p.agentEar),
    delta:    fmtDeltaPct(p.earDelta),
  }))
}

export interface AgentBankDisplayRow {
  agentBank: string; facilities: number; lps: number
  ubsBB: string; agentBB: string; delta: string
}

export function buildAgentBankRows(rows: AgentBankExposureRow[]): AgentBankDisplayRow[] {
  return rows.map(r => ({
    agentBank:  r.agentBank,
    facilities: r.facilityCount,
    lps:        r.lpCount,
    ubsBB:      formatUsdMillions(r.ubsBBM),
    agentBB:    formatUsdMillions(r.agentBBM),
    delta:      formatUsdMillions(r.deltaM),
  }))
}

// ── Concentration test ↔ breach type mapping ──────────────────────────────────

/** Maps a configured concentration-test label to the engine's breach type. */
export function breachTypeForTest(label: string): BreachType | null {
  if (label.includes('single-lp')) return 'single-lp'
  if (label.includes('Top-10'))    return 'top10'
  if (label.includes('Unrated'))   return 'unrated'
  if (label.includes('Non-US'))    return 'non-us'
  return null
}

export function filterBreachesByTests(breaches: BBBreach[], selectedTests: string[]): BBBreach[] {
  const types = new Set(selectedTests.map(breachTypeForTest).filter(t => t !== null))
  return breaches.filter(b => types.has(b.type))
}

export const BREACH_TYPE_LABEL: Record<BreachType, string> = {
  'single-lp': 'single-lp limit',
  'top10':     'Top-10 concentration',
  'unrated':   'Unrated aggregate',
  'non-us':    'Non-US aggregate',
}

export interface BreachDisplayRow {
  facility: string; test: string; severity: string; message: string; value: string; limit: string
}

/** Flattens per-facility breach lists into display rows, keeping only the selected tests. */
export function buildBreachRows(
  perFacility: Array<{ facility: string; breaches: BBBreach[] }>,
  selectedTests: string[],
): BreachDisplayRow[] {
  return perFacility.flatMap(({ facility, breaches }) =>
    filterBreachesByTests(breaches, selectedTests).map(b => ({
      facility,
      test:     BREACH_TYPE_LABEL[b.type] ?? b.type,
      severity: b.severity,
      message:  b.message,
      value:    fmtPct(b.value),
      limit:    fmtPct(b.limit),
    })))
}

// ── Report history view model ─────────────────────────────────────────────────

export interface ReportHistoryRow {
  report: string; facility: string; snap: string; fmt: string; user: string; when: string
}

export function buildHistoryRows(entries: ReportHistoryEntry[]): ReportHistoryRow[] {
  return entries.map(e => ({
    report:   e.report,
    facility: e.facilityName ?? 'All Facilities',
    snap:     e.snapshotLabel ?? '—',
    fmt:      (e.format ?? '—').replaceAll('XLSX', 'Excel'),
    user:     e.userName ?? '—',
    when:     formatReportTimestamp(e.createdAt),
  }))
}

// ── XLSX export ───────────────────────────────────────────────────────────────

export interface XlsxSheet { name: string; rows: Array<Record<string, string | number>> }

const NEGATIVE_FONT = { color: { rgb: 'FFB91C1C' } }
const POSITIVE_FONT = { color: { rgb: 'FF15803D' } }
const CERT_DELTA_METRICS = new Set(['UBS BB Delta', 'UBS EAR Delta'])

/** True when a scalar display value represents a negative amount/ratio. */
export function isNegativeDisplayValue(value: string | number | null | undefined): boolean {
  if (value == null) return false
  if (typeof value === 'number') return value < 0
  const s = value.trim()
  if (!s) return false
  return s.startsWith('-') || /^\(.*\)$/.test(s)
}

/** True when a scalar display value represents a positive amount/ratio. */
export function isPositiveDisplayValue(value: string | number | null | undefined): boolean {
  if (value == null) return false
  if (typeof value === 'number') return value > 0
  const s = value.trim()
  if (!s) return false
  return s.startsWith('+')
}

function styleNegativeCells(sheet: unknown): void {
  const ws = sheet as Record<string, unknown> & { '!ref'?: string }
  if (!ws['!ref']) return
  const range = utils.decode_range(ws['!ref'])
  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      // Skip header row; row 0 comes from json_to_sheet keys.
      if (row === 0) continue
      const addr = utils.encode_cell({ r: row, c: col })
      const cell = ws[addr] as { v?: string | number; s?: Record<string, unknown> } | undefined
      if (!cell || !isNegativeDisplayValue(cell.v)) continue
      cell.s = {
        ...(cell.s ?? {}),
        font: {
          ...(((cell.s ?? {}) as { font?: Record<string, unknown> }).font ?? {}),
          ...NEGATIVE_FONT,
        },
      }
    }
  }
}

function stylePositiveCertDeltaCells(
  sheet: unknown,
  rows: Array<Record<string, string | number>>,
): void {
  const ws = sheet as Record<string, unknown> & { '!ref'?: string }
  if (!ws['!ref']) return

  // Applies only to certificate summary rows exported with these keys.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!CERT_DELTA_METRICS.has(String(row['Metric'] ?? ''))) continue
    const ubs = row['UBS (BUSA)']
    if (!isPositiveDisplayValue(ubs)) continue

    const addr = utils.encode_cell({ r: i + 1, c: 1 }) // Data row offset + UBS column index.
    const cell = ws[addr] as { s?: Record<string, unknown> } | undefined
    if (!cell) continue
    cell.s = {
      ...(cell.s ?? {}),
      font: {
        ...(((cell.s ?? {}) as { font?: Record<string, unknown> }).font ?? {}),
        ...POSITIVE_FONT,
      },
    }
  }
}

/** Builds a workbook from the given sheets and triggers a browser download. */
export function exportXlsx(filename: string, sheets: XlsxSheet[]): void {
  const wb = utils.book_new()
  for (const sheet of sheets) {
    const ws = utils.json_to_sheet(sheet.rows)
    styleNegativeCells(ws)
    stylePositiveCertDeltaCells(ws, sheet.rows)
    utils.book_append_sheet(wb, ws, sheet.name)
  }
  writeFile(wb, filename, { cellStyles: true })
}
