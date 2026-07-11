import { useState, useMemo, useEffect, useRef } from 'react'
import { utils, writeFile } from 'xlsx'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { SortableHeader, useSortableRows, type SortSpec } from '../../hooks/useTableSort'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DraggablePanel from '../../components/ui/DraggablePanel'
import { formatRegion } from '../../config/regionReference'
import { useApp } from '../../context/AppContext'
import { computePortfolioBB, fmtM, fmtPct, getFacilityBBSnapshot, getFacilitySummaryExt, parseM } from '../../services/bbCalculationService'
import { getLPsForFacility } from '../../services/lpService'
import { getFacilities } from '../../services/facilityService'
import type { FacilityRow } from '../../services/facilityService'
import InfoTip from '../../components/ui/InfoTip'
import type { LPRecord } from '../../services/lpService'
import type { ComputedLPRecord, BBSummaryExt } from '../../services/bbCalculationService'
import { api } from '../../services/api'
import type { LpClassificationRequest } from '../../services/api'
import { BREACH_TYPE_LABEL } from '../../services/reportService'
import type { BBBreach } from '../../types/bb'
import { buildBusaRateFractions, busaClassificationOptions, getClassificationConfig, type ClassificationConfig } from '../../services/configService'
import {
  YesNo,
  calcRow, fmtBillionDisplay, fmtFull, parseMoneyM, parsePct, pctStr,
  type Override, type SubmissionLP,
} from '../RunShadowBB'
import { useColumnResize, type ColWidths } from '../../hooks/useColumnResize'
import LPRecordPanel from '../../components/ui/LPRecordPanel'
import Tag from '../../components/ui/Tag'
import { competitionRank } from '../../utils/rank'

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

type ClsBucket = 'Rated Investors' | 'Unrated Investors' | 'Eligible Investors' | 'Excluded Investors'
function canonicalClassBucket(cls: string | null | undefined): ClsBucket {
  switch (cls) {
    case 'Rated Investor': case 'Rated':
      return 'Rated Investors'
    case 'FoF & Other > $10Bn AUM': case 'Corp Pension > $5Bn Assets': case 'Unrated NAV > $1Bn':
    case 'Unrated >2bn': case 'Unrated 1–2bn':
      return 'Unrated Investors'
    case 'Other Institutional': case 'Eligible': case 'Included (PWM)':
      return 'Eligible Investors'
    case 'Excluded':
      return 'Excluded Investors'
    default:
      return cls ? 'Eligible Investors' : 'Excluded Investors'
  }
}

function parseAumM(s: string | null | undefined): number {
  if (!s) return 0
  const m = String(s).match(/\$?\s*([\d,.]+)\s*([KMBT]?)/i)
  if (!m) return 0
  const val  = parseFloat(m[1].replace(/,/g, ''))
  const unit = m[2].toUpperCase()
  const mult = unit === 'T' ? 1e6 : unit === 'B' ? 1e3 : unit === 'K' ? 1e-3 : 1
  return val * mult
}

const BLUE_HD: React.CSSProperties = { background: '#0F2560', color: '#fff', padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase' }
const COL_HD: React.CSSProperties  = { padding: '7px 10px', color: 'var(--muted)', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', borderBottom: '1px solid var(--border)', background: 'var(--tbl)' }
const CELL: React.CSSProperties    = { padding: '3px 10px', color: 'var(--text)', fontSize: 11 }

const SHADOW_RESULTS_INITIAL_WIDTHS: ColWidths = {
  rank: 64, name: 220, parent: 160, spv: 54,
  region: 140, investorType: 140, instVsHnw: 152, agentCls: 166, cls: 174,
  included: 72, ig: 114, sp: 76, mdy: 84, fitch: 76,
  lpSizeCriteria: 107, lpSizeBil: 134, capCommit: 138, cmtPct: 157,
  calledM: 106, ucM: 116, pctUncalled: 128, pctCalled: 104,
  agentRatePct: 120, ubsAdvRatePct: 114, agentConcLimitPct: 158,
  concLimitPct: 144, agentExcess: 164, ubsExcess: 154,
  agentBBCalc: 138, pctAgentBB: 110, ubsBBCalc: 128, pctUbsBB: 110, notes: 180,
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
        <SortableHeader sortKey="instVsHnw"         sort={sort} onSort={onSort} style={{ width: w('instVsHnw') }}                     onResizeStart={onResizeStart}>Institutional vs HNW</SortableHeader>
        <SortableHeader sortKey="agentCls"          sort={sort} onSort={onSort} style={{ width: w('agentCls') }}                      onResizeStart={onResizeStart}>Agent LP Classification</SortableHeader>
        <SortableHeader sortKey="cls"               sort={sort} onSort={onSort} style={{ width: w('cls') }}                           onResizeStart={onResizeStart}>UBS LP Classification</SortableHeader>
        <SortableHeader sortKey="included"          sort={sort} onSort={onSort} style={{ width: w('included'), textAlign: 'center' }} onResizeStart={onResizeStart}>Eligible</SortableHeader>
        <SortableHeader sortKey="ig"                sort={sort} onSort={onSort} style={{ width: w('ig') }}                            onResizeStart={onResizeStart}>Investment Grade</SortableHeader>
        <SortableHeader sortKey="sp"                sort={sort} onSort={onSort} style={{ width: w('sp') }}                            onResizeStart={onResizeStart}>S&amp;P</SortableHeader>
        <SortableHeader sortKey="mdy"               sort={sort} onSort={onSort} style={{ width: w('mdy') }}                           onResizeStart={onResizeStart}>Moody's</SortableHeader>
        <SortableHeader sortKey="fitch"             sort={sort} onSort={onSort} style={{ width: w('fitch') }}                         onResizeStart={onResizeStart}>Fitch</SortableHeader>
        <SortableHeader sortKey="lpSizeCriteria"    sort={sort} onSort={onSort} style={{ width: w('lpSizeCriteria') }}                onResizeStart={onResizeStart}>Size Measure</SortableHeader>
        <SortableHeader sortKey="lpSizeBil"         sort={sort} onSort={onSort} className="num" style={{ width: w('lpSizeBil') }}     onResizeStart={onResizeStart}>LP Size</SortableHeader>
        <SortableHeader sortKey="capCommit"         sort={sort} onSort={onSort} className="num" style={{ width: w('capCommit') }}     onResizeStart={onResizeStart}>Capital Commitments</SortableHeader>
        <SortableHeader sortKey="cmtPct"            sort={sort} onSort={onSort} className="num" style={{ width: w('cmtPct') }}        onResizeStart={onResizeStart}>% of Capital Commitments</SortableHeader>
        <SortableHeader sortKey="calledM"           sort={sort} onSort={onSort} className="num" style={{ width: w('calledM') }}       onResizeStart={onResizeStart}>Called Capital</SortableHeader>
        <SortableHeader sortKey="ucM"               sort={sort} onSort={onSort} className="num" style={{ width: w('ucM') }}           onResizeStart={onResizeStart}>Uncalled Capital</SortableHeader>
        <SortableHeader sortKey="pctUncalled"       sort={sort} onSort={onSort} className="num" style={{ width: w('pctUncalled') }}   onResizeStart={onResizeStart}>% of Uncalled Capital</SortableHeader>
        <SortableHeader sortKey="pctCalled"         sort={sort} onSort={onSort} className="num" style={{ width: w('pctCalled') }}     onResizeStart={onResizeStart}>% of LP Called</SortableHeader>
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
  const n = parseFloat(String(raw ?? '').replace('%', '').trim())
  return Number.isFinite(n) ? `${Math.round(n)}%` : String(raw ?? '').trim()
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
            <td style={{ ...CELL, textAlign: 'right', color: 'var(--muted)' }}>{r.pct === 0 ? '0%' : `${(r.pct * 100).toFixed(0)}%`}</td>
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

function exportShadowBB(facility: string, ext: BBSummaryExt, rows: ComputedLPRecord[]) {
  const pctStr = (n: number) => `${(n * 100).toFixed(0)}%`
  type Cell = string | number
  const summaryAoa: Cell[][] = [
    ['LP Portfolio', ''],
    ['Total Capital Commitments', fullDollar(ext.totalCapCommit)],
    ['Total Called Capital', fullDollar(ext.totalCalledCap)],
    ['% of Called Capital', ext.pctCalled ? pctStr(ext.pctCalled) : '—'],
    ['Total Uncalled Capital', fullDollar(ext.totalAllUncalled)],
    ['# of Limited Partners', ext.totalLPs],
    ['% Institutional', pctStr(ext.pctInstitutional)],
    ['% HNW', pctStr(ext.pctHNW)],
    ['% Top 10', pctStr(ext.pctTop10)],
    ['% Top 20', pctStr(ext.pctTop20)],
    ['Investment Grade', `${(ext.igRatio * 100).toFixed(1)}%`],
    ['% Uncalled from LPs > $25bn AUM', ext.pctUncalledGt25bnAum ? pctStr(ext.pctUncalledGt25bnAum) : '—'],
    [],
    ['Borrowing Base', ''],
    ['Total Facility Size', fullDollar(ext.facilitySize)],
    ['UBS Participation', fullDollar(ext.ubsParticipation)],
    ['UBS Participation Rate', ext.ubsParticipationPct ? pctStr(ext.ubsParticipationPct) : '—'],
    ['Facility LTV', ext.facilityLTV ? pctStr(ext.facilityLTV) : '—'],
    ['Available Commitment', fullDollar(ext.availableCommit)],
    ['Current Facility Advance Rate', ext.facilityAdvRate ? pctStr(ext.facilityAdvRate) : '—'],
    ['Agent Borrowing Base', fullDollar(ext.agentBBRaw)],
    ['UBS Borrowing Base', fullDollar(ext.ubsBBRaw)],
    ['UBS Advance Rate', pctStr(ext.ubsAdvRate)],
    ['EAR Differential', pctStr(ext.ubsAdvRate - ext.facilityAdvRate)],
    ['Uncalled to Facility', ext.facilitySize > 0 ? pctStr(ext.totalAllUncalled / ext.facilitySize) : '—'],
    ['BB to Facility', ext.facilitySize > 0 ? pctStr(ext.agentBBRaw / ext.facilitySize) : '—'],
    ['Facility to Fund Size', ext.totalCapCommit > 0 ? pctStr(ext.facilitySize / ext.totalCapCommit) : '—'],
    [],
  ]
  const pushBreak = (title: string, labelHeader: string, bk: BkRow[]) => {
    summaryAoa.push([title, '', '', ''], [labelHeader, '#', '$', '%'])
    let tc = 0, td = 0
    for (const r of bk) {
      summaryAoa.push([r.rate ?? r.label ?? '', r.count, fullDollar(r.dollars), r.pct === 0 ? '0%' : pctStr(r.pct)])
      tc += r.count; td += r.dollars
    }
    summaryAoa.push(['Total', tc, fullDollar(td), td > 0 ? '100%' : '—'], [])
  }
  pushBreak('BUSA', 'Rate', ext.busaBreakdown)
  pushBreak('Agent', 'Rate', ext.agentBreakdown)
  pushBreak('LP Category', 'Classification', ext.clsBreakdown)

  const detailAoa: Cell[][] = [['Investor Name', 'Classification', 'Uncalled', 'UBS Eligible', 'Conc. Excess', 'Rate', 'UBS BB', 'Agent BB', 'Delta', 'Included']]
  for (const LPRecord of rows) {
    detailAoa.push([
      LPRecord.name ?? '', LPRecord.cls ?? '',
      fullDollar(LPRecord.ucM), fullDollar(LPRecord.uecM), fullDollar(LPRecord.concExcessM),
      LPRecord.rate ?? '', fullDollar(LPRecord.ubbM), fullDollar(LPRecord.abbM), fullDollar(LPRecord.deltaM),
      LPRecord.inc && LPRecord.cls !== 'Excluded' ? 'Y' : 'N',
    ])
  }

  const wb = utils.book_new()
  utils.book_append_sheet(wb, utils.aoa_to_sheet(summaryAoa), 'Summary')
  utils.book_append_sheet(wb, utils.aoa_to_sheet(detailAoa), 'LP Record')
  writeFile(wb, `Shadow_BB_${(facility || 'facility').replace(/[^\w.-]+/g, '_')}.xlsx`)
}

function pctFromConc(value: string | undefined | null, totalUncalledM: number): number | '' {
  if (!value) return ''
  if (String(value).includes('%')) return parsePct(value)
  const concM = parseMoneyM(value)
  return concM > 0 && totalUncalledM > 0 ? Number(((concM / totalUncalledM) * 100).toFixed(2)) : ''
}

function buildOverride(LPRecord: ComputedLPRecord, totalUncalledM: number, defaultConcLimitPct: number | ''): Override {
  const lpSizeCriteria = LPRecord.aum ? 'AUM' : LPRecord.nav ? 'NAV' : LPRecord.pension ? 'Assets' : ''
  return {
    name:              LPRecord.name ?? '',
    parent:            LPRecord.parent ?? '',
    spv:               !!LPRecord.spv,
    investorType:      LPRecord.investorType ?? '',
    instVsHnw:         LPRecord.instVsHnw ?? 'Institutional',
    ig:                !!LPRecord.ig,
    cls:               LPRecord.cls ?? '',
    agentCls:          LPRecord.agentCls ?? '',
    region:            LPRecord.region ?? '',
    fundSleeve:        LPRecord.fundSleeve ?? '',
    sp:                LPRecord.sp && LPRecord.sp !== 'NR' ? LPRecord.sp : '',
    mdy:               LPRecord.mdy && LPRecord.mdy !== 'NR' ? LPRecord.mdy : '',
    fitch:             LPRecord.fitch && LPRecord.fitch !== 'NR' ? LPRecord.fitch : '',
    lpSizeBil:         LPRecord.aum || LPRecord.nav || LPRecord.pension || '',
    lpSizeCriteria,
    capCommit:         LPRecord.capCommit ?? '',
    ucM:               LPRecord.uc ?? '',
    ubsAdvRatePct:     parsePct(LPRecord.rate),
    agentRatePct:      parsePct(LPRecord.agentRate),
    concLimitPct:      pctFromConc(LPRecord.ubsConc, totalUncalledM) || defaultConcLimitPct,
    agentConcLimitPct: pctFromConc(LPRecord.agentConc, totalUncalledM),
    inc:               !!LPRecord.inc,
    notes:             LPRecord.notes ?? '',
  }
}

function overrideToLPRecord(ov: Override, totalUncalledM: number): Partial<LPRecord> & { concLimitM?: number } {
  const concLimitM = typeof ov.concLimitPct === 'number' ? (ov.concLimitPct / 100) * totalUncalledM : undefined
  return {
    name: ov.name,
    parent: ov.parent,
    spv: ov.spv,
    investorType: ov.investorType || undefined,
    instVsHnw: ov.instVsHnw as LPRecord['instVsHnw'],
    ig: ov.ig,
    cls: (ov.cls as LPRecord['cls']) || undefined,
    agentCls: ov.agentCls || undefined,
    region: (ov.region as LPRecord['region']) || undefined,
    fundSleeve: ov.fundSleeve || undefined,
    sp: ov.sp || undefined,
    mdy: ov.mdy || undefined,
    fitch: ov.fitch || undefined,
    aum: ov.lpSizeCriteria === 'AUM' ? ov.lpSizeBil || undefined : undefined,
    nav: ov.lpSizeCriteria === 'NAV' ? ov.lpSizeBil || undefined : undefined,
    pension: ov.lpSizeCriteria === 'Assets' ? ov.lpSizeBil || undefined : undefined,
    capCommit: ov.capCommit || undefined,
    uc: ov.ucM || undefined,
    rate: typeof ov.ubsAdvRatePct === 'number' ? `${ov.ubsAdvRatePct}%` : undefined,
    agentRate: typeof ov.agentRatePct === 'number' ? `${ov.agentRatePct}%` : undefined,
    ubsConc: typeof ov.concLimitPct === 'number' ? `${ov.concLimitPct}%` : undefined,
    agentConc: typeof ov.agentConcLimitPct === 'number' ? `${ov.agentConcLimitPct}%` : undefined,
    concLimitM,
    inc: ov.inc,
    notes: ov.notes ?? '',
  }
}

type BBResult = ReturnType<typeof computePortfolioBB>

export default function ShadowBB() {
  const { bbParams, toast, targetFacility, setTargetFacility } = useApp()
  const [facilityOptions, setFacilityOptions] = useState<{ id?: number; name: string }[]>([])
  const [facilityRows,    setFacilityRows]    = useState<FacilityRow[]>([])
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

  // Raw LP records + snapshot kept in state so local overrides can trigger recomputation.
  const [rawLPs,       setRawLPs]       = useState<LPRecord[]>([])
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
  const busaRates = useMemo(() => classCfg ? buildBusaRateFractions(classCfg) : {}, [classCfg])
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
      const opts = fs.map(f => ({ id: f.id, name: f.name }))
      setFacilityOptions(opts)
      setFacilityRows(fs)
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
      setSnapshot(snap.summary)
      setSnapshotBreaches(snap.breaches)
      setOverrideMap({})
      setCalcMeta({ facility, ts: new Date() })
      setSelectedKey(null)
      setClsFilter('')
      if (ext) setSummaryExtApi(ext)
    }).catch(e => setLoadError(String(e)))
  }, [facility, facilityId])

  // Re-run the BB engine whenever rawLPs or overrideMap changes. When no overrides exist,
  // patch in the server snapshot summary so the persisted figures show correctly.
  const result = useMemo<BBResult>(() => {
    if (rawLPs.length === 0) return computePortfolioBB([], bbParams, busaRates)
    const merged = rawLPs.map(LPRecord => ({ ...LPRecord, ...(overrideMap[LPRecord.name ?? ''] ?? {}) }))
    const computed = computePortfolioBB(merged, bbParams, busaRates)
    const hasOverrides = Object.keys(overrideMap).length > 0
    return hasOverrides || Object.keys(snapshot).length === 0
      ? computed
      : { ...computed, summary: { ...computed.summary, ...snapshot }, breaches: [] }
  }, [rawLPs, overrideMap, bbParams, snapshot, busaRates])

  const resultTotalUncalledM = useMemo(
    () => (result.lps as ComputedLPRecord[]).reduce((s, LPRecord) => s + LPRecord.ucM, 0),
    [result.lps],
  )
  const defaultConcLimitPct = useMemo(
    () => resultTotalUncalledM > 0 ? Number(((bbParams.concLimitM / resultTotalUncalledM) * 100).toFixed(2)) : '',
    [bbParams.concLimitM, resultTotalUncalledM],
  )

  const shadowRows = useMemo<SubmissionLP[]>(
    () => (result.lps as ComputedLPRecord[]).map(LPRecord => ({
      ...LPRecord,
      _key: LPRecord.name ?? '',
      _isNew: false,
      _agentName: LPRecord.name ?? '',
    })),
    [result.lps],
  )

  const overrides = useMemo<Record<string, Override>>(
    () => Object.fromEntries((result.lps as ComputedLPRecord[]).map(LPRecord => [LPRecord.name ?? '', buildOverride(LPRecord, resultTotalUncalledM, defaultConcLimitPct)])),
    [result.lps, resultTotalUncalledM, defaultConcLimitPct],
  )

  const totalCommitM = useMemo(
    () => Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.capCommit), 0),
    [overrides],
  )
  const totalUncalledM = useMemo(
    () => Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.ucM), 0),
    [overrides],
  )

  const totalAgentBBCalc = useMemo(
    () => Object.values(overrides).reduce((s, ov) => s + calcRow(ov, totalCommitM, totalUncalledM).agentBBCalc, 0),
    [overrides, totalCommitM, totalUncalledM],
  )

  const totalUbsBBCalc = useMemo(
    () => Object.values(overrides).reduce((s, ov) => s + calcRow(ov, totalCommitM, totalUncalledM).ubsBBCalc, 0),
    [overrides, totalCommitM, totalUncalledM],
  )

  const rankByKey = useMemo(() => {
    const persistedRanks = Object.fromEntries(
      shadowRows
        .filter(LPRecord => typeof LPRecord.rank === 'number')
        .map(LPRecord => [LPRecord._key, LPRecord.rank as number]),
    )
    if (Object.keys(persistedRanks).length > 0) return persistedRanks

    return competitionRank(
      shadowRows,
      LPRecord => LPRecord._key,
      LPRecord => parseMoneyM(overrides[LPRecord._key]?.ucM),
      (a, b) => (a.name ?? a._agentName ?? '').localeCompare(b.name ?? b._agentName ?? ''),
    )
  }, [shadowRows, overrides])

  const selectedLP = useMemo(
    () => (selectedKey ? shadowRows.find(r => r._key === selectedKey) ?? null : null),
    [shadowRows, selectedKey],
  )

  const sbOvToLP = (LPRecord: SubmissionLP, ov: Override): LPRecord => ({
    ...(LPRecord as LPRecord),
    name:        ov.name || LPRecord.name || LPRecord._agentName || '',
    parent:      ov.parent ?? '', spv: ov.spv, instVsHnw: ov.instVsHnw as LPRecord['instVsHnw'], investorType: ov.investorType ?? LPRecord.investorType ?? '',
    ig:          ov.ig,
    cls:         (ov.cls || '') as LPRecord['cls'], clsTag: LPRecord.clsTag ?? '',
    agentCls:    ov.agentCls, region: (ov.region || LPRecord.region || '') as LPRecord['region'],
    fundSleeve:  ov.fundSleeve ?? LPRecord.fundSleeve,
    sp:          ov.sp ?? '', mdy: ov.mdy ?? '', fitch: ov.fitch ?? '',
    aum:         ov.lpSizeCriteria === 'AUM' ? (ov.lpSizeBil || '') : (LPRecord.aum ?? ''),
    nav:         ov.lpSizeCriteria === 'NAV' ? (ov.lpSizeBil || '') : (LPRecord.nav ?? ''),
    pension:     LPRecord.pension ?? '', pensionFunded: LPRecord.pensionFunded ?? '',
    capCommit:   ov.capCommit ?? '', uc: ov.ucM != null ? String(ov.ucM) : (LPRecord.uc ?? ''),
    rate:        typeof ov.ubsAdvRatePct === 'number' ? `${ov.ubsAdvRatePct}%` : (LPRecord.rate ?? ''),
    agentRate:   typeof ov.agentRatePct  === 'number' ? `${ov.agentRatePct}%`  : (LPRecord.agentRate ?? ''),
    agentConc:   typeof ov.agentConcLimitPct === 'number' ? `${ov.agentConcLimitPct}%` : (LPRecord.agentConc ?? ''),
    ubsConc:     typeof ov.concLimitPct === 'number' ? `${ov.concLimitPct}%` : (LPRecord.ubsConc ?? ''),
    inc: ov.inc, notes: ov.notes ?? '', rcl: LPRecord.rcl ?? false, tf: LPRecord.tf ?? false, hq: LPRecord.hq ?? false,
    abb: LPRecord.abb ?? '', ubb: LPRecord.ubb ?? '', delta: LPRecord.delta ?? '', uec: LPRecord.uec ?? '',
    pctCapCommit: LPRecord.pctCapCommit ?? '', calledCap: LPRecord.calledCap ?? '',
    pctUncalled: LPRecord.pctUncalled ?? '', pctCalled: LPRecord.pctCalled ?? '',
    agentExcessConc: LPRecord.agentExcessConc, ubsExcessConc: LPRecord.ubsExcessConc,
  })

  const sbLpToOv = (saved: LPRecord, prev: Override): Override => ({
    ...prev,
    name: saved.name, parent: saved.parent ?? '', spv: saved.spv, investorType: saved.investorType ?? '', instVsHnw: saved.instVsHnw ?? '', ig: saved.ig,
    cls: saved.cls ?? '', agentCls: saved.agentCls ?? '',
    region: saved.region ?? '', fundSleeve: saved.fundSleeve ?? '',
    sp: saved.sp ?? '', mdy: saved.mdy ?? '', fitch: saved.fitch ?? '',
    lpSizeBil: saved.aum || saved.nav || saved.pension || '',
    lpSizeCriteria: saved.aum ? 'AUM' : saved.nav ? 'NAV' : saved.pension ? 'Assets' : prev.lpSizeCriteria || '',
    capCommit: saved.capCommit ?? '', ucM: saved.uc ?? prev.ucM,
    ubsAdvRatePct: parsePct(saved.rate) !== '' ? parsePct(saved.rate) : prev.ubsAdvRatePct,
    agentRatePct:  parsePct(saved.agentRate) !== '' ? parsePct(saved.agentRate) : prev.agentRatePct,
    concLimitPct:  parsePct(saved.ubsConc) !== '' ? parsePct(saved.ubsConc) : prev.concLimitPct,
    agentConcLimitPct: parsePct(saved.agentConc) !== '' ? parsePct(saved.agentConc) : prev.agentConcLimitPct,
    inc: saved.inc, notes: saved.notes ?? '',
  })

  const saveDraft = async (draft: Override) => {
    if (!selectedKey) return
    if (loadError) {
      toast('Shadow BB data was not loaded from the database; save is disabled to avoid persisting UI defaults.')
      return
    }
    const lpName = draft.name || selectedKey
    const changes = overrideToLPRecord(draft, totalUncalledM)
    setOverrideMap(prev => {
      const next = { ...prev }
      if (lpName !== selectedKey) delete next[selectedKey]
      next[lpName] = { ...(prev[selectedKey] ?? {}), ...changes }
      return next
    })
    setSelectedKey(lpName)

    if (facilityId == null) return
    setSaveStatuses(s => ({ ...s, [lpName]: 'saving' }))
    try {
      type ClassificationRow = LpClassificationRequest['rows'][number]
      const row: ClassificationRow = {
        name:              lpName,
        originalName:      selectedKey,
        parent:            draft.parent || undefined,
        spv:               draft.spv,
        investorType:      draft.investorType || undefined,
        instVsHnw:         draft.instVsHnw || undefined,
        ig:                draft.ig,
        cls:               draft.cls || undefined,
        agentCls:          draft.agentCls || undefined,
        region:            draft.region || undefined,
        sp:                draft.sp,
        mdy:               draft.mdy,
        fitch:             draft.fitch,
        aum:               draft.lpSizeCriteria === 'AUM' ? draft.lpSizeBil || undefined : undefined,
        nav:               draft.lpSizeCriteria === 'NAV' ? draft.lpSizeBil || undefined : undefined,
        pension:           draft.lpSizeCriteria === 'Assets' ? draft.lpSizeBil || undefined : undefined,
        capCommit:         draft.capCommit || undefined,
        uc:                draft.ucM || undefined,
        ubsAdvRatePct:     typeof draft.ubsAdvRatePct === 'number' ? draft.ubsAdvRatePct : undefined,
        agentRatePct:      typeof draft.agentRatePct === 'number' ? draft.agentRatePct : undefined,
        ubsConcLimitPct:   typeof draft.concLimitPct === 'number' ? draft.concLimitPct : undefined,
        agentConcLimitPct: typeof draft.agentConcLimitPct === 'number' ? draft.agentConcLimitPct : undefined,
        inc:               draft.inc,
        notes:             draft.notes ?? '',
      }
      await api.lpRecords.saveClassification({ facilityId, rows: [row] })
      setSaveStatuses(s => ({ ...s, [lpName]: 'saved' }))
      clearTimeout(saveTimers.current[lpName])
      saveTimers.current[lpName] = setTimeout(() => {
        setSaveStatuses(s => { const n = { ...s }; delete n[lpName]; return n })
      }, 2000)
    } catch (e) {
      setSaveStatuses(s => ({ ...s, [lpName]: 'error' }))
      toast(`Save failed — ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }
  }

  const handleRerunShadowBB = async () => {
    if (facilityId == null) return
    const selectedFacilityId = facilityId
    const selectedFacilityName = facility
    setRerunning(true)
    try {
      const freshSnapshot = await api.bb.run(selectedFacilityId)
      const [lps, ext, facilities] = await Promise.all([
        getLPsForFacility(selectedFacilityId),
        getFacilitySummaryExt(selectedFacilityId),
        getFacilities(),
      ])
      const options = facilities.map(f => ({ id: f.id, name: f.name }))
      const selectedFacility =
        options.find(o => o.id === selectedFacilityId)
        ?? options.find(o => o.name === selectedFacilityName)
      setRawLPs(lps as LPRecord[])
      setSnapshot((freshSnapshot.result.summary as unknown as Record<string, unknown>) ?? {})
      setSnapshotBreaches(freshSnapshot.result.breaches ?? [])
      setSummaryExtApi(ext)
      setFacilityOptions(options)
      setFacilityRows(facilities)
      if (selectedFacility) {
        setFacility(selectedFacility.name)
        setFacilityId(selectedFacility.id ?? selectedFacilityId)
        setTargetFacility(selectedFacility.name)
      }
      setOverrideMap({})
      setSelectedKey(null)
      setCalcMeta({ facility: selectedFacility?.name ?? selectedFacilityName, ts: new Date() })
      toast(`Shadow BB re-run complete - UBS BB ${fmtMoneyM(freshSnapshot.result.summary.totalUBB, true)}.`)
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'Could not re-run Shadow BB - API unavailable.')
    } finally {
      setRerunning(false)
    }
  }

  useEffect(() => () => { Object.values(saveTimers.current).forEach(clearTimeout) }, [])

  const filtered = useMemo(() => clsFilter ? shadowRows.filter(r => overrides[r._key]?.cls === clsFilter) : shadowRows, [shadowRows, overrides, clsFilter])
  const ubsClsSortOrder = useMemo(() => {
    const classes = classCfg ? busaClassificationOptions(classCfg).filter(Boolean) : []
    return Object.fromEntries(classes.map((cls, index) => [cls, index]))
  }, [classCfg])
  const sortColumns = useMemo(() => {
    const getOverride = (LPRecord: SubmissionLP) => overrides[LPRecord._key]
    const getComputed = (LPRecord: SubmissionLP) => {
      const ov = getOverride(LPRecord)
      return ov ? calcRow(ov, totalCommitM, totalUncalledM) : null
    }
    return [
      { key: 'rank',         getValue: (LPRecord: SubmissionLP) => rankByKey[LPRecord._key] ?? '' },
      { key: 'name',         getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.name || LPRecord.name || LPRecord._agentName || '' },
      { key: 'fundSleeve',   getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.fundSleeve ?? LPRecord.fundSleeve ?? '' },
      { key: 'parent',       getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.parent ?? '' },
      { key: 'spv',          getValue: (LPRecord: SubmissionLP) => !!getOverride(LPRecord)?.spv },
      { key: 'region',       getValue: (LPRecord: SubmissionLP) => formatRegion(getOverride(LPRecord)?.region ?? LPRecord.region ?? '') },
      { key: 'investorType', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.investorType ?? LPRecord.investorType ?? '' },
      { key: 'cls',          getValue: (LPRecord: SubmissionLP) => ubsClsSortOrder[getOverride(LPRecord)?.cls ?? ''] ?? Number.MAX_SAFE_INTEGER },
      { key: 'instVsHnw',    getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.instVsHnw ?? '' },
      { key: 'ig',           getValue: (LPRecord: SubmissionLP) => !!getOverride(LPRecord)?.ig },
      { key: 'agentCls',     getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.agentCls ?? '' },
      { key: 'sp', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.sp ?? '' },
      { key: 'mdy', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.mdy ?? '' },
      { key: 'fitch', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.fitch ?? '' },
      { key: 'lpSizeBil', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.lpSizeBil ?? '' },
      { key: 'lpSizeCriteria', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.lpSizeCriteria ?? '' },
      { key: 'capCommit', getValue: (LPRecord: SubmissionLP) => parseMoneyM(getOverride(LPRecord)?.capCommit) },
      { key: 'ucM', getValue: (LPRecord: SubmissionLP) => parseMoneyM(getOverride(LPRecord)?.ucM) },
      { key: 'ubsAdvRatePct', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.ubsAdvRatePct ?? '' },
      { key: 'agentRatePct', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.agentRatePct ?? '' },
      { key: 'concLimitPct', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.concLimitPct ?? '' },
      { key: 'agentConcLimitPct', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.agentConcLimitPct ?? '' },
      { key: 'cmtPct', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.cmtPct ?? '' },
      { key: 'calledM', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.calledM ?? '' },
      { key: 'pctUncalled', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.pctUncalled ?? '' },
      { key: 'pctCalled', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.pctCalled ?? '' },
      { key: 'agentExcess', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.agentExcess ?? '' },
      { key: 'ubsExcess', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.ubsExcess ?? '' },
      { key: 'agentBBCalc', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.agentBBCalc ?? '' },
      { key: 'pctAgentBB', getValue: (LPRecord: SubmissionLP) => totalAgentBBCalc > 0 ? (getComputed(LPRecord)?.agentBBCalc ?? 0) / totalAgentBBCalc : 0 },
      { key: 'ubsBBCalc', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.ubsBBCalc ?? '' },
      { key: 'pctUbsBB', getValue: (LPRecord: SubmissionLP) => totalUbsBBCalc > 0 ? (getComputed(LPRecord)?.ubsBBCalc ?? 0) / totalUbsBBCalc : 0 },
      { key: 'included', getValue: (LPRecord: SubmissionLP) => !!getComputed(LPRecord)?.included },
      { key: 'notes', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.notes ?? '' },
    ]
  }, [overrides, rankByKey, totalCommitM, totalUncalledM, totalAgentBBCalc, totalUbsBBCalc, ubsClsSortOrder])
  const { sort, sortedRows, requestSort } = useSortableRows(filtered, sortColumns, { key: 'rank', direction: 'asc' })
  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(sortedRows)
  const { widths: bbWidths, onResizeStart: bbResizeStart, tableWidth: bbTableWidth } = useColumnResize('shadow-bb', SHADOW_RESULTS_INITIAL_WIDTHS)

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

  const { summary } = result
  const clsOptions = [...new Set((result.lps as ComputedLPRecord[]).map(r => r.cls))]
    .sort((a, b) => (ubsClsSortOrder[a] ?? Number.MAX_SAFE_INTEGER) - (ubsClsSortOrder[b] ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b))

  const summaryExt = useMemo((): BBSummaryExt => {
    const busaRatesForSummary = uniqueRatesFromMap(classCfg?.BUSA_RATE_MAP, DEFAULT_BUSA_RATES)
    const agentRatesForSummary = uniqueRatesFromMap(classCfg?.AGENT_RATE_MAP, DEFAULT_AGENT_RATES)
    if (summaryExtApi) {
      return {
        ...summaryExtApi,
        busaBreakdown: completeRateBreakdown(summaryExtApi.busaBreakdown, busaRatesForSummary),
        agentBreakdown: completeRateBreakdown(summaryExtApi.agentBreakdown, agentRatesForSummary),
      }
    }
    const lps = result.lps as ComputedLPRecord[]
    const totalUncalledM = lps.reduce((s, r) => s + r.ucM, 0)
    const totalCapCommitM = lps.reduce((s, r) => s + parseM(r.capCommit), 0)
    const totalCalledM    = lps.reduce((s, r) => s + Math.max(0, parseM(r.capCommit) - r.ucM), 0)
    const facRow     = facilityRows.find(f => f.name === facility)
    const facSizeM   = facRow ? parseAumM(facRow.facilitySize) : 0
    const ubsPartM   = facRow ? parseAumM(facRow.ubsParticipation) : 0
    const ubsPartPct = facSizeM > 0 ? ubsPartM / facSizeM : 0
    const sumUcM = (pred: (r: ComputedLPRecord) => boolean) => lps.filter(pred).reduce((s, r) => s + r.ucM, 0)
    const instUncalledM   = sumUcM(r => r.instVsHnw === 'Institutional')
    const hnwUncalledM    = sumUcM(r => r.instVsHnw === 'HNW')
    const igUncalledM     = sumUcM(r => r.ig)
    const gt25bnUncalledM = sumUcM(r => parseAumM(r.aum) > 25000)
    const busaMap: Record<string, BkRow> = Object.fromEntries(
      busaRatesForSummary.map(rate => [rate, { rate, count: 0, dollars: 0, pct: 0 }]),
    )
    const agentMap: Record<string, BkRow> = Object.fromEntries(
      agentRatesForSummary.map(rate => [rate, { rate, count: 0, dollars: 0, pct: 0 }]),
    )
    const clsMap: Record<string, BkRow & { label: string }> = { 'Rated Investors': { label: 'Rated Investors', count: 0, dollars: 0, pct: 0 }, 'Unrated Investors': { label: 'Unrated Investors', count: 0, dollars: 0, pct: 0 }, 'Eligible Investors': { label: 'Eligible Investors', count: 0, dollars: 0, pct: 0 }, 'Excluded Investors': { label: 'Excluded Investors', count: 0, dollars: 0, pct: 0 } }
    for (const LPRecord of lps) {
      const bkey = LPRecord.rate || '0%'; if (busaMap[bkey]) { busaMap[bkey].count++; busaMap[bkey].dollars += LPRecord.ucM }
      const akey = LPRecord.agentRate || '0%'; if (!agentMap[akey]) agentMap[akey] = { rate: akey, count: 0, dollars: 0, pct: 0 }; agentMap[akey].count++; agentMap[akey].dollars += LPRecord.ucM
      const clsLabel = canonicalClassBucket(LPRecord.cls)
      clsMap[clsLabel].count++; clsMap[clsLabel].dollars += LPRecord.ucM
    }
    const sortedByUC = [...lps].sort((a, b) => b.ucM - a.ucM)
    const agentBBM = summary.totalABB
    const ubsBBM   = summary.totalUBB
    return {
      totalCapCommit: totalCapCommitM, totalCalledCap: totalCalledM,
      pctCalled: totalCapCommitM > 0 ? totalCalledM / totalCapCommitM : 0,
      totalAllUncalled: totalUncalledM, totalLPs: lps.length,
      pctInstitutional: totalUncalledM > 0 ? instUncalledM / totalUncalledM : 0,
      pctHNW: totalUncalledM > 0 ? hnwUncalledM / totalUncalledM : 0,
      pctTop10: totalUncalledM > 0 ? sortedByUC.slice(0, 10).reduce((s, r) => s + r.ucM, 0) / totalUncalledM : 0,
      pctTop20: totalUncalledM > 0 ? sortedByUC.slice(0, 20).reduce((s, r) => s + r.ucM, 0) / totalUncalledM : 0,
      igRatio: totalUncalledM > 0 ? igUncalledM / totalUncalledM : 0,
      pctUncalledGt25bnAum: totalUncalledM > 0 ? gt25bnUncalledM / totalUncalledM : 0,
      facilitySize: facSizeM, ubsParticipation: ubsPartM, ubsParticipationPct: ubsPartPct,
      facilityLTV: totalUncalledM > 0 ? facSizeM / totalUncalledM : 0,
      availableCommit: Math.min(facSizeM, agentBBM),
      facilityAdvRate: totalUncalledM > 0 ? agentBBM / totalUncalledM : 0,
      agentBBRaw: agentBBM, ubsBBRaw: ubsBBM, ubsAdvRate: totalUncalledM > 0 ? ubsBBM / totalUncalledM : 0,
      busaBreakdown: completeRateBreakdown(
        Object.values(busaMap).map(r => ({ rate: r.rate ?? '0%', count: r.count, dollars: r.dollars, pct: totalUncalledM > 0 ? r.dollars / totalUncalledM : 0 })),
        busaRatesForSummary,
      ),
      agentBreakdown: completeRateBreakdown(
        Object.values(agentMap).map(r => ({ rate: r.rate ?? '0%', count: r.count, dollars: r.dollars, pct: totalUncalledM > 0 ? r.dollars / totalUncalledM : 0 })),
        agentRatesForSummary,
      ),
      clsBreakdown: Object.values(clsMap).map(r => ({ ...r, pct: totalUncalledM > 0 ? r.dollars / totalUncalledM : 0 })),
    }
  }, [classCfg, facility, facilityRows, result, summaryExtApi, summary])

  const p = (n: number) => `${(n * 100).toFixed(0)}%`

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

      <div style={{ padding: '16px 24px 0' }}>
        <Card title="Portfolio & BB Summary"
          action={result.lps.length > 0 ? <button onClick={() => setSummaryHidden(h => !h)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 8px', cursor: 'pointer' }}>{summaryHidden ? 'Show' : 'Hide'}</button> : undefined}>
          {!summaryHidden && result.lps.length === 0 && (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              No summary available — select a facility and run the Shadow BB to populate this panel.
            </div>
          )}
          {!summaryHidden && result.lps.length > 0 && (
            <div style={{ display: 'flex', gap: 12, padding: '12px 18px 16px', overflowX: 'auto', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 0', minWidth: 190, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryKVTable title="LP Portfolio" rows={[
                  { k: 'Total Capital Commitments', v: fmtMoneyM(summaryExt.totalCapCommit, true), bold: true },
                  { k: 'Total Called Capital',       v: fmtMoneyM(summaryExt.totalCalledCap, true) },
                  { k: '% of Called Capital',        v: summaryExt.pctCalled ? p(summaryExt.pctCalled) : '—' },
                  { k: 'Total Uncalled Capital',     v: fmtMoneyM(summaryExt.totalAllUncalled, true), bold: true },
                  { k: '# of Limited Partners',      v: summaryExt.totalLPs.toLocaleString(), bold: true },
                  { k: '% Institutional',            v: p(summaryExt.pctInstitutional) },
                  { k: '% HNW',                      v: p(summaryExt.pctHNW) },
                  { k: '% Top 10',                   v: p(summaryExt.pctTop10) },
                  { k: '% Top 20',                   v: p(summaryExt.pctTop20) },
                  { k: 'Investment Grade',            v: `${(summaryExt.igRatio * 100).toFixed(1)}%` },
                  { k: '% Uncalled from LPs > $25bn AUM', v: summaryExt.pctUncalledGt25bnAum ? p(summaryExt.pctUncalledGt25bnAum) : '—' },
                ]} />
              </div>
              <div style={{ flex: '1 1 0', minWidth: 190, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryKVTable title="Borrowing Base" rows={[
                  { k: 'Total Facility Size',    v: fmtMoneyM(summaryExt.facilitySize, true),       bold: true },
                  { k: 'UBS Participation',      v: fmtMoneyM(summaryExt.ubsParticipation, true),  bold: true },
                  { k: 'UBS Participation Rate', v: summaryExt.ubsParticipationPct ? p(summaryExt.ubsParticipationPct) : '—' },
                  { k: 'Facility LTV',           v: summaryExt.facilityLTV ? p(summaryExt.facilityLTV) : '—' },
                  { k: 'Available Commitment',   v: fmtMoneyM(summaryExt.availableCommit, true),   bold: true },
                  { k: 'Current Facility Advance Rate', v: summaryExt.facilityAdvRate ? p(summaryExt.facilityAdvRate) : '—' },
                  { k: 'Agent Borrowing Base',   v: fmtMoneyM(summaryExt.agentBBRaw, true),         bold: true, hl: 'agent' },
                  { k: 'UBS Borrowing Base',     v: fmtMoneyM(summaryExt.ubsBBRaw, true),           bold: true },
                  { k: 'UBS Advance Rate',       v: p(summaryExt.ubsAdvRate),                        hl: 'ubs-rate' },
                  { k: 'EAR Differential',       v: p(summaryExt.ubsAdvRate - summaryExt.facilityAdvRate) },
                  { k: 'Uncalled to Facility',   v: summaryExt.facilitySize > 0 ? p(summaryExt.totalAllUncalled / summaryExt.facilitySize) : '—' },
                  { k: 'BB to Facility',         v: summaryExt.facilitySize > 0 ? p(summaryExt.agentBBRaw / summaryExt.facilitySize) : '—' },
                  { k: 'Facility to Fund Size',  v: summaryExt.totalCapCommit > 0 ? p(summaryExt.facilitySize / summaryExt.totalCapCommit) : '—' },
                ]} />
              </div>
              <div style={{ flex: '1 1 0', minWidth: 150, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryBreakTable title="BUSA" rows={summaryExt.busaBreakdown} full={true}/>
              </div>
              <div style={{ flex: '1 1 0', minWidth: 150, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryBreakTable title="Agent" rows={summaryExt.agentBreakdown} full={true}/>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Concentration breach table — persisted with the snapshot, evaluated against the
          Concentration Limits config at run time. Hidden while local overrides are active,
          because the table below then shows figures the stored verdict no longer matches. */}
      {snapshotBreaches.length > 0 && Object.keys(overrideMap).length === 0 && (() => {
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
              action={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><select style={{ width: 160 }} value={clsFilter} onChange={e => setClsFilter(e.target.value)}><option value="">Classification: All</option>{clsOptions.map(c => <option key={c} value={c}>{c}</option>)}</select><InfoTip title="Column Guide" items={bbColumnItems} width={340} /><Button variant="secondary" size="sm" onClick={handleRerunShadowBB} disabled={rerunning || facilityId == null || result.lps.length === 0}>{rerunning ? 'Re-running...' : 'Re-run Shadow BB'}</Button><Button variant="secondary" size="sm" onClick={() => { exportShadowBB(facility, summaryExt, sortedRows as unknown as ComputedLPRecord[]); toast('Shadow BB exported to Excel.') }}>↓ Export</Button></div>}>
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
                        const n = ov.name || LPRecord.name || LPRecord._agentName || '—'
                        const st = saveStatuses[key]
                        return (
                          <tr key={key} className={selected ? 'data-table-row-selected' : undefined} onClick={() => setSelectedKey(key)} style={{ cursor: 'pointer' }}>
                            <td className="num">{rankByKey[key] ?? '—'}</td>
                            <td title={n}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                                <span style={{ fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                                {LPRecord.tf && <span className="tf-badge">T</span>}
                                {st === 'saving' && <span style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>Saving…</span>}
                                {st === 'saved'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>Saved</span>}
                                {st === 'error'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--danger)', flexShrink: 0 }}>Error</span>}
                              </div>
                            </td>
                            <td title={ov.parent || '—'}>{ov.parent || '—'}</td>
                            <td>{ov.spv ? 'Yes' : 'No'}</td>
                            <td>{formatRegion(ov.region || LPRecord.region) || '—'}</td>
                            <td title={ov.investorType || LPRecord.investorType || '—'}>{ov.investorType || LPRecord.investorType || '—'}</td>
                            <td>{ov.instVsHnw || '—'}</td>
                            <td title={ov.agentCls || '—'}>{ov.agentCls || '—'}</td>
                            <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: ov.cls ? undefined : 'var(--danger)' }} title={ov.cls || 'Unclassified'}><Tag>{ov.cls || 'Unclassified'}</Tag></td>
                            <td style={{ textAlign: 'center' }}><YesNo val={c.included} /></td>
                            <td>{ov.ig ? 'Yes' : 'No'}</td>
                            <td>{ov.sp || '—'}</td>
                            <td>{ov.mdy || '—'}</td>
                            <td>{ov.fitch || '—'}</td>
                            <td>{ov.lpSizeCriteria || '—'}</td>
                            <td className="num" title={ov.lpSizeBil || '—'}>{fmtBillionDisplay(ov.lpSizeBil)}</td>
                            <td className="num">{ov.capCommit ? fmtFull(parseMoneyM(ov.capCommit)) : '—'}</td>
                            <td className="num">{fmtPct(c.cmtPct)}</td>
                            <td className="num">{fmtFull(c.calledM)}</td>
                            <td className="num">{ov.ucM ? fmtFull(parseMoneyM(ov.ucM)) : '—'}</td>
                            <td className="num">{fmtPct(c.pctUncalled)}</td>
                            <td className="num">{fmtPct(c.pctCalled)}</td>
                            <td className="num">{pctStr(ov.agentRatePct)}</td>
                            <td className="num">{pctStr(ov.ubsAdvRatePct)}</td>
                            <td className="num">{pctStr(ov.agentConcLimitPct)}</td>
                            <td className="num">{pctStr(ov.concLimitPct)}</td>
                            <td className={`num ${c.agentExcess === 0 ? 'zero' : ''}`}>{fmtFull(c.agentExcess)}</td>
                            <td className={`num ${c.ubsExcess === 0 ? 'zero' : ''}`}>{fmtFull(c.ubsExcess)}</td>
                            <td className={`num ${c.agentBBCalc === 0 ? 'zero' : ''}`}>{fmtFull(c.agentBBCalc)}</td>
                            <td className="num">{totalAgentBBCalc > 0 && c.agentBBCalc > 0 ? fmtPct(c.agentBBCalc / totalAgentBBCalc) : '—'}</td>
                            <td className={`num ${c.ubsBBCalc === 0 ? 'zero' : ''}`}>{fmtFull(c.ubsBBCalc)}</td>
                            <td className="num">{totalUbsBBCalc > 0 && c.ubsBBCalc > 0 ? fmtPct(c.ubsBBCalc / totalUbsBBCalc) : '—'}</td>
                            <td title={ov.notes || '—'}>{ov.notes || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="tbl-footer">
                  <span>Showing {from}–{to} of {filtered.length} LPs &nbsp;·&nbsp; {compact ? fmtM(summary.totalUBB) : fmtMoneyM(summary.totalUBB, true)} UBS BB &nbsp;·&nbsp; {compact ? fmtM(summary.bbDelta) : fmtMoneyM(summary.bbDelta, true)} delta</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}>{PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}</select>
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
                      totalAgentBB={totalAgentBBCalc}
                      totalUbsBB={totalUbsBBCalc}
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
