import { utils, writeFile } from 'xlsx'

import {
  api,
  type AgentBankExposureRow,
  type CollateralReport,
  type EARDataPoint,
  type RecordReportRequest,
  type ReportHistoryEntry,
} from './api'
import { fmtDeltaM, fmtDeltaPct, fmtM, fmtPct } from '../utils/execSummary'
import type { BBBreach, BreachType } from '../types/bb'

// ── API wrappers ──────────────────────────────────────────────────────────────

export const getCollateralReport = (facilityId: number, snapshotId?: number): Promise<CollateralReport> =>
  api.reports.collateral(facilityId, snapshotId)

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
    { metric: 'Total Eligible Uncalled Capital', ubs: fmtM(r.totalEligibleUncalledM), agent: fmtM(r.totalEligibleUncalledM), cls: 'total' },
    { metric: 'Included LP Count',               ubs: String(s.includedCount),        agent: String(s.includedCount),        cls: ''      },
    { metric: 'Total Borrowing Base',            ubs: fmtM(s.totalUBB),               agent: fmtM(s.totalABB),               cls: 'total' },
    { metric: 'Effective Advance Rate (EAR)',    ubs: fmtPct(s.ear),                  agent: fmtPct(s.agentEar),             cls: ''      },
    { metric: 'UBS BB Delta',                    ubs: fmtDeltaM(s.bbDelta),           agent: '',                             cls: 'delta' },
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
    uc:   row.uncalledM > 0 ? fmtM(row.uncalledM) : '-',
    ubb:  row.ubbM > 0 ? fmtM(row.ubbM) : '-',
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
    ubsBB:      fmtM(r.ubsBBM),
    agentBB:    fmtM(r.agentBBM),
    delta:      fmtDeltaM(r.deltaM),
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
    fmt:      e.format ?? '—',
    user:     e.userName ?? '—',
    when:     formatReportTimestamp(e.createdAt),
  }))
}

// ── XLSX export ───────────────────────────────────────────────────────────────

export interface XlsxSheet { name: string; rows: Array<Record<string, string | number>> }

/** Builds a workbook from the given sheets and triggers a browser download. */
export function exportXlsx(filename: string, sheets: XlsxSheet[]): void {
  const wb = utils.book_new()
  for (const sheet of sheets) {
    utils.book_append_sheet(wb, utils.json_to_sheet(sheet.rows), sheet.name)
  }
  writeFile(wb, filename)
}
