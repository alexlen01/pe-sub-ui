import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { SortableHeader, useSortableRows, type SortSpec } from '../../hooks/useTableSort'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DraggablePanel from '../../components/ui/DraggablePanel'
import { formatRegion } from '../../config/regionReference'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { fmtM, fmtPct, getFacilityBBSnapshot, getFacilitySummaryExt, parseM } from '../../services/bbCalculationService'
import { getLPsForFacility } from '../../services/lpService'
import { getFacilities } from '../../services/facilityService'
import InfoTip from '../../components/ui/InfoTip'
import type { LPRecord } from '../../services/lpService'
import type { BBSummaryExt } from '../../services/bbCalculationService'
import { api } from '../../services/api'
import type { LpClassificationRequest, Submission } from '../../services/api'
import { BREACH_TYPE_LABEL } from '../../services/reportService'
import type { BBBreach, BBSummary, ComputedLP } from '../../types/bb'
import { busaClassificationOptions, getClassificationConfig, type ClassificationConfig } from '../../services/configService'
import {
  YesNo,
  calcRow, fmtFull, parseMoneyM, parsePct, pctFromFraction, pctStr,
  type Override, type SubmissionLP,
} from '../RunShadowBB'
import { lpSizeFormat } from '../../utils/lpSize'
import { useColumnResize, type ColWidths } from '../../hooks/useColumnResize'
import LPRecordPanel from '../../components/ui/LPRecordPanel'
import Tag from '../../components/ui/Tag'
import { advanceRateGroupLabel } from '../../utils/advanceRateFloorMap'
import { formatPercentageFraction, formatPercentageText, formatPercentageValue } from '../../utils/percentage'

// Maps the snapshot's persisted breaches (server verdict against the Concentration Limits
// config) to the rows of the breach table shown above the LP table.
export function toBreachDisplayRows(breaches: BBBreach[]) {
  return breaches.map(b => ({
    severity: b.severity,
    rule:     BREACH_TYPE_LABEL[b.type] ?? b.type,
    detail:   b.message,
    current:  fmtPct(b.value),
    limit:    fmtPct(b.limit),
  }))
}

function fmtMoneyM(m: number | null | undefined, full = false): string {
  if (m == null) return '—'
  if (full) return '$' + Math.round(m * 1e6).toLocaleString('en-US')
  return '$' + Math.round(m).toLocaleString('en-US') + 'M'
}

function fullDollar(m: number | null | undefined): number {
  return m == null ? 0 : Math.round(m * 1e6)
}

const BLUE_HD: React.CSSProperties = { background: '#0F2560', color: '#fff', padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase' }
const COL_HD: React.CSSProperties  = { padding: '7px 10px', color: 'var(--muted)', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', borderBottom: '1px solid var(--border)', background: 'var(--tbl)' }
const CELL: React.CSSProperties    = { padding: '3px 10px', color: 'var(--text)', fontSize: 11 }

/* Keys are the column's sortKey — `SortableHeader` reports resizes under that name, so a width
   parked under any other key is dead: the header renders with no width at all and
   `table-layout: fixed` hands it an even slice of whatever the sized columns left over.
   Every width is also floored at its own header label's rendered width (11px bold Segoe UI in
   `.data-table.dense`) plus the 18px side padding and the 13px sort indicator, so no label is
   ever ellipsis-truncated at the default sizing. */
const SHADOW_RESULTS_INITIAL_WIDTHS: ColWidths = {
  rank: 64, name: 220, parent: 160, spv: 54,
  region: 140, investorType: 140, institutionalOrHnw: 152, agentLpCategory: 166, cls: 174,
  included: 72, ig: 126, sp: 76, mdy: 84, fitch: 76,
  lpSizeCriteria: 107, lpSizeBil: 134, capitalCommitment: 146, cmtPct: 172,
  calledM: 106, ucM: 117, pctOfFundUncalled: 144, pctLpCalled: 107,
  agentRatePct: 139, ubsAdvRatePct: 128, agentConcLimitPct: 171,
  concLimitPct: 160, agentExcess: 177, ubsExcess: 167,
  agentBBCalc: 149, pctAgentBB: 110, ubsBBCalc: 139, pctUbsBB: 110, notes: 180,
}

function ShadowResultsTableHead({ sort, onSort, widths, onResizeStart }: {
  sort: SortSpec | null
  onSort: (key: string) => void
  widths?: ColWidths
  onResizeStart?: (col: string, e: React.MouseEvent) => void
}) {
  const w = (key: keyof typeof SHADOW_RESULTS_INITIAL_WIDTHS) => widths?.[key] ?? SHADOW_RESULTS_INITIAL_WIDTHS[key]
  return (
    <thead>
      <tr>
        <SortableHeader sortKey="rank"              sort={sort} onSort={onSort} className="num" style={{ width: w('rank') }}                  onResizeStart={onResizeStart}>Rank</SortableHeader>
        <SortableHeader sortKey="name"              sort={sort} onSort={onSort} style={{ width: w('name') }}                          onResizeStart={onResizeStart}>Investor Name</SortableHeader>
        <SortableHeader sortKey="parent"            sort={sort} onSort={onSort} style={{ width: w('parent') }}                        onResizeStart={onResizeStart}>Parent</SortableHeader>
        <SortableHeader sortKey="spv"               sort={sort} onSort={onSort} style={{ width: w('spv') }}                           onResizeStart={onResizeStart}>SPV</SortableHeader>
        <SortableHeader sortKey="region"            sort={sort} onSort={onSort} style={{ width: w('region') }}                        onResizeStart={onResizeStart}>Region / Location</SortableHeader>
        <SortableHeader sortKey="investorType"      sort={sort} onSort={onSort} style={{ width: w('investorType') }}                  onResizeStart={onResizeStart}>Investor Type</SortableHeader>
        <SortableHeader sortKey="institutionalOrHnw"         sort={sort} onSort={onSort} style={{ width: w('institutionalOrHnw') }}                     onResizeStart={onResizeStart}>Institutional vs HNW</SortableHeader>
        <SortableHeader sortKey="agentLpCategory"          sort={sort} onSort={onSort} style={{ width: w('agentLpCategory') }}                      onResizeStart={onResizeStart}>Agent LP Classification</SortableHeader>
        <SortableHeader sortKey="cls"               sort={sort} onSort={onSort} style={{ width: w('cls') }}                           onResizeStart={onResizeStart}>UBS LP Classification</SortableHeader>
        <SortableHeader sortKey="included"          sort={sort} onSort={onSort} style={{ width: w('included'), textAlign: 'center' }} onResizeStart={onResizeStart}>Eligible</SortableHeader>
        <SortableHeader sortKey="ig"                sort={sort} onSort={onSort} style={{ width: w('ig') }}                            onResizeStart={onResizeStart}>Investment Grade</SortableHeader>
        <SortableHeader sortKey="sp"                sort={sort} onSort={onSort} style={{ width: w('sp') }}                            onResizeStart={onResizeStart}>S&amp;P</SortableHeader>
        <SortableHeader sortKey="mdy"               sort={sort} onSort={onSort} style={{ width: w('mdy') }}                           onResizeStart={onResizeStart}>Moody's</SortableHeader>
        <SortableHeader sortKey="fitch"             sort={sort} onSort={onSort} style={{ width: w('fitch') }}                         onResizeStart={onResizeStart}>Fitch</SortableHeader>
        <SortableHeader sortKey="lpSizeCriteria"    sort={sort} onSort={onSort} style={{ width: w('lpSizeCriteria') }}                onResizeStart={onResizeStart}>Size Measure</SortableHeader>
        <SortableHeader sortKey="lpSizeBil"         sort={sort} onSort={onSort} className="num" style={{ width: w('lpSizeBil') }}     onResizeStart={onResizeStart}>LP Size</SortableHeader>
        <SortableHeader sortKey="capitalCommitment"         sort={sort} onSort={onSort} className="num" style={{ width: w('capitalCommitment') }}     onResizeStart={onResizeStart}>Capital Commitments</SortableHeader>
        <SortableHeader sortKey="cmtPct"            sort={sort} onSort={onSort} className="num" style={{ width: w('cmtPct') }}        onResizeStart={onResizeStart}>% of Capital Commitments</SortableHeader>
        <SortableHeader sortKey="calledM"           sort={sort} onSort={onSort} className="num" style={{ width: w('calledM') }}       onResizeStart={onResizeStart}>Called Capital</SortableHeader>
        <SortableHeader sortKey="ucM"               sort={sort} onSort={onSort} className="num" style={{ width: w('ucM') }}           onResizeStart={onResizeStart}>Uncalled Capital</SortableHeader>
        <SortableHeader sortKey="pctOfFundUncalled"       sort={sort} onSort={onSort} className="num" style={{ width: w('pctOfFundUncalled') }}   onResizeStart={onResizeStart}>% of Uncalled Capital</SortableHeader>
        <SortableHeader sortKey="pctLpCalled"         sort={sort} onSort={onSort} className="num" style={{ width: w('pctLpCalled') }}     onResizeStart={onResizeStart}>% of LP Called</SortableHeader>
        <SortableHeader sortKey="agentRatePct"      sort={sort} onSort={onSort} className="num" style={{ width: w('agentRatePct') }}  onResizeStart={onResizeStart}>Agent Advance Rate</SortableHeader>
        <SortableHeader sortKey="ubsAdvRatePct"     sort={sort} onSort={onSort} className="num" style={{ width: w('ubsAdvRatePct') }} onResizeStart={onResizeStart}>UBS Advance Rate</SortableHeader>
        <SortableHeader sortKey="agentConcLimitPct" sort={sort} onSort={onSort} className="num" style={{ width: w('agentConcLimitPct') }} onResizeStart={onResizeStart}>Agent Concentration Limit</SortableHeader>
        <SortableHeader sortKey="concLimitPct"      sort={sort} onSort={onSort} className="num" style={{ width: w('concLimitPct') }}  onResizeStart={onResizeStart}>UBS Concentration Limit</SortableHeader>
        <SortableHeader sortKey="agentExcess"       sort={sort} onSort={onSort} className="num" style={{ width: w('agentExcess') }}   onResizeStart={onResizeStart}>Agent Excess Concentration</SortableHeader>
        <SortableHeader sortKey="ubsExcess"         sort={sort} onSort={onSort} className="num" style={{ width: w('ubsExcess') }}     onResizeStart={onResizeStart}>UBS Excess Concentration</SortableHeader>
        <SortableHeader sortKey="agentBBCalc"       sort={sort} onSort={onSort} className="num" style={{ width: w('agentBBCalc') }}   onResizeStart={onResizeStart}>Agent Borrowing Base</SortableHeader>
        <SortableHeader sortKey="pctAgentBB"        sort={sort} onSort={onSort} className="num" style={{ width: w('pctAgentBB') }}    onResizeStart={onResizeStart}>% of Agent BB</SortableHeader>
        <SortableHeader sortKey="ubsBBCalc"         sort={sort} onSort={onSort} className="num" style={{ width: w('ubsBBCalc') }}     onResizeStart={onResizeStart}>UBS Borrowing Base</SortableHeader>
        <SortableHeader sortKey="pctUbsBB"          sort={sort} onSort={onSort} className="num" style={{ width: w('pctUbsBB') }}      onResizeStart={onResizeStart}>% of UBS BB</SortableHeader>
        <SortableHeader sortKey="notes"             sort={sort} onSort={onSort} style={{ width: w('notes') }}                         onResizeStart={onResizeStart}>Notes</SortableHeader>
      </tr>
    </thead>
  )
}

type KVHighlight = 'agent' | 'ubs-rate'
interface KVRow { k: string; v: string; bold?: boolean; hl?: KVHighlight }
interface BkRow { rate?: string; label?: string; count: number; dollars: number; pct: number }

const DEFAULT_BUSA_RATES = ['90%', '75%', '65%', '50%', '0%']
const DEFAULT_AGENT_RATES = ['90%', '75%', '65%', '50%', '0%']

function rateOrderValue(rate: string): number {
  const n = parseFloat(rate.replace('%', ''))
  return Number.isFinite(n) ? n : -1
}

function normalizeRateLabel(raw: string | undefined | null): string {
  return formatPercentageText(raw, '')
}

function uniqueRatesFromMap(map: Record<string, string> | undefined, fallback: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of Object.values(map ?? {})) {
    const rate = normalizeRateLabel(raw)
    const key = rate.toLowerCase()
    if (!rate || seen.has(key)) continue
    seen.add(key)
    out.push(rate)
  }
  return (out.length > 0 ? out : fallback.map(normalizeRateLabel)).sort((a, b) => rateOrderValue(b) - rateOrderValue(a))
}

function completeRateBreakdown(rows: BkRow[] | undefined, rates: string[]): Array<BkRow & { rate: string }> {
  const byRate = new Map<string, BkRow & { rate: string }>()
  const normalizedRates = rates.map(normalizeRateLabel)
  const scheduled = new Set(normalizedRates.map(rate => rate.toLowerCase()))
  const extraRates: string[] = []
  for (const row of rows ?? []) {
    const rate = normalizeRateLabel(row.rate ?? row.label)
    if (!rate) continue
    const key = rate.toLowerCase()
    const existing = byRate.get(key)
    if (existing) {
      existing.count += row.count
      existing.dollars += row.dollars
      existing.pct += row.pct
    } else {
      byRate.set(key, { ...row, rate })
    }
    if (!scheduled.has(key)) extraRates.push(rate)
  }
  const extras = [...new Set(extraRates)].sort((a, b) => rateOrderValue(b) - rateOrderValue(a))
  return [...normalizedRates, ...extras].map(rate => byRate.get(rate.toLowerCase()) ?? { rate, count: 0, dollars: 0, pct: 0 })
}

function SummaryKVTable({ title, rows }: { title: string; rows: KVRow[] }) {
  const highlightStyle = (hl?: KVHighlight) => {
    if (hl === 'agent') return { rowBg: '#fffbe6', valueColor: '#7c6200' }
    if (hl === 'ubs-rate') return { rowBg: '#eaf4ff', valueColor: '#0b4f8a' }
    return { rowBg: undefined, valueColor: undefined }
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><th colSpan={2} style={BLUE_HD}>{title}</th></tr></thead>
      <tbody>
        {rows.map(({ k, v, bold, hl }) => {
          const style = highlightStyle(hl)
          return (
          <tr key={k} style={{ borderBottom: '1px solid var(--border)', background: style.rowBg }}>
            <td style={{ ...CELL, color: bold ? 'var(--text)' : 'var(--muted)', fontWeight: bold ? 700 : 400, whiteSpace: 'nowrap' }}>{k}</td>
            <td style={{ ...CELL, textAlign: 'right', fontWeight: bold ? 700 : 400, color: style.valueColor ?? (bold ? 'var(--text)' : 'var(--muted)'), whiteSpace: 'nowrap' }}>{v}</td>
          </tr>
        )})}
      </tbody>
    </table>
  )
}

function SummaryBreakTable({ title, rows, full, labelHeader = 'Rate' }: { title: string; rows: BkRow[]; full: boolean; labelHeader?: string }) {
  const totalCount   = rows.reduce((s, r) => s + r.count, 0)
  const totalDollars = rows.reduce((s, r) => s + r.dollars, 0)
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr><th colSpan={4} style={BLUE_HD}>{title}</th></tr>
        <tr><th style={{ ...COL_HD, textAlign: 'left' }}>{labelHeader}</th><th style={{ ...COL_HD, textAlign: 'right' }}>#</th><th style={{ ...COL_HD, textAlign: 'right' }}>$</th><th style={{ ...COL_HD, textAlign: 'right' }}>%</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ ...CELL, color: 'var(--muted)' }}>{r.rate ?? r.label}</td>
            <td style={{ ...CELL, textAlign: 'right', color: 'var(--muted)' }}>{r.count.toLocaleString()}</td>
            <td style={{ ...CELL, textAlign: 'right' }}>{fmtMoneyM(r.dollars, full)}</td>
            <td style={{ ...CELL, textAlign: 'right', color: 'var(--muted)' }}>{formatPercentageFraction(r.pct)}</td>
          </tr>
        ))}
        <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
          <td style={CELL}></td>
          <td style={{ ...CELL, textAlign: 'right' }}>{totalCount.toLocaleString()}</td>
          <td style={{ ...CELL, textAlign: 'right' }}>{fmtMoneyM(totalDollars, full)}</td>
          <td style={{ ...CELL, textAlign: 'right' }}>{totalDollars > 0 ? '100%' : '—'}</td>
        </tr>
      </tbody>
    </table>
  )
}

// ── Excel export ─────────────────────────────────────────────────────────────
// The workbook is a copy of the screen: the four summary tables side by side across the
// top, then the LP-level Shadow BB grid — every column of the on-screen table — beneath
// them. Fills and text colours are the UI's own (navy section bars, the agent / UBS-rate
// highlight rows, the grey column headers and zebra striping of the data table).

const XL = {
  navyBar:   'FF0F2560', // BLUE_HD section bar
  white:     'FFFFFFFF',
  headerBg:  'FFF0F0F0', // --tbl (COL_HD / .data-table th)
  headerFg:  'FF4F4F4F', // --navy
  border:    'FFD8D8D8', // --border
  text:      'FF000000', // --text
  muted:     'FF767676', // --muted (also .data-table .zero)
  danger:    'FFB91C1C', // --danger (unclassified LP)
  zebra:     'FFFAFAFA', // .data-table tr:nth-child(even)
  yesBg:     'FFE6F4EA', // YesNo pill — eligible
  yesFg:     'FF007A38', // --green
  agentBg:   'FFFFFBE6', // KVRow hl 'agent'
  agentFg:   'FF7C6200',
  ubsRateBg: 'FFEAF4FF', // KVRow hl 'ubs-rate'
  ubsRateFg: 'FF0B4F8A',
} as const

const MONEY_FMT = '[$$-409]#,##0;[Red]-[$$-409]#,##0'
const PCT_FMT   = '0.0%'
const INT_FMT   = '#,##0'
const EM_DASH   = '—'

type XlCell = string | number | null
type XlWorksheet = import('exceljs').Worksheet
/** Inclusive worksheet column range a summary field occupies. */
type Span = [number, number]

const fillOf = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
const fontOf = (opts: { bold?: boolean; color?: string; size?: number } = {}) => ({
  name: 'Calibri', size: opts.size ?? 10, bold: opts.bold ?? false, color: { argb: opts.color ?? XL.text },
})
const thinEdge    = { style: 'thin' as const, color: { argb: XL.border } }
/** The navy rule that outlines a summary table, picking up its title bar. */
const outlineEdge = { style: 'medium' as const, color: { argb: XL.navyBar } }
/** The 2px rule above a breakdown table's totals row. */
const ruleEdge    = { style: 'medium' as const, color: { argb: XL.border } }
const boxBorder   = { top: thinEdge, left: thinEdge, bottom: thinEdge, right: thinEdge }

interface SummaryRow {
  cells: XlCell[]
  fmts?: (string | undefined)[]
  bold?: boolean
  fill?: string
  /** Applied to the value cells only — the label keeps its own colour, as on screen. */
  valueColor?: string
  /** The 2px rule above a breakdown total row. */
  topRule?: boolean
}

interface SummaryTable {
  title: string
  /** Column span of each field, left to right. The table occupies spans[0][0]..spans.at(-1)[1]. */
  spans: Span[]
  /** Column-header row — breakdown tables only; the key/value tables have none. */
  header?: string[]
  rows: SummaryRow[]
}

/** One row of the exported grid: the values the on-screen cells render (live preview for
 *  edited rows, frozen snapshot otherwise). Money in $millions, percentages as fractions;
 *  null is a cell the screen shows as an em dash. */
export interface ShadowExportRow {
  rank: number | null
  investorName: string
  parent: string
  spv: string
  region: string
  investorType: string
  institutionalOrHnw: string
  agentLpCategory: string
  ubsLpCategory: string
  unclassified: boolean
  eligible: boolean
  investmentGrade: string
  spRating: string
  moodysRating: string
  fitchRating: string
  lpSizeCriteria: string
  lpSize: string
  capitalCommitmentM: number | null
  cmtPct: number
  calledM: number
  ucM: number | null
  pctOfFundUncalled: number
  pctLpCalled: number
  agentRate: number | null
  ubsAdvRate: number | null
  agentConcLimit: number | null
  ubsConcLimit: number | null
  agentExcessM: number
  ubsExcessM: number
  agentBBM: number
  pctAgentBB: number | null
  ubsBBM: number
  pctUbsBB: number | null
  notes: string
}

interface DetailCol {
  header: string
  /** Character width, tracking the on-screen pixel width of the same column. The header
   *  widens it where the label needs more room — see `detailColWidth`. */
  width: number
  align: 'left' | 'right' | 'center'
  numFmt?: string
  value: (r: ShadowExportRow) => XlCell
  /** Zero renders muted on screen (.data-table .zero). */
  mutedZero?: boolean
}

const money = (m: number | null): XlCell => (m == null ? EM_DASH : fullDollar(m))
const pct   = (f: number | null): XlCell => (f == null ? EM_DASH : f)

/** Every column of the on-screen Shadow BB table, in screen order. */
const DETAIL_COLS: DetailCol[] = [
  { header: 'Rank',                       width:  9, align: 'right', numFmt: INT_FMT,   value: r => r.rank ?? EM_DASH },
  // The two name columns run half again as wide as on screen: a spreadsheet has no tooltip
  // to fall back on, and full LP names ("Teacher Retirement System of Texas") outrun 31.
  { header: 'Investor Name',              width: 47, align: 'left',                     value: r => r.investorName },
  { header: 'Parent',                     width: 35, align: 'left',                     value: r => r.parent },
  { header: 'SPV',                        width:  8, align: 'left',                     value: r => r.spv },
  { header: 'Region / Location',          width: 20, align: 'left',                     value: r => r.region },
  { header: 'Investor Type',              width: 20, align: 'left',                     value: r => r.investorType },
  { header: 'Institutional vs HNW',       width: 22, align: 'left',                     value: r => r.institutionalOrHnw },
  { header: 'Agent LP Classification',    width: 24, align: 'left',                     value: r => r.agentLpCategory },
  { header: 'UBS LP Classification',      width: 25, align: 'left',                     value: r => r.ubsLpCategory },
  { header: 'Eligible',                   width: 10, align: 'center',                    value: r => (r.eligible ? 'Yes' : 'No') },
  { header: 'Investment Grade',           width: 16, align: 'left',                     value: r => r.investmentGrade },
  { header: 'S&P',                        width: 11, align: 'left',                     value: r => r.spRating },
  { header: "Moody's",                    width: 12, align: 'left',                     value: r => r.moodysRating },
  { header: 'Fitch',                      width: 11, align: 'left',                     value: r => r.fitchRating },
  { header: 'Size Measure',               width: 15, align: 'left',                     value: r => r.lpSizeCriteria },
  { header: 'LP Size',                    width: 19, align: 'right',                    value: r => r.lpSize },
  { header: 'Capital Commitments',        width: 20, align: 'right', numFmt: MONEY_FMT, value: r => money(r.capitalCommitmentM) },
  { header: '% of Capital Commitments',   width: 22, align: 'right', numFmt: PCT_FMT,   value: r => r.cmtPct },
  { header: 'Called Capital',             width: 15, align: 'right', numFmt: MONEY_FMT, value: r => money(r.calledM) },
  { header: 'Uncalled Capital',           width: 17, align: 'right', numFmt: MONEY_FMT, value: r => money(r.ucM) },
  { header: '% of Uncalled Capital',      width: 18, align: 'right', numFmt: PCT_FMT,   value: r => r.pctOfFundUncalled },
  { header: '% of LP Called',             width: 15, align: 'right', numFmt: PCT_FMT,   value: r => r.pctLpCalled },
  { header: 'Agent Advance Rate',         width: 17, align: 'right', numFmt: PCT_FMT,   value: r => pct(r.agentRate) },
  { header: 'UBS Advance Rate',           width: 16, align: 'right', numFmt: PCT_FMT,   value: r => pct(r.ubsAdvRate) },
  { header: 'Agent Concentration Limit',  width: 23, align: 'right', numFmt: PCT_FMT,   value: r => pct(r.agentConcLimit) },
  { header: 'UBS Concentration Limit',    width: 21, align: 'right', numFmt: PCT_FMT,   value: r => pct(r.ubsConcLimit) },
  { header: 'Agent Excess Concentration', width: 23, align: 'right', numFmt: MONEY_FMT, value: r => money(r.agentExcessM), mutedZero: true },
  { header: 'UBS Excess Concentration',   width: 22, align: 'right', numFmt: MONEY_FMT, value: r => money(r.ubsExcessM),   mutedZero: true },
  { header: 'Agent Borrowing Base',       width: 20, align: 'right', numFmt: MONEY_FMT, value: r => money(r.agentBBM),     mutedZero: true },
  { header: '% of Agent BB',              width: 16, align: 'right', numFmt: PCT_FMT,   value: r => pct(r.pctAgentBB) },
  { header: 'UBS Borrowing Base',         width: 18, align: 'right', numFmt: MONEY_FMT, value: r => money(r.ubsBBM),       mutedZero: true },
  { header: '% of UBS BB',                width: 16, align: 'right', numFmt: PCT_FMT,   value: r => pct(r.pctUbsBB) },
  { header: 'Notes',                      width: 26, align: 'left',                     value: r => r.notes },
]

const UBS_CLS_COL   = DETAIL_COLS.findIndex(c => c.header === 'UBS LP Classification') + 1
const ELIGIBLE_COL  = DETAIL_COLS.findIndex(c => c.header === 'Eligible') + 1

/** Room for the bold header text plus the autofilter button that sits over its right edge. */
const HEADER_SLACK = 4

/** Headers never wrap, so a column is at least as wide as its own label. */
const detailColWidth = (col: DetailCol) => Math.max(col.width, col.header.length + HEADER_SLACK)

/**
 * The four summary tables of the "Portfolio & BB Summary" card, in screen order. Column
 * spans keep them side by side above the grid, separated by the empty gutter columns 4, 8
 * and 13 — the sheet's column widths belong to the LP grid below, so the spans are chosen
 * to give the four tables a near-equal width. Each table's fields carry the same emphasis
 * and highlight colours as their on-screen counterparts.
 */
function buildSummaryTables(ext: BBSummaryExt): SummaryTable[] {
  const kvFmt = (fmt: string) => [undefined, fmt]
  const moneyRow = (k: string, m: number, opts: { bold?: boolean; fill?: string; valueColor?: string } = {}): SummaryRow =>
    ({ cells: [k, fullDollar(m)], fmts: kvFmt(MONEY_FMT), ...opts })
  const pctRow = (k: string, f: number | null, opts: { bold?: boolean; fill?: string; valueColor?: string } = {}): SummaryRow =>
    ({ cells: [k, f ?? EM_DASH], fmts: kvFmt(PCT_FMT), ...opts })

  const breakdownRows = (rows: BkRow[]): SummaryRow[] => {
    const totalCount   = rows.reduce((s, r) => s + r.count, 0)
    const totalDollars = rows.reduce((s, r) => s + r.dollars, 0)
    const body: SummaryRow[] = rows.map(r => ({
      cells: [r.rate ?? r.label ?? '', r.count, fullDollar(r.dollars), r.pct],
      fmts:  [undefined, INT_FMT, MONEY_FMT, PCT_FMT],
    }))
    return [...body, {
      cells: ['', totalCount, fullDollar(totalDollars), totalDollars > 0 ? 1 : EM_DASH],
      fmts:  [undefined, INT_FMT, MONEY_FMT, PCT_FMT],
      bold: true, topRule: true,
    }]
  }

  return [
    {
      title: 'LP Portfolio',
      spans: [[1, 2], [3, 3]],
      rows: [
        moneyRow('Total Capital Commitments', ext.totalCapCommit, { bold: true }),
        moneyRow('Total Called Capital', ext.totalCalledCap),
        pctRow('% of Called Capital', ext.pctLpCalled || null),
        moneyRow('Total Uncalled Capital', ext.totalAllUncalled, { bold: true }),
        { cells: ['# of Limited Partners', ext.totalLPs], fmts: kvFmt(INT_FMT), bold: true },
        pctRow('% Institutional', ext.pctInstitutional),
        pctRow('% HNW', ext.pctHNW),
        pctRow('% Top 10', ext.pctTop10),
        pctRow('% Top 20', ext.pctTop20),
        pctRow('Investment Grade', ext.igRatio),
        pctRow('% Uncalled from LPs > $25bn AUM', ext.pctUncalledGt25bnAum || null),
      ],
    },
    {
      title: 'Borrowing Base',
      spans: [[5, 6], [7, 7]],
      rows: [
        moneyRow('Total Facility Size', ext.facilitySize, { bold: true }),
        moneyRow('UBS Participation', ext.ubsParticipation, { bold: true }),
        pctRow('UBS Participation Rate', ext.ubsParticipationPct || null),
        pctRow('Facility LTV', ext.facilityLTV || null),
        moneyRow('Available Commitment', ext.availableCommit, { bold: true }),
        pctRow('Current Facility Advance Rate', ext.facilityAdvRate || null),
        moneyRow('Agent Borrowing Base', ext.agentBBRaw, { bold: true, fill: XL.agentBg, valueColor: XL.agentFg }),
        moneyRow('UBS Borrowing Base', ext.ubsBBRaw, { bold: true }),
        pctRow('UBS Advance Rate', ext.ubsAdvRate, { fill: XL.ubsRateBg, valueColor: XL.ubsRateFg }),
        pctRow('EAR Differential', ext.ubsAdvRate - ext.facilityAdvRate),
        pctRow('Uncalled to Facility', ext.facilitySize > 0 ? ext.totalAllUncalled / ext.facilitySize : null),
        pctRow('BB to Facility', ext.facilitySize > 0 ? ext.agentBBRaw / ext.facilitySize : null),
        pctRow('Facility to Fund Size', ext.totalCapCommit > 0 ? ext.facilitySize / ext.totalCapCommit : null),
      ],
    },
    {
      title: 'BUSA',
      spans: [[9, 9], [10, 10], [11, 11], [12, 12]],
      header: ['Rate', '#', '$', '%'],
      rows: breakdownRows(ext.busaBreakdown),
    },
    {
      title: 'Agent',
      spans: [[14, 14], [15, 15], [16, 16], [17, 17]],
      header: ['Rate', '#', '$', '%'],
      rows: breakdownRows(ext.agentBreakdown),
    },
  ]
}

/**
 * Border for one cell of a summary table: a medium navy outline on the table's four outer
 * edges, thin grey between fields and rows, and the 2px rule above a totals row. A merged
 * span's cells share one style, and Excel draws only the span's outer edges, so carrying
 * both the left and right edge on that shared style is what keeps the outline square.
 */
function summaryBorder(edges: { left: boolean; right: boolean; top: boolean; bottom: boolean; rule?: boolean }) {
  return {
    top:    edges.top ? outlineEdge : edges.rule ? ruleEdge : thinEdge,
    bottom: edges.bottom ? outlineEdge : thinEdge,
    left:   edges.left ? outlineEdge : thinEdge,
    right:  edges.right ? outlineEdge : thinEdge,
  }
}

/** Writes one summary table at `startRow`; returns the last row it occupies. */
function writeSummaryTable(ws: XlWorksheet, table: SummaryTable, startRow: number): number {
  const first = table.spans[0][0]
  const last  = table.spans[table.spans.length - 1][1]
  const lastRow = startRow + (table.header ? 1 : 0) + table.rows.length
  const isLastSpan = (i: number) => i === table.spans.length - 1
  let r = startRow

  // Merged cells share the master cell's style object, so styling the master after the
  // merge paints the whole span.
  ws.mergeCells(r, first, r, last)
  const titleCell = ws.getCell(r, first)
  titleCell.value     = table.title
  titleCell.fill      = fillOf(XL.navyBar)
  titleCell.font      = fontOf({ bold: true, color: XL.white })
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' }
  titleCell.border    = summaryBorder({ left: true, right: true, top: true, bottom: false })
  r++

  const header = table.header
  if (header) {
    table.spans.forEach(([from, to], i) => {
      if (from !== to) ws.mergeCells(r, from, r, to)
      const cell = ws.getCell(r, from)
      cell.value     = header[i] ?? ''
      cell.fill      = fillOf(XL.headerBg)
      cell.font      = fontOf({ bold: true, color: XL.muted })
      cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right' }
      cell.border    = summaryBorder({ left: i === 0, right: isLastSpan(i), top: false, bottom: false })
    })
    r++
  }

  for (const row of table.rows) {
    table.spans.forEach(([from, to], i) => {
      if (from !== to) ws.mergeCells(r, from, r, to)
      const value = row.cells[i] ?? null
      const cell  = ws.getCell(r, from)
      cell.value     = value
      cell.font      = fontOf({
        bold:  row.bold,
        color: i === 0 || !row.valueColor ? (row.bold ? XL.text : XL.muted) : row.valueColor,
      })
      cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right' }
      cell.border    = summaryBorder({
        left: i === 0, right: isLastSpan(i), top: false, bottom: r === lastRow, rule: row.topRule,
      })
      if (row.fill) cell.fill = fillOf(row.fill)
      const fmt = row.fmts?.[i]
      if (fmt && typeof value === 'number') cell.numFmt = fmt
    })
    r++
  }
  return r - 1
}

/** Writes the LP grid — header plus one row per LP — at `startRow`; returns its last row. */
function writeDetailGrid(ws: XlWorksheet, rows: ShadowExportRow[], startRow: number): number {
  DETAIL_COLS.forEach((col, i) => {
    const cell = ws.getCell(startRow, i + 1)
    cell.value     = col.header
    cell.fill      = fillOf(XL.headerBg)
    cell.font      = fontOf({ bold: true, color: XL.headerFg })
    cell.alignment = { vertical: 'middle', horizontal: col.align, wrapText: false }
    cell.border    = boxBorder
  })

  rows.forEach((row, rowIndex) => {
    const r = startRow + 1 + rowIndex
    const zebra = rowIndex % 2 === 1 // .data-table tr:nth-child(even)
    DETAIL_COLS.forEach((col, i) => {
      const value = col.value(row)
      const cell  = ws.getCell(r, i + 1)
      cell.value     = value
      cell.alignment = { vertical: 'middle', horizontal: col.align }
      cell.border    = boxBorder
      if (col.numFmt && typeof value === 'number') cell.numFmt = col.numFmt

      // Missing values and zeroed BB figures render muted on screen; an LP with no UBS
      // classification renders in the danger colour.
      const muted = value === EM_DASH || (col.mutedZero && value === 0)
      const unclassified = i + 1 === UBS_CLS_COL && row.unclassified
      cell.font = fontOf({ color: unclassified ? XL.danger : muted ? XL.muted : XL.text })

      if (i + 1 === ELIGIBLE_COL) {
        // The YesNo pill.
        cell.fill = fillOf(row.eligible ? XL.yesBg : XL.headerBg)
        cell.font = fontOf({ bold: true, color: row.eligible ? XL.yesFg : XL.muted })
      } else if (zebra) {
        cell.fill = fillOf(XL.zebra)
      }
    })
  })

  return startRow + rows.length
}

export async function exportShadowBB(facility: string, ext: BBSummaryExt, rows: ShadowExportRow[]) {
  const [{ default: ExcelJS }, { saveAs }] = await Promise.all([
    import('exceljs'),
    import('file-saver'),
  ])

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Shadow BB')
  ws.columns = DETAIL_COLS.map(col => ({ width: detailColWidth(col) }))

  const title = ws.getCell(1, 1)
  title.value = `Shadow BB — ${facility || 'Facility'}`
  title.font  = fontOf({ bold: true, size: 14, color: XL.navyBar })

  const summaryCaption = ws.getCell(3, 1)
  summaryCaption.value = 'Portfolio & BB Summary'
  summaryCaption.font  = fontOf({ bold: true, size: 11, color: XL.headerFg })

  const summaryStart = 4
  const summaryEnd = buildSummaryTables(ext)
    .reduce((last, table) => Math.max(last, writeSummaryTable(ws, table, summaryStart)), summaryStart)

  const gridCaption = ws.getCell(summaryEnd + 2, 1)
  gridCaption.value = `LP-Level Shadow BB — ${rows.length.toLocaleString()} ${rows.length === 1 ? 'LP' : 'LPs'}`
  gridCaption.font  = fontOf({ bold: true, size: 11, color: XL.headerFg })

  const gridHeaderRow = summaryEnd + 3
  const gridLastRow = writeDetailGrid(ws, rows, gridHeaderRow)

  if (gridLastRow > gridHeaderRow) {
    ws.autoFilter = {
      from: { row: gridHeaderRow, column: 1 },
      to:   { row: gridLastRow,   column: DETAIL_COLS.length },
    }
  }
  // Keep Rank and Investor Name in view while scrolling the grid sideways.
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 0 }]
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

  const file = `Shadow_BB_${(facility || 'facility').replace(/[^\w.-]+/g, '_')}.xlsx`
  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), file)
}

function pctFromConc(value: string | undefined | null, totalUncalledM: number): number | '' {
  if (!value) return ''
  if (String(value).includes('%')) return parsePct(value)
  const concM = parseMoneyM(value)
  return concM > 0 && totalUncalledM > 0 ? Number(((concM / totalUncalledM) * 100).toFixed(2)) : ''
}

function buildOverride(LPRecord: ComputedLP, totalUncalledM: number, defaultConcLimitPct: number | ''): Override {
  const lpSizeCriteria = LPRecord.aum ? 'AUM' : LPRecord.nav ? 'NAV' : LPRecord.pensionAssets ? 'Assets' : ''
  return {
    investorName:      LPRecord.investorName ?? '',
    parent:            LPRecord.parent ?? '',
    spv:               !!LPRecord.spv,
    investorType:      LPRecord.investorType ?? '',
    institutionalOrHnw:         LPRecord.institutionalOrHnw ?? 'Institutional',
    investmentGrade:                !!LPRecord.investmentGrade,
    ubsLpCategory:               LPRecord.ubsLpCategory ?? '',
    agentLpCategory:          LPRecord.agentLpCategory ?? '',
    regionLocation:    LPRecord.regionLocation ?? '',
    spRating:                LPRecord.spRating && LPRecord.spRating !== 'NR' ? LPRecord.spRating : '',
    moodysRating:               LPRecord.moodysRating && LPRecord.moodysRating !== 'NR' ? LPRecord.moodysRating : '',
    fitchRating:             LPRecord.fitchRating && LPRecord.fitchRating !== 'NR' ? LPRecord.fitchRating : '',
    lpSizeBil:         LPRecord.aum || LPRecord.nav || LPRecord.pensionAssets || '',
    lpSizeCriteria,
    capitalCommitment:         LPRecord.capitalCommitment ?? '',
    ucM:               LPRecord.uncalledCapital ?? '',
    ubsAdvRatePct:     pctFromFraction(LPRecord.ubsAdvanceRate),
    agentRatePct:      pctFromFraction(LPRecord.agentAdvanceRate),
    concLimitPct:      pctFromConc(LPRecord.ubsConcentrationLimit, totalUncalledM) || defaultConcLimitPct,
    agentConcLimitPct: pctFromConc(LPRecord.agentConcentrationLimit, totalUncalledM),
    included:               !!LPRecord.included,
    notes:             LPRecord.notes ?? '',
  }
}

function overrideToLPRecord(ov: Override, totalUncalledM: number): Partial<LPRecord> & { concLimitM?: number } {
  const concLimitM = typeof ov.concLimitPct === 'number' ? (ov.concLimitPct / 100) * totalUncalledM : undefined
  return {
    investorName: ov.investorName,
    parent: ov.parent,
    spv: ov.spv,
    investorType: ov.investorType || undefined,
    institutionalOrHnw: ov.institutionalOrHnw as LPRecord['institutionalOrHnw'],
    investmentGrade: ov.investmentGrade,
    ubsLpCategory: (ov.ubsLpCategory as LPRecord['ubsLpCategory']) || undefined,
    agentLpCategory: ov.agentLpCategory || undefined,
    regionLocation: (ov.regionLocation as LPRecord['regionLocation']) || undefined,
    spRating: ov.spRating || undefined,
    moodysRating: ov.moodysRating || undefined,
    fitchRating: ov.fitchRating || undefined,
    aum: ov.lpSizeCriteria === 'AUM' ? ov.lpSizeBil || undefined : undefined,
    nav: ov.lpSizeCriteria === 'NAV' ? ov.lpSizeBil || undefined : undefined,
    pensionAssets: ov.lpSizeCriteria === 'Assets' ? ov.lpSizeBil || undefined : undefined,
    capitalCommitment: ov.capitalCommitment || undefined,
    uncalledCapital: ov.ucM || undefined,
    ubsAdvanceRate: typeof ov.ubsAdvRatePct === 'number' ? ov.ubsAdvRatePct / 100 : undefined,
    agentAdvanceRate: typeof ov.agentRatePct === 'number' ? ov.agentRatePct / 100 : undefined,
    ubsConcentrationLimit: typeof ov.concLimitPct === 'number' ? formatPercentageValue(ov.concLimitPct) : undefined,
    agentConcentrationLimit: typeof ov.agentConcLimitPct === 'number' ? formatPercentageValue(ov.agentConcLimitPct) : undefined,
    concLimitM,
    included: ov.included,
    notes: ov.notes ?? '',
  }
}

// Grid row: the snapshot's per-LP engine results joined with the live LP record's input fields.
export type ShadowRow = ComputedLP & { _key: string; _isNew: boolean; _agentName: string }

const shadowRowKey = (LPRecord: { id?: number | null; investorName?: string | null }, index: number) => (
  LPRecord.id != null ? `LPRecord-${LPRecord.id}` : `LPRecord-${index}-${LPRecord.investorName ?? ''}`
)

/**
 * Joins the snapshot's per-LP engine results (authoritative computed figures, frozen at the last
 * run) with the live LP records (current input fields, rank). Join key: record id, falling back
 * to investor name for snapshots persisted before ids were reliable.
 */
export function buildShadowRows(snapshotLps: ComputedLP[], rawLPs: LPRecord[]): ShadowRow[] {
  const liveById = new Map(rawLPs.filter(r => r.id != null).map(r => [r.id, r]))
  const liveByName = new Map(rawLPs.map(r => [r.investorName, r]))
  return snapshotLps.map((snapRow, index) => {
    const live = (snapRow.id != null ? liveById.get(snapRow.id) : undefined)
      ?? liveByName.get(snapRow.investorName ?? '')
    return {
      ...snapRow,
      ...(live ?? {}),
      // Computed columns always come from the snapshot — never from the (possibly re-edited)
      // live record strings.
      uncalledEligibleCapital: snapRow.uncalledEligibleCapital, uecM: snapRow.uecM, ubbM: snapRow.ubbM, abbM: snapRow.abbM,
      deltaM: snapRow.deltaM, concExcessM: snapRow.concExcessM,
      ucM: snapRow.ucM, agentExcessM: snapRow.agentExcessM,
      pctAgentBB: snapRow.pctAgentBB, pctUbsBB: snapRow.pctUbsBB,
      highQuality: snapRow.highQuality,
      // The UBS advance rate is engine-resolved (stored per-LP rate else matrix): live wins when
      // an analyst has saved one; otherwise show the rate the run resolved (API may send null).
      ubsAdvanceRate: live?.ubsAdvanceRate ?? snapRow.ubsAdvanceRate,
      _key: shadowRowKey(live ?? snapRow, index),
      _isNew: false,
      _agentName: (live ?? snapRow).investorName ?? '',
    }
  })
}

/**
 * Projects the grid rows onto the Excel export, cell for cell: the same override-derived
 * inputs, the same live-preview-for-edited-rows / frozen-snapshot-otherwise choice for the
 * BB figures, in the same column order the table renders.
 */
export function buildShadowExportRows(args: {
  rows: ShadowRow[]
  overrides: Record<string, Override>
  editedKeys: Record<string, unknown>
  ranks: Record<string, number>
  totalCommitM: number
  totalUncalledM: number
  frozenTotalABB: number
  frozenTotalUBB: number
}): ShadowExportRow[] {
  const { rows, overrides, editedKeys, ranks, totalCommitM, totalUncalledM, frozenTotalABB, frozenTotalUBB } = args
  const fraction = (v: number | '' | undefined) => (typeof v === 'number' ? v / 100 : null)
  const share = (part: number, total: number) => (total > 0 ? part / total : 0)

  return rows.map(LPRecord => {
    const key = LPRecord._key
    const ov = overrides[key] ?? {} as Override
    const c = calcRow(ov, totalCommitM, totalUncalledM)
    const edited = editedKeys[key] != null

    return {
      rank:               ranks[key] ?? null,
      investorName:       ov.investorName || LPRecord.investorName || LPRecord._agentName || EM_DASH,
      parent:             ov.parent || EM_DASH,
      spv:                ov.spv ? 'Yes' : 'No',
      region:             formatRegion(ov.regionLocation || LPRecord.regionLocation) || EM_DASH,
      investorType:       ov.investorType || LPRecord.investorType || EM_DASH,
      institutionalOrHnw: ov.institutionalOrHnw || EM_DASH,
      agentLpCategory:    ov.agentLpCategory || EM_DASH,
      ubsLpCategory:      ov.ubsLpCategory || 'Unclassified',
      unclassified:       !ov.ubsLpCategory,
      eligible:           edited ? c.included : !!(LPRecord.included && LPRecord.ubsLpCategory !== 'Excluded'),
      investmentGrade:    ov.investmentGrade ? 'Yes' : 'No',
      spRating:           ov.spRating || EM_DASH,
      moodysRating:       ov.moodysRating || EM_DASH,
      fitchRating:        ov.fitchRating || EM_DASH,
      lpSizeCriteria:     ov.lpSizeCriteria || EM_DASH,
      lpSize:             lpSizeFormat(ov.lpSizeBil),
      capitalCommitmentM: ov.capitalCommitment ? parseMoneyM(ov.capitalCommitment) : null,
      cmtPct:             c.cmtPct,
      calledM:            c.calledM,
      ucM:                ov.ucM ? parseMoneyM(ov.ucM) : null,
      pctOfFundUncalled:  c.pctOfFundUncalled,
      pctLpCalled:        c.pctLpCalled,
      agentRate:          fraction(ov.agentRatePct),
      ubsAdvRate:         fraction(ov.ubsAdvRatePct),
      agentConcLimit:     fraction(ov.agentConcLimitPct),
      ubsConcLimit:       fraction(ov.concLimitPct),
      agentExcessM:       edited ? c.agentExcess : LPRecord.agentExcessM ?? 0,
      ubsExcessM:         edited ? c.ubsExcess : LPRecord.concExcessM,
      agentBBM:           edited ? c.agentBBCalc : LPRecord.abbM,
      pctAgentBB:         pctOfTotal(edited ? share(c.agentBBCalc, frozenTotalABB) : LPRecord.pctAgentBB ?? 0),
      ubsBBM:             edited ? c.ubsBBCalc : LPRecord.ubbM,
      pctUbsBB:           pctOfTotal(edited ? share(c.ubsBBCalc, frozenTotalUBB) : LPRecord.pctUbsBB ?? 0),
      notes:              ov.notes || EM_DASH,
    }
  })
}

/** The grid shows a share only when it is positive; otherwise an em dash. */
function pctOfTotal(share: number): number | null {
  return share > 0 ? share : null
}

export default function ShadowBB() {
  const { bbParams, toast, targetFacility, setTargetFacility } = useApp()
  const { can } = useAuth()
  const [facilityOptions, setFacilityOptions] = useState<{ id?: number; name: string; status: string }[]>([])
  const [facility,        setFacility]        = useState('')
  const [facilityId,      setFacilityId]      = useState<number | null>(null)
  const [clsFilter,       setClsFilter]       = useState('')
  const [selectedKey,     setSelectedKey]     = useState<string | null>(null)
  const [summaryHidden,   setSummaryHidden]   = useState(false)
  const [summaryExtApi,   setSummaryExtApi]   = useState<BBSummaryExt | null>(null)
  const [calcMeta,        setCalcMeta]        = useState<{ facility: string; ts: Date } | null>(null)
  const [loadError,       setLoadError]       = useState<string | null>(null)
  const [classCfg,        setClassCfg]        = useState<ClassificationConfig | null>(null)
  const [rerunning,       setRerunning]       = useState(false)

  // Independent-review state: the most recent submission for the selected facility. When it is
  // 'Pending Review', a Manager sees Approve/Reject; everyone else sees a read-only status.
  const [reviewSub,  setReviewSub]  = useState<Submission | null>(null)
  const [reviewBusy, setReviewBusy] = useState(false)

  // Live LP records (input fields) + the latest snapshot (authoritative computed figures).
  const [rawLPs,       setRawLPs]       = useState<LPRecord[]>([])
  const [snapshotLps,  setSnapshotLps]  = useState<ComputedLP[]>([])
  const [snapshot,     setSnapshot]     = useState<Record<string, unknown>>({})
  const [snapshotBreaches, setSnapshotBreaches] = useState<BBBreach[]>([])
  const [breachHidden,  setBreachHidden]  = useState(false)
  const [warningHidden, setWarningHidden] = useState(false)
  const [overrideMap,  setOverrideMap]  = useState<Record<string, Partial<LPRecord> & { concLimitM?: number }>>({})

  // Per-LPRecord save status for the "Saving… / ✓ Saved" indicator
  const [saveStatuses, setSaveStatuses] = useState<Record<string, 'saving' | 'saved' | 'error'>>({})
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const [containerWidth, setContainerWidth] = useState(0)
  useEffect(() => {
    const el = document.querySelector('.content')
    if (!el) return
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const compact = containerWidth < 1500
  const bbColumnItems = useMemo(() => {
    const busaDesc = classCfg
      ? Object.entries(classCfg.BUSA_RATE_MAP).map(([cls, rate]) => `${cls} ${rate}`).join(' · ')
      : ''
    return [
      { label: 'UBS Advance Rate',   desc: `UBS (BUSA) advance rate applied to eligible uncalled capital: ${busaDesc || 'loaded from database configuration'}.` },
      { label: 'Agent Advance Rate', desc: 'Advance rate assigned by the facility Agent.' },
      { label: 'Agent BB',           desc: "The Agent's borrowing base contribution for this LPRecord: eligible uncalled capital x Agent advance rate, after concentration limits." },
      { label: 'UBS BB',             desc: 'The UBS borrowing base contribution for this LPRecord: eligible uncalled capital x UBS advance rate, after the UBS per-LP concentration limit.' },
    ]
  }, [classCfg])

  useEffect(() => {
    getClassificationConfig().then(setClassCfg).catch(e => setLoadError(String(e)))
  }, [])

  useEffect(() => {
    setLoadError(null)
    getFacilities().then(fs => {
      const opts = fs.map(f => ({ id: f.id, name: f.name, status: f.status }))
      setFacilityOptions(opts)
      if (opts.length > 0) {
        const target = targetFacility ? opts.find(o => o.name === targetFacility) : undefined
        const chosen = target ?? opts[0]
        setFacility(chosen.name)
        setFacilityId(chosen.id ?? null)
        if (targetFacility) setTargetFacility(null)
      }
    }).catch(e => setLoadError(String(e)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!facilityId) return
    setLoadError(null)
    Promise.all([
      getLPsForFacility(facilityId),
      getFacilityBBSnapshot(facilityId),
      getFacilitySummaryExt(facilityId),
    ]).then(([lps, snap, ext]) => {
      const hasSnapshot = snap != null && Object.keys(snap.summary).length > 0
      if (!hasSnapshot) {
        setRawLPs([])
        setSnapshotLps([])
        setSnapshot({})
        setSnapshotBreaches([])
        setOverrideMap({})
        setSummaryExtApi(null)
        setCalcMeta(null)
        setSelectedKey(null)
        setClsFilter('')
        return
      }
      setRawLPs(lps as LPRecord[])
      setSnapshotLps(snap.lps)
      setSnapshot(snap.summary)
      setSnapshotBreaches(snap.breaches)
      setOverrideMap({})
      setCalcMeta({ facility, ts: new Date() })
      setSelectedKey(null)
      setClsFilter('')
      if (ext) setSummaryExtApi(ext)
    }).catch(e => setLoadError(String(e)))
  }, [facility, facilityId])

  const shadowRows = useMemo<ShadowRow[]>(() => buildShadowRows(snapshotLps, rawLPs), [rawLPs, snapshotLps])
  const facilityInactive = facilityOptions.find(option => option.id === facilityId)?.status === 'Inactive'

  // Snapshot summary, frozen at the last run — the only source of portfolio totals.
  const summary = useMemo(() => snapshot as unknown as Partial<BBSummary>, [snapshot])
  const frozenTotalABB = summary.totalABB ?? 0
  const frozenTotalUBB = summary.totalUBB ?? 0

  const resultTotalUncalledM = useMemo(
    () => shadowRows.reduce((s, r) => s + (r.ucM ?? parseM(r.uncalledCapital)), 0),
    [shadowRows],
  )
  const defaultConcLimitPct = useMemo(
    () => resultTotalUncalledM > 0 ? Number(((bbParams.concLimitM / resultTotalUncalledM) * 100).toFixed(2)) : '',
    [bbParams.concLimitM, resultTotalUncalledM],
  )

  const overrides = useMemo<Record<string, Override>>(
    () => Object.fromEntries(shadowRows.map(LPRecord => [
      LPRecord._key,
      buildOverride(LPRecord, resultTotalUncalledM, defaultConcLimitPct),
    ])),
    [shadowRows, resultTotalUncalledM, defaultConcLimitPct],
  )

  const totalCommitM = useMemo(
    () => Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.capitalCommitment), 0),
    [overrides],
  )
  const totalUncalledM = useMemo(
    () => Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.ucM), 0),
    [overrides],
  )

  // Ranks are computed by the API on each Shadow BB run and served on the LP records —
  // the UI only displays them and never derives its own.
  const rankByKey = useMemo(() => Object.fromEntries(
    shadowRows
      .filter(LPRecord => typeof LPRecord.lpRank === 'number')
      .map(LPRecord => [LPRecord._key, LPRecord.lpRank as number]),
  ), [shadowRows])

  const selectedLP = useMemo(
    () => (selectedKey ? shadowRows.find(r => r._key === selectedKey) ?? null : null),
    [shadowRows, selectedKey],
  )

  const sbOvToLP = (LPRecord: SubmissionLP, ov: Override): LPRecord => ({
    ...(LPRecord as LPRecord),
    investorName: ov.investorName || LPRecord.investorName || LPRecord._agentName || '',
    parent:      ov.parent ?? '', spv: ov.spv, institutionalOrHnw: ov.institutionalOrHnw as LPRecord['institutionalOrHnw'], investorType: ov.investorType ?? LPRecord.investorType ?? '',
    investmentGrade:          ov.investmentGrade,
    ubsLpCategory:         (ov.ubsLpCategory || '') as LPRecord['ubsLpCategory'], ubsLpCategoryTag: LPRecord.ubsLpCategoryTag ?? '',
    agentLpCategory:    ov.agentLpCategory, regionLocation: (ov.regionLocation || LPRecord.regionLocation || '') as LPRecord['regionLocation'],
    spRating:          ov.spRating ?? '', moodysRating: ov.moodysRating ?? '', fitchRating: ov.fitchRating ?? '',
    aum:         ov.lpSizeCriteria === 'AUM' ? (ov.lpSizeBil || '') : (LPRecord.aum ?? ''),
    nav:         ov.lpSizeCriteria === 'NAV' ? (ov.lpSizeBil || '') : (LPRecord.nav ?? ''),
    pensionAssets:     LPRecord.pensionAssets ?? '', fundingRatio: LPRecord.fundingRatio ?? null,
    capitalCommitment:   ov.capitalCommitment ?? '', uncalledCapital: ov.ucM != null ? String(ov.ucM) : (LPRecord.uncalledCapital ?? ''),
    ubsAdvanceRate:     typeof ov.ubsAdvRatePct === 'number' ? ov.ubsAdvRatePct / 100 : LPRecord.ubsAdvanceRate ?? null,
    agentAdvanceRate:   typeof ov.agentRatePct  === 'number' ? ov.agentRatePct / 100  : LPRecord.agentAdvanceRate ?? null,
    agentConcentrationLimit: typeof ov.agentConcLimitPct === 'number' ? formatPercentageValue(ov.agentConcLimitPct) : formatPercentageText(LPRecord.agentConcentrationLimit, ''),
    ubsConcentrationLimit:   typeof ov.concLimitPct === 'number' ? formatPercentageValue(ov.concLimitPct) : formatPercentageText(LPRecord.ubsConcentrationLimit, ''),
    included: ov.included, notes: ov.notes ?? '', reclassified: LPRecord.reclassified ?? false, transferee: LPRecord.transferee ?? false, highQuality: LPRecord.highQuality ?? false,
    agentBorrowingBase: LPRecord.agentBorrowingBase ?? '', ubsBorrowingBase: LPRecord.ubsBorrowingBase ?? '', delta: LPRecord.delta ?? '', uncalledEligibleCapital: LPRecord.uncalledEligibleCapital ?? '',
    pctOfFundCommitments: LPRecord.pctOfFundCommitments ?? null, calledCapital: LPRecord.calledCapital ?? '',
    pctOfFundUncalled: LPRecord.pctOfFundUncalled ?? null, pctLpCalled: LPRecord.pctLpCalled ?? null,
    agentExcessConcentration: LPRecord.agentExcessConcentration, ubsExcessConcentration: LPRecord.ubsExcessConcentration,
  })

  const sbLpToOv = (saved: LPRecord, prev: Override): Override => ({
    ...prev,
    investorName: saved.investorName, parent: saved.parent ?? '', spv: saved.spv, investorType: saved.investorType ?? '', institutionalOrHnw: saved.institutionalOrHnw ?? '', investmentGrade: saved.investmentGrade,
    ubsLpCategory: saved.ubsLpCategory ?? '', agentLpCategory: saved.agentLpCategory ?? '',
    regionLocation: saved.regionLocation ?? '',
    spRating: saved.spRating ?? '', moodysRating: saved.moodysRating ?? '', fitchRating: saved.fitchRating ?? '',
    lpSizeBil: saved.aum || saved.nav || saved.pensionAssets || '',
    lpSizeCriteria: saved.aum ? 'AUM' : saved.nav ? 'NAV' : saved.pensionAssets ? 'Assets' : prev.lpSizeCriteria || '',
    capitalCommitment: saved.capitalCommitment ?? '', ucM: saved.uncalledCapital ?? prev.ucM,
    ubsAdvRatePct: pctFromFraction(saved.ubsAdvanceRate) !== '' ? pctFromFraction(saved.ubsAdvanceRate) : prev.ubsAdvRatePct,
    agentRatePct:  pctFromFraction(saved.agentAdvanceRate) !== '' ? pctFromFraction(saved.agentAdvanceRate) : prev.agentRatePct,
    concLimitPct:  parsePct(saved.ubsConcentrationLimit) !== '' ? parsePct(saved.ubsConcentrationLimit) : prev.concLimitPct,
    agentConcLimitPct: parsePct(saved.agentConcentrationLimit) !== '' ? parsePct(saved.agentConcentrationLimit) : prev.agentConcLimitPct,
    included: saved.included, notes: saved.notes ?? '',
  })

  const saveDraft = async (draft: Override) => {
    if (!selectedKey) return
    if (loadError) {
      toast('Shadow BB data was not loaded from the database; save is disabled to avoid persisting UI defaults.')
      return
    }
    const lpRecord = selectedLP ?? shadowRows.find(LPRecord => LPRecord._key === selectedKey) ?? null
    const lpName = draft.investorName || lpRecord?.investorName || lpRecord?._agentName || selectedKey
    const changes = overrideToLPRecord(draft, totalUncalledM)
    setOverrideMap(prev => {
      const next = { ...prev }
      next[selectedKey] = { ...(prev[selectedKey] ?? {}), ...changes }
      return next
    })

    if (facilityId == null) return
    setSaveStatuses(s => ({ ...s, [selectedKey]: 'saving' }))
    try {
      type ClassificationRow = LpClassificationRequest['rows'][number]
      const row: ClassificationRow = {
        investorName:      lpName,
        originalName:      lpRecord?.investorName || lpRecord?._agentName || undefined,
        parent:            draft.parent || undefined,
        spv:               draft.spv,
        investorType:      draft.investorType || undefined,
        institutionalOrHnw:         draft.institutionalOrHnw || undefined,
        investmentGrade:                draft.investmentGrade,
        ubsLpCategory:               draft.ubsLpCategory || undefined,
        agentLpCategory:          draft.agentLpCategory || undefined,
        regionLocation:    draft.regionLocation || undefined,
        spRating:                draft.spRating,
        moodysRating:               draft.moodysRating,
        fitchRating:             draft.fitchRating,
        aum:               draft.lpSizeCriteria === 'AUM' ? draft.lpSizeBil || undefined : undefined,
        nav:               draft.lpSizeCriteria === 'NAV' ? draft.lpSizeBil || undefined : undefined,
        pensionAssets:           draft.lpSizeCriteria === 'Assets' ? draft.lpSizeBil || undefined : undefined,
        capitalCommitment:         draft.capitalCommitment || undefined,
        uncalledCapital:                draft.ucM || undefined,
        ubsAdvanceRatePct:          typeof draft.ubsAdvRatePct === 'number' ? draft.ubsAdvRatePct : undefined,
        agentAdvanceRatePct:        typeof draft.agentRatePct === 'number' ? draft.agentRatePct : undefined,
        ubsConcentrationLimitPct:   typeof draft.concLimitPct === 'number' ? draft.concLimitPct : undefined,
        agentConcentrationLimitPct: typeof draft.agentConcLimitPct === 'number' ? draft.agentConcLimitPct : undefined,
        included:               draft.included,
        notes:             draft.notes ?? '',
      }
      await api.lpRecords.saveClassification({ facilityId, rows: [row] })
      const reclassified = Boolean(lpRecord?.reclassified)
        || (row.agentLpCategory != null && String(row.agentLpCategory).trim() !== String(lpRecord?.agentLpCategory ?? '').trim())
        || (row.ubsLpCategory != null && String(row.ubsLpCategory).trim() !== String(lpRecord?.ubsLpCategory ?? '').trim())
      if (reclassified) {
        setRawLPs(current => current.map(lp => {
          const matches = lpRecord?.id != null
            ? lp.id === lpRecord.id
            : lp.investorName === (lpRecord?.investorName || lpRecord?._agentName)
          return matches ? { ...lp, reclassified: true } : lp
        }))
      }
      setSaveStatuses(s => ({ ...s, [selectedKey]: 'saved' }))
      clearTimeout(saveTimers.current[selectedKey])
      saveTimers.current[selectedKey] = setTimeout(() => {
        setSaveStatuses(s => { const n = { ...s }; delete n[selectedKey]; return n })
      }, 2000)
    } catch (e) {
      setSaveStatuses(s => ({ ...s, [selectedKey]: 'error' }))
      toast(`Save failed — ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }
  }

  const handleRerunShadowBB = async () => {
    if (facilityId == null || facilityInactive) return
    const selectedFacilityId = facilityId
    const selectedFacilityName = facility
    setRerunning(true)
    try {
      const { snapshot: freshSnapshot, submission: pendingSubmission } =
        await api.bb.rerunForReview(selectedFacilityId)
      const [lps, ext, facilities] = await Promise.all([
        getLPsForFacility(selectedFacilityId),
        getFacilitySummaryExt(selectedFacilityId),
        getFacilities(),
      ])
      const options = facilities.map(f => ({ id: f.id, name: f.name, status: f.status }))
      const selectedFacility =
        options.find(o => o.id === selectedFacilityId)
        ?? options.find(o => o.name === selectedFacilityName)
      setRawLPs(lps as LPRecord[])
      setSnapshotLps(freshSnapshot.result.lps ?? [])
      setSnapshot((freshSnapshot.result.summary as unknown as Record<string, unknown>) ?? {})
      setSnapshotBreaches(freshSnapshot.result.breaches ?? [])
      setSummaryExtApi(ext)
      setFacilityOptions(options)
      if (selectedFacility) {
        setFacility(selectedFacility.name)
        setFacilityId(selectedFacility.id ?? selectedFacilityId)
        setTargetFacility(selectedFacility.name)
      }
      setOverrideMap({})
      setSelectedKey(null)
      setReviewSub(pendingSubmission)
      setCalcMeta({ facility: selectedFacility?.name ?? selectedFacilityName, ts: new Date() })
      toast(`Shadow BB re-run complete - UBS BB ${fmtMoneyM(freshSnapshot.result.summary.totalUBB, true)}. Submitted for Manager approval.`, 3600, 'success')
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'Could not re-run Shadow BB - API unavailable.')
    } finally {
      setRerunning(false)
    }
  }

  const explainInactiveRerun = () => {
    toast('Re-run Shadow BB is unavailable because this facility is inactive.')
  }

  useEffect(() => () => { Object.values(saveTimers.current).forEach(clearTimeout) }, [])

  const filtered = useMemo(() => clsFilter ? shadowRows.filter(r => overrides[r._key]?.ubsLpCategory === clsFilter) : shadowRows, [shadowRows, overrides, clsFilter])
  const ubsClsSortOrder = useMemo(() => {
    const classes = classCfg ? busaClassificationOptions(classCfg).filter(Boolean) : []
    return Object.fromEntries(classes.map((cls, index) => [cls, index]))
  }, [classCfg])
  const sortColumns = useMemo(() => {
    const getOverride = (LPRecord: ShadowRow) => overrides[LPRecord._key]
    const getComputed = (LPRecord: ShadowRow) => {
      const ov = getOverride(LPRecord)
      return ov ? calcRow(ov, totalCommitM, totalUncalledM) : null
    }
    // BB columns: rows with unsaved edits sort by their live preview; all others by the
    // frozen snapshot figures — the same source the cells render.
    const isEdited = (LPRecord: ShadowRow) => overrideMap[LPRecord._key] != null
    return [
      { key: 'rank',         getValue: (LPRecord: ShadowRow) => rankByKey[LPRecord._key] ?? '' },
      { key: 'name',         getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.investorName || LPRecord.investorName || LPRecord._agentName || '' },
      { key: 'parent',       getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.parent ?? '' },
      { key: 'spv',          getValue: (LPRecord: ShadowRow) => !!getOverride(LPRecord)?.spv },
      { key: 'region',       getValue: (LPRecord: ShadowRow) => formatRegion(getOverride(LPRecord)?.regionLocation ?? LPRecord.regionLocation ?? '') },
      { key: 'investorType', getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.investorType ?? LPRecord.investorType ?? '' },
      { key: 'cls',          getValue: (LPRecord: ShadowRow) => ubsClsSortOrder[getOverride(LPRecord)?.ubsLpCategory ?? ''] ?? Number.MAX_SAFE_INTEGER },
      { key: 'institutionalOrHnw',    getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.institutionalOrHnw ?? '' },
      { key: 'ig',           getValue: (LPRecord: ShadowRow) => !!getOverride(LPRecord)?.investmentGrade },
      { key: 'agentLpCategory',     getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.agentLpCategory ?? '' },
      { key: 'sp', getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.spRating ?? '' },
      { key: 'mdy', getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.moodysRating ?? '' },
      { key: 'fitch', getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.fitchRating ?? '' },
      { key: 'lpSizeBil', getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.lpSizeBil ?? '' },
      { key: 'lpSizeCriteria', getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.lpSizeCriteria ?? '' },
      { key: 'capitalCommitment', getValue: (LPRecord: ShadowRow) => parseMoneyM(getOverride(LPRecord)?.capitalCommitment) },
      { key: 'ucM', getValue: (LPRecord: ShadowRow) => parseMoneyM(getOverride(LPRecord)?.ucM) },
      { key: 'ubsAdvRatePct', getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.ubsAdvRatePct ?? '' },
      { key: 'agentRatePct', getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.agentRatePct ?? '' },
      { key: 'concLimitPct', getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.concLimitPct ?? '' },
      { key: 'agentConcLimitPct', getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.agentConcLimitPct ?? '' },
      { key: 'cmtPct', getValue: (LPRecord: ShadowRow) => getComputed(LPRecord)?.cmtPct ?? '' },
      { key: 'calledM', getValue: (LPRecord: ShadowRow) => getComputed(LPRecord)?.calledM ?? '' },
      { key: 'pctOfFundUncalled', getValue: (LPRecord: ShadowRow) => getComputed(LPRecord)?.pctOfFundUncalled ?? '' },
      { key: 'pctLpCalled', getValue: (LPRecord: ShadowRow) => getComputed(LPRecord)?.pctLpCalled ?? '' },
      { key: 'agentExcess', getValue: (LPRecord: ShadowRow) => isEdited(LPRecord) ? getComputed(LPRecord)?.agentExcess ?? 0 : LPRecord.agentExcessM ?? 0 },
      { key: 'ubsExcess', getValue: (LPRecord: ShadowRow) => isEdited(LPRecord) ? getComputed(LPRecord)?.ubsExcess ?? 0 : LPRecord.concExcessM },
      { key: 'agentBBCalc', getValue: (LPRecord: ShadowRow) => isEdited(LPRecord) ? getComputed(LPRecord)?.agentBBCalc ?? 0 : LPRecord.abbM },
      { key: 'pctAgentBB', getValue: (LPRecord: ShadowRow) => isEdited(LPRecord)
          ? (frozenTotalABB > 0 ? (getComputed(LPRecord)?.agentBBCalc ?? 0) / frozenTotalABB : 0)
          : LPRecord.pctAgentBB ?? 0 },
      { key: 'ubsBBCalc', getValue: (LPRecord: ShadowRow) => isEdited(LPRecord) ? getComputed(LPRecord)?.ubsBBCalc ?? 0 : LPRecord.ubbM },
      { key: 'pctUbsBB', getValue: (LPRecord: ShadowRow) => isEdited(LPRecord)
          ? (frozenTotalUBB > 0 ? (getComputed(LPRecord)?.ubsBBCalc ?? 0) / frozenTotalUBB : 0)
          : LPRecord.pctUbsBB ?? 0 },
      { key: 'included', getValue: (LPRecord: ShadowRow) => isEdited(LPRecord) ? !!getComputed(LPRecord)?.included : !!(LPRecord.included && LPRecord.ubsLpCategory !== 'Excluded') },
      { key: 'notes', getValue: (LPRecord: ShadowRow) => getOverride(LPRecord)?.notes ?? '' },
    ]
  }, [overrides, overrideMap, rankByKey, totalCommitM, totalUncalledM, frozenTotalABB, frozenTotalUBB, ubsClsSortOrder])
  const { sort, sortedRows, requestSort } = useSortableRows(filtered, sortColumns, { key: 'rank', direction: 'asc' })
  const { page, setPage, totalPages, total, pageItems, from, to, pageSize, setPageSize } = usePagination(sortedRows)
  const { widths: bbWidths, onResizeStart: bbResizeStart, tableWidth: bbTableWidth } = useColumnResize('shadow-bb-v2', SHADOW_RESULTS_INITIAL_WIDTHS)

  useEffect(() => {
    if (selectedKey === null || sortedRows.length === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      e.preventDefault()
      const idx = sortedRows.findIndex(LPRecord => LPRecord._key === selectedKey)
      if (idx === -1) return
      const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1
      if (nextIdx < 0 || nextIdx >= sortedRows.length) return
      setSelectedKey(sortedRows[nextIdx]._key)
      const nextPage = Math.floor(nextIdx / pageSize) + 1
      if (nextPage !== page) setPage(nextPage)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [sortedRows, selectedKey, page, pageSize, setPage])

  const clsOptions = [...new Set(shadowRows.map(r => r.ubsLpCategory))]
    .sort((a, b) => (ubsClsSortOrder[a] ?? Number.MAX_SAFE_INTEGER) - (ubsClsSortOrder[b] ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b))

  // The 5-table summary is server-computed (GET /api/bb/summary-ext — always 200). The UI only
  // normalizes the rate breakdowns against the configured rate schedule; null until loaded.
  const summaryExt = useMemo((): BBSummaryExt | null => {
    if (!summaryExtApi) return null
    const busaRatesForSummary = uniqueRatesFromMap(classCfg?.BUSA_RATE_MAP, DEFAULT_BUSA_RATES)
    const agentRatesForSummary = [...new Set(
      uniqueRatesFromMap(classCfg?.AGENT_RATE_MAP, DEFAULT_AGENT_RATES).map(advanceRateGroupLabel),
    )].sort((a, b) => rateOrderValue(b) - rateOrderValue(a))
    return {
      ...summaryExtApi,
      busaBreakdown: completeRateBreakdown(summaryExtApi.busaBreakdown, busaRatesForSummary),
      agentBreakdown: completeRateBreakdown(
        summaryExtApi.agentBreakdown?.map(row => ({ ...row, rate: advanceRateGroupLabel(row.rate) })),
        agentRatesForSummary,
      ),
    }
  }, [classCfg, summaryExtApi])

  const p = (n: number) => formatPercentageFraction(n)

  // Load the latest submission for the facility so the review bar knows whether one is pending.
  const loadReviewSub = useCallback(() => {
    if (facilityId == null) { setReviewSub(null); return }
    api.submissions.list({ facilityId })
      .then(list => setReviewSub(list.find(s => s.status !== 'Aborted') ?? null))
      .catch(() => setReviewSub(null))
  }, [facilityId])
  useEffect(() => { loadReviewSub() }, [loadReviewSub])

  const pendingReview = reviewSub?.status === 'Pending Review'

  const acceptReview = async () => {
    if (!reviewSub) return
    setReviewBusy(true)
    try {
      await api.submissions.accept(reviewSub.id)
      if (facilityId != null) {
        const refreshedLPs = await getLPsForFacility(facilityId)
        setRawLPs(refreshedLPs)
      }
      toast('Shadow BB accepted — facility activated.', 3200, 'success')
      loadReviewSub()
    } catch (e) {
      toast(String(e))
    } finally {
      setReviewBusy(false)
    }
  }

  const rejectReview = async () => {
    if (!reviewSub) return
    const reason = window.prompt('Reason for rejection (required):')?.trim()
    if (!reason) return
    setReviewBusy(true)
    try {
      await api.submissions.reject(reviewSub.id, reason)
      toast('Shadow BB rejected and returned to the analyst.')
      loadReviewSub()
    } catch (e) {
      toast(String(e))
    } finally {
      setReviewBusy(false)
    }
  }

  return (
    <div>
      {loadError && <div style={{ padding: '10px 16px', background: '#fff0f0', color: 'var(--danger)', fontSize: 12 }}>API error — {loadError}</div>}
      <div className="subbar">
        <span className="subbar-label">Facility</span>
        <select style={{ width: 360, minWidth: 300, maxWidth: '100%' }} value={facility} onChange={e => {
          const opt = facilityOptions.find(o => o.name === e.target.value)
          setFacility(e.target.value)
          setFacilityId(opt?.id ?? null)
        }}>
          {facilityOptions.length === 0
            ? <option value="">No facilities available</option>
            : facilityOptions.map(o => <option key={o.name}>{o.name}</option>)
          }
        </select>
        {calcMeta && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Last run: {calcMeta.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {calcMeta.facility}</span>}
      </div>

      {/* Independent-review bar. Appears only when a submission is pending review. A Manager gets
          Approve / Reject; every other role sees a read-only "awaiting review" status. */}
      {pendingReview && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          margin: '12px 24px 0', padding: '10px 16px', borderRadius: 8,
          background: '#fff8e6', border: '1px solid var(--amber)',
        }}>
          <Tag variant="pending" style={{ fontSize: 11 }}>Pending independent review</Tag>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>
            Submitted for review by <strong>{reviewSub?.submittedBy ?? 'an analyst'}</strong>.
          </span>
          <div style={{ flex: 1 }} />
          {can('reviewShadowBB') ? (
            <>
              <Button
                variant="secondary"
                disabled={reviewBusy}
                onClick={rejectReview}
              >Reject…</Button>
              <Button
                disabled={reviewBusy}
                onClick={acceptReview}
              >{reviewBusy ? 'Working…' : 'Approve'}</Button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Awaiting Account/Transaction Manager approval.</span>
          )}
        </div>
      )}

      {/* Unsaved-edit preview notice: edited rows show live per-row previews, but every total,
          summary figure and breach verdict stays frozen at the last server run. */}
      {Object.keys(overrideMap).length > 0 && (
        <div style={{
          margin: '12px 24px 0', padding: '10px 16px', borderRadius: 8,
          background: '#fff8e6', border: '1px solid var(--amber)', fontSize: 12, color: 'var(--text)',
        }}>
          <strong style={{ color: '#8a6d00' }}>Unsaved changes</strong> — edited rows show a live
          preview; totals, summary and breach results are frozen at the last run. Re-run Shadow BB
          to refresh.
        </div>
      )}

      <div style={{ padding: '16px 24px 0' }}>
        <Card title="Portfolio & BB Summary"
          action={shadowRows.length > 0 ? <button onClick={() => setSummaryHidden(h => !h)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 8px', cursor: 'pointer' }}>{summaryHidden ? 'Show' : 'Hide'}</button> : undefined}>
          {!summaryHidden && (shadowRows.length === 0 || !summaryExt) && (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              No summary available — select a facility and run the Shadow BB to populate this panel.
            </div>
          )}
          {!summaryHidden && shadowRows.length > 0 && summaryExt && (
            <div style={{ display: 'flex', gap: 12, padding: '12px 18px 16px', overflowX: 'auto', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 0', minWidth: 190, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryKVTable title="LP Portfolio" rows={[
                  { k: 'Total Capital Commitments', v: fmtMoneyM(summaryExt.totalCapCommit), bold: true },
                  { k: 'Total Called Capital',       v: fmtMoneyM(summaryExt.totalCalledCap) },
                  { k: '% of Called Capital',        v: summaryExt.pctLpCalled ? p(summaryExt.pctLpCalled) : '—' },
                  { k: 'Total Uncalled Capital',     v: fmtMoneyM(summaryExt.totalAllUncalled), bold: true },
                  { k: '# of Limited Partners',      v: summaryExt.totalLPs.toLocaleString(), bold: true },
                  { k: '% Institutional',            v: p(summaryExt.pctInstitutional) },
                  { k: '% HNW',                      v: p(summaryExt.pctHNW) },
                  { k: '% Top 10',                   v: p(summaryExt.pctTop10) },
                  { k: '% Top 20',                   v: p(summaryExt.pctTop20) },
                  { k: 'Investment Grade',            v: formatPercentageFraction(summaryExt.igRatio) },
                  { k: '% Uncalled from LPs > $25bn AUM', v: summaryExt.pctUncalledGt25bnAum ? p(summaryExt.pctUncalledGt25bnAum) : '—' },
                ]} />
              </div>
              <div style={{ flex: '1 1 0', minWidth: 190, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryKVTable title="Borrowing Base" rows={[
                  { k: 'Total Facility Size',    v: fmtMoneyM(summaryExt.facilitySize),       bold: true },
                  { k: 'UBS Participation',      v: fmtMoneyM(summaryExt.ubsParticipation),  bold: true },
                  { k: 'UBS Participation Rate', v: summaryExt.ubsParticipationPct ? p(summaryExt.ubsParticipationPct) : '—' },
                  { k: 'Facility LTV',           v: summaryExt.facilityLTV ? p(summaryExt.facilityLTV) : '—' },
                  { k: 'Available Commitment',   v: fmtMoneyM(summaryExt.availableCommit),   bold: true },
                  { k: 'Current Facility Advance Rate', v: summaryExt.facilityAdvRate ? p(summaryExt.facilityAdvRate) : '—' },
                  { k: 'Agent Borrowing Base',   v: fmtMoneyM(summaryExt.agentBBRaw),         bold: true, hl: 'agent' },
                  { k: 'UBS Borrowing Base',     v: fmtMoneyM(summaryExt.ubsBBRaw),           bold: true },
                  { k: 'UBS Advance Rate',       v: p(summaryExt.ubsAdvRate),                        hl: 'ubs-rate' },
                  { k: 'EAR Differential',       v: p(summaryExt.ubsAdvRate - summaryExt.facilityAdvRate) },
                  { k: 'Uncalled to Facility',   v: summaryExt.facilitySize > 0 ? p(summaryExt.totalAllUncalled / summaryExt.facilitySize) : '—' },
                  { k: 'BB to Facility',         v: summaryExt.facilitySize > 0 ? p(summaryExt.agentBBRaw / summaryExt.facilitySize) : '—' },
                  { k: 'Facility to Fund Size',  v: summaryExt.totalCapCommit > 0 ? p(summaryExt.facilitySize / summaryExt.totalCapCommit) : '—' },
                ]} />
              </div>
              <div style={{ flex: '1 1 0', minWidth: 150, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryBreakTable title="BUSA" rows={summaryExt.busaBreakdown} full={false}/>
              </div>
              <div style={{ flex: '1 1 0', minWidth: 150, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryBreakTable title="Agent" rows={summaryExt.agentBreakdown} full={false}/>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Concentration breach table — persisted with the snapshot, evaluated against the
          Concentration Limits config at run time. Stays visible while edits are pending (frozen
          at the last run); the unsaved-changes banner above explains the freeze. */}
      {snapshotBreaches.length > 0 && (() => {
        const rows         = toBreachDisplayRows(snapshotBreaches)
        const hardBreaches = rows.filter(r => r.severity === 'breach')
        const warnings     = rows.filter(r => r.severity === 'warning')
        const breachTable = (list: typeof rows, color: string) => (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['Rule', 'Detail', 'Current', 'Limit'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '3px 10px', color: 'var(--navy)', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: '3px 10px', fontWeight: 600 }}>{r.rule}</td>
                  <td style={{ padding: '3px 10px', color: 'var(--muted)' }}>{r.detail}</td>
                  <td style={{ padding: '3px 10px', fontWeight: 700, color }}>{r.current}</td>
                  <td style={{ padding: '3px 10px' }}>{r.limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
        return (
          <div style={{ padding: '12px 24px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hardBreaches.length > 0 && (
              <div style={{ background: 'var(--red-lt)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', padding: '10px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: breachHidden ? 0 : 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--red)' }}>
                    ⚠ {hardBreaches.length} Concentration Limit {hardBreaches.length === 1 ? 'Breach' : 'Breaches'} — must resolve before submitting certificate
                  </div>
                  <button onClick={() => setBreachHidden(h => !h)}
                    style={{ fontSize: 11, color: 'var(--red)', background: 'transparent', border: '1px solid var(--red)', borderRadius: 3, padding: '2px 8px', cursor: 'pointer' }}>
                    {breachHidden ? 'Show' : 'Hide'}
                  </button>
                </div>
                {!breachHidden && breachTable(hardBreaches, 'var(--red)')}
              </div>
            )}
            {warnings.length > 0 && (
              <div style={{ background: 'var(--amber-lt)', border: '1px solid var(--amber)', borderRadius: 'var(--radius)', padding: '10px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: warningHidden ? 0 : 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--amber)' }}>
                    ⚠ {warnings.length} Concentration {warnings.length === 1 ? 'Warning' : 'Warnings'} — approaching limit
                  </div>
                  <button onClick={() => setWarningHidden(h => !h)}
                    style={{ fontSize: 11, color: 'var(--amber)', background: 'transparent', border: '1px solid var(--amber)', borderRadius: 3, padding: '2px 8px', cursor: 'pointer' }}>
                    {warningHidden ? 'Show' : 'Hide'}
                  </button>
                </div>
                {!warningHidden && breachTable(warnings, 'var(--amber)')}
              </div>
            )}
          </div>
        )
      })()}

      <div style={{ padding: '0 24px 24px' }}>
        <div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Card title="LP-Level Shadow BB" subtitle={`${facility} · Conc. Limit: $${bbParams.concLimitM.toFixed(0)}M per LPRecord`}
              action={(
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select style={{ width: 160 }} value={clsFilter} onChange={e => setClsFilter(e.target.value)}>
                    <option value="">Classification: All</option>
                    {clsOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <InfoTip title="Column Guide" items={bbColumnItems} width={340} />
                  <span
                    onClick={facilityInactive ? explainInactiveRerun : undefined}
                    style={{ display: 'inline-flex', cursor: facilityInactive ? 'not-allowed' : undefined }}
                    title={facilityInactive ? 'Re-run is unavailable while the facility is inactive' : undefined}
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleRerunShadowBB}
                      disabled={rerunning || facilityId == null || shadowRows.length === 0 || facilityInactive}
                      style={facilityInactive ? { pointerEvents: 'none' } : undefined}
                    >
                      {rerunning ? 'Re-running...' : 'Re-run Shadow BB'}
                    </Button>
                  </span>
                  <Button variant="secondary" size="sm" disabled={!summaryExt} onClick={() => {
                    if (!summaryExt) return
                    // Exports what the screen shows: the sorted, classification-filtered rows.
                    const exportRows = buildShadowExportRows({
                      rows: sortedRows, overrides, editedKeys: overrideMap, ranks: rankByKey,
                      totalCommitM, totalUncalledM, frozenTotalABB, frozenTotalUBB,
                    })
                    void exportShadowBB(facility, summaryExt, exportRows)
                      .then(() => toast('Shadow BB exported to Excel.'))
                      .catch(() => toast('Could not export Shadow BB Excel.'))
                  }}>↓ Export</Button>
                </div>
              )}>
              <div style={{ position: 'relative' }}>
                <div className="data-table-wrap">
                  <table className="data-table dense" style={{ tableLayout: 'fixed', width: bbTableWidth, minWidth: bbTableWidth }}>
                    <ShadowResultsTableHead sort={sort} onSort={requestSort} widths={bbWidths} onResizeStart={bbResizeStart} />
                    <tbody>
                      {pageItems.map(LPRecord => {
                        const key = LPRecord._key
                        const ov = overrides[key] ?? {} as Override
                        const selected = key === selectedKey
                        const c = calcRow(ov, totalCommitM, totalUncalledM)
                        // BB figures: live preview for rows with pending edits, otherwise the
                        // frozen snapshot values (shares against the frozen portfolio totals).
                        const edited      = overrideMap[key] != null
                        const agentExcV   = edited ? c.agentExcess : LPRecord.agentExcessM ?? 0
                        const ubsExcV     = edited ? c.ubsExcess : LPRecord.concExcessM
                        const agentBBV    = edited ? c.agentBBCalc : LPRecord.abbM
                        const ubsBBV      = edited ? c.ubsBBCalc : LPRecord.ubbM
                        const pctAgentBBV = edited
                          ? (frozenTotalABB > 0 ? c.agentBBCalc / frozenTotalABB : 0)
                          : LPRecord.pctAgentBB ?? 0
                        const pctUbsBBV   = edited
                          ? (frozenTotalUBB > 0 ? c.ubsBBCalc / frozenTotalUBB : 0)
                          : LPRecord.pctUbsBB ?? 0
                        const includedV   = edited ? c.included : !!(LPRecord.included && LPRecord.ubsLpCategory !== 'Excluded')
                        const n = ov.investorName || LPRecord.investorName || LPRecord._agentName || '—'
                        const st = saveStatuses[key]
                        return (
                          <tr key={key} className={selected ? 'data-table-row-selected' : undefined} onClick={() => setSelectedKey(key)} style={{ cursor: 'pointer' }}>
                            <td className="num">{rankByKey[key] ?? '—'}</td>
                            <td title={n}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                                <span style={{ fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                                {LPRecord.reclassified && <span className="rcl-badge" title="Reclassified" aria-label="Reclassified">R</span>}
                                {LPRecord.transferee && <span className="tf-badge">T</span>}
                                {st === 'saving' && <span style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>Saving…</span>}
                                {st === 'saved'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>Saved</span>}
                                {st === 'error'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--danger)', flexShrink: 0 }}>Error</span>}
                              </div>
                            </td>
                            <td title={ov.parent || '—'}>{ov.parent || '—'}</td>
                            <td>{ov.spv ? 'Yes' : 'No'}</td>
                            <td>{formatRegion(ov.regionLocation || LPRecord.regionLocation) || '—'}</td>
                            <td title={ov.investorType || LPRecord.investorType || '—'}>{ov.investorType || LPRecord.investorType || '—'}</td>
                            <td>{ov.institutionalOrHnw || '—'}</td>
                            <td title={ov.agentLpCategory || '—'}>{ov.agentLpCategory || '—'}</td>
                            <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: ov.ubsLpCategory ? undefined : 'var(--danger)' }} title={ov.ubsLpCategory || 'Unclassified'}><Tag>{ov.ubsLpCategory || 'Unclassified'}</Tag></td>
                            <td style={{ textAlign: 'center' }}><YesNo val={includedV} /></td>
                            <td>{ov.investmentGrade ? 'Yes' : 'No'}</td>
                            <td>{ov.spRating || '—'}</td>
                            <td>{ov.moodysRating || '—'}</td>
                            <td>{ov.fitchRating || '—'}</td>
                            <td>{ov.lpSizeCriteria || '—'}</td>
                            <td className="num" title={ov.lpSizeBil || '—'}>{lpSizeFormat(ov.lpSizeBil)}</td>
                            <td className="num">{ov.capitalCommitment ? fmtFull(parseMoneyM(ov.capitalCommitment)) : '—'}</td>
                            <td className="num">{fmtPct(c.cmtPct)}</td>
                            <td className="num">{fmtFull(c.calledM)}</td>
                            <td className="num">{ov.ucM ? fmtFull(parseMoneyM(ov.ucM)) : '—'}</td>
                            <td className="num">{fmtPct(c.pctOfFundUncalled)}</td>
                            <td className="num">{fmtPct(c.pctLpCalled)}</td>
                            <td className="num">{pctStr(ov.agentRatePct)}</td>
                            <td className="num">{pctStr(ov.ubsAdvRatePct)}</td>
                            <td className="num">{pctStr(ov.agentConcLimitPct)}</td>
                            <td className="num">{pctStr(ov.concLimitPct)}</td>
                            <td className={`num ${agentExcV === 0 ? 'zero' : ''}`}>{fmtFull(agentExcV)}</td>
                            <td className={`num ${ubsExcV === 0 ? 'zero' : ''}`}>{fmtFull(ubsExcV)}</td>
                            <td className={`num ${agentBBV === 0 ? 'zero' : ''}`}>{fmtFull(agentBBV)}</td>
                            <td className="num">{pctAgentBBV > 0 ? fmtPct(pctAgentBBV) : '—'}</td>
                            <td className={`num ${ubsBBV === 0 ? 'zero' : ''}`}>{fmtFull(ubsBBV)}</td>
                            <td className="num">{pctUbsBBV > 0 ? fmtPct(pctUbsBBV) : '—'}</td>
                            <td title={ov.notes || '—'}>{ov.notes || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="tbl-footer">
                  <span>Showing {from}–{to} of {filtered.length} LPs &nbsp;·&nbsp; {compact ? fmtM(frozenTotalUBB) : fmtMoneyM(frozenTotalUBB, true)} UBS BB &nbsp;·&nbsp; {compact ? fmtM(summary.bbDelta ?? 0) : fmtMoneyM(summary.bbDelta ?? 0, true)} delta</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {total > 15 && <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}>{PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}</select>}
                    {totalPages > 1 && (<><Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>‹ Prev</Button><span style={{ fontSize: 11, color: 'var(--muted)' }}>Page {page} of {totalPages}</span><Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next ›</Button></>)}
                  </div>
                </div>
                {selectedLP && selectedKey && overrides[selectedKey] && (
                  <DraggablePanel className="LPRecord-detail-overlay" storageKey="shadow-bb-LPRecord-record">
                    <LPRecordPanel
                      LPRecord={sbOvToLP(selectedLP, overrides[selectedKey])}
                      open={true}
                      running={false}
                      canEdit={loadError == null}
                      onClose={() => setSelectedKey(null)}
                      onSave={saved => saveDraft(sbLpToOv(saved, overrides[selectedKey]))}
                      totalAgentBB={frozenTotalABB}
                      totalUbsBB={frozenTotalUBB}
                      totalUncalledM={totalUncalledM}
                      showRank
                    />
                  </DraggablePanel>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
