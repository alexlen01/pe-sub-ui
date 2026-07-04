import { useState, useMemo, useEffect, useRef } from 'react'
import { utils, writeFile } from 'xlsx'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { useSortableRows } from '../../hooks/useTableSort'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DraggablePanel from '../../components/ui/DraggablePanel'
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
import { buildBusaRateFractions, getClassificationConfig, type ClassificationConfig } from '../../services/configService'
import {
  SHADOW_BB_INITIAL_WIDTHS, YesNo, ShadowBBTableHead,
  calcRow, fmtBillionDisplay, fmtFull, parseMoneyM, parsePct, pctStr,
  type Override, type SubmissionLP,
} from '../RunShadowBB'
import { useColumnResize } from '../../hooks/useColumnResize'
import LPRecordPanel from '../../components/ui/LPRecordPanel'

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

interface KVRow { k: string; v: string; bold?: boolean; hl?: boolean }
interface BkRow { rate?: string; label?: string; count: number; dollars: number; pct: number }

function SummaryKVTable({ title, rows }: { title: string; rows: KVRow[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><th colSpan={2} style={BLUE_HD}>{title}</th></tr></thead>
      <tbody>
        {rows.map(({ k, v, bold, hl }) => (
          <tr key={k} style={{ borderBottom: '1px solid var(--border)', background: hl ? '#fffbe6' : undefined }}>
            <td style={{ ...CELL, color: bold ? 'var(--text)' : 'var(--muted)', fontWeight: bold ? 700 : 400, whiteSpace: 'nowrap' }}>{k}</td>
            <td style={{ ...CELL, textAlign: 'right', fontWeight: bold ? 700 : 400, color: hl ? '#7c6200' : bold ? 'var(--text)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{v}</td>
          </tr>
        ))}
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
    ['Facility Adv. Rate', ext.facilityAdvRate ? pctStr(ext.facilityAdvRate) : '—'],
    ['Agent Borrowing Base', fullDollar(ext.agentBBRaw)],
    ['UBS Borrowing Base', fullDollar(ext.ubsBBRaw)],
    ['UBS Advance Rate', pctStr(ext.ubsAdvRate)],
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
  for (const lp of rows) {
    detailAoa.push([
      lp.name ?? '', lp.cls ?? '',
      fullDollar(lp.ucM), fullDollar(lp.uecM), fullDollar(lp.concExcessM),
      lp.rate ?? '', fullDollar(lp.ubbM), fullDollar(lp.abbM), fullDollar(lp.deltaM),
      lp.inc && lp.cls !== 'Excluded' ? 'Y' : 'N',
    ])
  }

  const wb = utils.book_new()
  utils.book_append_sheet(wb, utils.aoa_to_sheet(summaryAoa), 'Summary')
  utils.book_append_sheet(wb, utils.aoa_to_sheet(detailAoa), 'LP Detail')
  writeFile(wb, `Shadow_BB_${(facility || 'facility').replace(/[^\w.-]+/g, '_')}.xlsx`)
}

function pctFromConc(value: string | undefined | null, totalUncalledM: number): number | '' {
  if (!value) return ''
  if (String(value).includes('%')) return parsePct(value)
  const concM = parseMoneyM(value)
  return concM > 0 && totalUncalledM > 0 ? Number(((concM / totalUncalledM) * 100).toFixed(2)) : ''
}

function buildOverride(lp: ComputedLPRecord, totalUncalledM: number, defaultConcLimitPct: number | ''): Override {
  const lpSizeCriteria = lp.aum ? 'AUM' : lp.nav ? 'NAV' : lp.pension ? 'Assets' : ''
  return {
    name:              lp.name ?? '',
    parent:            lp.parent ?? '',
    spv:               !!lp.spv,
    investorType:      lp.investorType ?? '',
    type:              lp.type ?? 'Institutional',
    ig:                !!lp.ig,
    cls:               lp.cls ?? '',
    agentCls:          lp.agentCls ?? '',
    region:            lp.region ?? '',
    fundSleeve:        lp.fundSleeve ?? '',
    sp:                lp.sp && lp.sp !== 'NR' ? lp.sp : '',
    mdy:               lp.mdy && lp.mdy !== 'NR' ? lp.mdy : '',
    fitch:             lp.fitch && lp.fitch !== 'NR' ? lp.fitch : '',
    lpSizeBil:         lp.aum || lp.nav || lp.pension || '',
    lpSizeCriteria,
    capCommit:         lp.capCommit ?? '',
    ucM:               lp.uc ?? '',
    ubsAdvRatePct:     parsePct(lp.rate),
    agentRatePct:      parsePct(lp.agentRate),
    concLimitPct:      pctFromConc(lp.ubsConc, totalUncalledM) || defaultConcLimitPct,
    agentConcLimitPct: pctFromConc(lp.agentConc, totalUncalledM),
    inc:               !!lp.inc,
    notes:             lp.notes ?? '',
  }
}

function overrideToLPRecord(ov: Override, totalUncalledM: number): Partial<LPRecord> & { concLimitM?: number } {
  const concLimitM = typeof ov.concLimitPct === 'number' ? (ov.concLimitPct / 100) * totalUncalledM : undefined
  return {
    name: ov.name,
    parent: ov.parent,
    spv: ov.spv,
    investorType: ov.investorType || undefined,
    type: ov.type as LPRecord['type'],
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

  // Raw LP records + snapshot kept in state so local overrides can trigger recomputation.
  const [rawLPs,       setRawLPs]       = useState<LPRecord[]>([])
  const [snapshot,     setSnapshot]     = useState<Record<string, unknown>>({})
  const [snapshotBreaches, setSnapshotBreaches] = useState<BBBreach[]>([])
  const [breachHidden,  setBreachHidden]  = useState(false)
  const [warningHidden, setWarningHidden] = useState(false)
  const [overrideMap,  setOverrideMap]  = useState<Record<string, Partial<LPRecord> & { concLimitM?: number }>>({})

  // Per-LP save status for the "Saving… / ✓ Saved" indicator
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
      { label: 'Agent BB',           desc: "The Agent's borrowing base contribution for this LP: eligible uncalled capital x Agent advance rate, after concentration limits." },
      { label: 'UBS BB',             desc: 'The UBS borrowing base contribution for this LP: eligible uncalled capital x UBS advance rate, after the UBS per-LP concentration limit.' },
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
    const merged = rawLPs.map(lp => ({ ...lp, ...(overrideMap[lp.name ?? ''] ?? {}) }))
    const computed = computePortfolioBB(merged, bbParams, busaRates)
    const hasOverrides = Object.keys(overrideMap).length > 0
    return hasOverrides || Object.keys(snapshot).length === 0
      ? computed
      : { ...computed, summary: { ...computed.summary, ...snapshot }, breaches: [] }
  }, [rawLPs, overrideMap, bbParams, snapshot, busaRates])

  const resultTotalUncalledM = useMemo(
    () => (result.lps as ComputedLPRecord[]).reduce((s, lp) => s + lp.ucM, 0),
    [result.lps],
  )
  const defaultConcLimitPct = useMemo(
    () => resultTotalUncalledM > 0 ? Number(((bbParams.concLimitM / resultTotalUncalledM) * 100).toFixed(2)) : '',
    [bbParams.concLimitM, resultTotalUncalledM],
  )

  const shadowRows = useMemo<SubmissionLP[]>(
    () => (result.lps as ComputedLPRecord[]).map(lp => ({
      ...lp,
      _key: lp.name ?? '',
      _isNew: false,
      _agentName: lp.name ?? '',
    })),
    [result.lps],
  )

  const overrides = useMemo<Record<string, Override>>(
    () => Object.fromEntries((result.lps as ComputedLPRecord[]).map(lp => [lp.name ?? '', buildOverride(lp, resultTotalUncalledM, defaultConcLimitPct)])),
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
    const ranked = [...shadowRows].sort((a, b) =>
      parseMoneyM(overrides[b._key]?.ucM) - parseMoneyM(overrides[a._key]?.ucM)
    )
    return Object.fromEntries(ranked.map((lp, i) => [lp._key, i + 1]))
  }, [shadowRows, overrides])

  const selectedLP = useMemo(
    () => (selectedKey ? shadowRows.find(r => r._key === selectedKey) ?? null : null),
    [shadowRows, selectedKey],
  )

  const sbOvToLP = (lp: SubmissionLP, ov: Override): LPRecord => ({
    ...(lp as LPRecord),
    name:        ov.name || lp.name || lp._agentName || '',
    parent:      ov.parent ?? '', spv: ov.spv, type: ov.type as LPRecord['type'], investorType: ov.investorType ?? lp.investorType ?? '',
    ig:          ov.ig,
    cls:         (ov.cls || '') as LPRecord['cls'], clsTag: lp.clsTag ?? '',
    agentCls:    ov.agentCls, region: (ov.region || lp.region || '') as LPRecord['region'],
    fundSleeve:  ov.fundSleeve ?? lp.fundSleeve,
    sp:          ov.sp ?? '', mdy: ov.mdy ?? '', fitch: ov.fitch ?? '',
    aum:         ov.lpSizeCriteria === 'AUM' ? (ov.lpSizeBil || '') : (lp.aum ?? ''),
    nav:         ov.lpSizeCriteria === 'NAV' ? (ov.lpSizeBil || '') : (lp.nav ?? ''),
    pension:     lp.pension ?? '', pensionFunded: lp.pensionFunded ?? '',
    capCommit:   ov.capCommit ?? '', uc: ov.ucM != null ? String(ov.ucM) : (lp.uc ?? ''),
    rate:        typeof ov.ubsAdvRatePct === 'number' ? `${ov.ubsAdvRatePct}%` : (lp.rate ?? ''),
    agentRate:   typeof ov.agentRatePct  === 'number' ? `${ov.agentRatePct}%`  : (lp.agentRate ?? ''),
    agentConc:   typeof ov.agentConcLimitPct === 'number' ? `${ov.agentConcLimitPct}%` : (lp.agentConc ?? ''),
    ubsConc:     typeof ov.concLimitPct === 'number' ? `${ov.concLimitPct}%` : (lp.ubsConc ?? ''),
    inc: ov.inc, notes: ov.notes ?? '', rcl: lp.rcl ?? false, tf: lp.tf ?? false, hq: lp.hq ?? false,
    abb: lp.abb ?? '', ubb: lp.ubb ?? '', delta: lp.delta ?? '', uec: lp.uec ?? '',
    pctCapCommit: lp.pctCapCommit ?? '', calledCap: lp.calledCap ?? '',
    pctUncalled: lp.pctUncalled ?? '', pctCalled: lp.pctCalled ?? '',
    agentExcessConc: lp.agentExcessConc, ubsExcessConc: lp.ubsExcessConc,
  })

  const sbLpToOv = (saved: LPRecord, prev: Override): Override => ({
    ...prev,
    name: saved.name, parent: saved.parent ?? '', spv: saved.spv, investorType: saved.investorType ?? '', type: saved.type, ig: saved.ig,
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
        instVsHnw:         draft.type || undefined,
        type:              draft.type || undefined,
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
      await api.lps.saveClassification({ facilityId, rows: [row] })
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

  useEffect(() => () => { Object.values(saveTimers.current).forEach(clearTimeout) }, [])

  const filtered = useMemo(() => clsFilter ? shadowRows.filter(r => overrides[r._key]?.cls === clsFilter) : shadowRows, [shadowRows, overrides, clsFilter])
  const sortColumns = useMemo(() => {
    const getOverride = (lp: SubmissionLP) => overrides[lp._key]
    const getComputed = (lp: SubmissionLP) => {
      const ov = getOverride(lp)
      return ov ? calcRow(ov, totalCommitM, totalUncalledM) : null
    }
    return [
      { key: 'rank',         getValue: (lp: SubmissionLP) => rankByKey[lp._key] ?? '' },
      { key: 'name',         getValue: (lp: SubmissionLP) => getOverride(lp)?.name || lp.name || lp._agentName || '' },
      { key: 'fundSleeve',   getValue: (lp: SubmissionLP) => getOverride(lp)?.fundSleeve ?? lp.fundSleeve ?? '' },
      { key: 'parent',       getValue: (lp: SubmissionLP) => getOverride(lp)?.parent ?? '' },
      { key: 'spv',          getValue: (lp: SubmissionLP) => !!getOverride(lp)?.spv },
      { key: 'region',       getValue: (lp: SubmissionLP) => getOverride(lp)?.region ?? lp.region ?? '' },
      { key: 'investorType', getValue: (lp: SubmissionLP) => getOverride(lp)?.investorType ?? lp.investorType ?? '' },
      { key: 'cls',          getValue: (lp: SubmissionLP) => getOverride(lp)?.cls ?? '' },
      { key: 'type',         getValue: (lp: SubmissionLP) => getOverride(lp)?.type ?? '' },
      { key: 'ig',           getValue: (lp: SubmissionLP) => !!getOverride(lp)?.ig },
      { key: 'agentCls',     getValue: (lp: SubmissionLP) => getOverride(lp)?.agentCls ?? '' },
      { key: 'sp', getValue: (lp: SubmissionLP) => getOverride(lp)?.sp ?? '' },
      { key: 'mdy', getValue: (lp: SubmissionLP) => getOverride(lp)?.mdy ?? '' },
      { key: 'fitch', getValue: (lp: SubmissionLP) => getOverride(lp)?.fitch ?? '' },
      { key: 'lpSizeBil', getValue: (lp: SubmissionLP) => getOverride(lp)?.lpSizeBil ?? '' },
      { key: 'lpSizeCriteria', getValue: (lp: SubmissionLP) => getOverride(lp)?.lpSizeCriteria ?? '' },
      { key: 'capCommit', getValue: (lp: SubmissionLP) => parseMoneyM(getOverride(lp)?.capCommit) },
      { key: 'ucM', getValue: (lp: SubmissionLP) => parseMoneyM(getOverride(lp)?.ucM) },
      { key: 'ubsAdvRatePct', getValue: (lp: SubmissionLP) => getOverride(lp)?.ubsAdvRatePct ?? '' },
      { key: 'agentRatePct', getValue: (lp: SubmissionLP) => getOverride(lp)?.agentRatePct ?? '' },
      { key: 'concLimitPct', getValue: (lp: SubmissionLP) => getOverride(lp)?.concLimitPct ?? '' },
      { key: 'agentConcLimitPct', getValue: (lp: SubmissionLP) => getOverride(lp)?.agentConcLimitPct ?? '' },
      { key: 'cmtPct', getValue: (lp: SubmissionLP) => getComputed(lp)?.cmtPct ?? '' },
      { key: 'calledM', getValue: (lp: SubmissionLP) => getComputed(lp)?.calledM ?? '' },
      { key: 'pctUncalled', getValue: (lp: SubmissionLP) => getComputed(lp)?.pctUncalled ?? '' },
      { key: 'pctCalled', getValue: (lp: SubmissionLP) => getComputed(lp)?.pctCalled ?? '' },
      { key: 'agentExcess', getValue: (lp: SubmissionLP) => getComputed(lp)?.agentExcess ?? '' },
      { key: 'ubsExcess', getValue: (lp: SubmissionLP) => getComputed(lp)?.ubsExcess ?? '' },
      { key: 'agentBBCalc', getValue: (lp: SubmissionLP) => getComputed(lp)?.agentBBCalc ?? '' },
      { key: 'pctAgentBB', getValue: (lp: SubmissionLP) => totalAgentBBCalc > 0 ? (getComputed(lp)?.agentBBCalc ?? 0) / totalAgentBBCalc : 0 },
      { key: 'ubsBBCalc', getValue: (lp: SubmissionLP) => getComputed(lp)?.ubsBBCalc ?? '' },
      { key: 'pctUbsBB', getValue: (lp: SubmissionLP) => totalUbsBBCalc > 0 ? (getComputed(lp)?.ubsBBCalc ?? 0) / totalUbsBBCalc : 0 },
      { key: 'included', getValue: (lp: SubmissionLP) => !!getComputed(lp)?.included },
      { key: 'notes', getValue: (lp: SubmissionLP) => getOverride(lp)?.notes ?? '' },
    ]
  }, [overrides, rankByKey, totalCommitM, totalUncalledM, totalAgentBBCalc, totalUbsBBCalc])
  const { sort, sortedRows, requestSort } = useSortableRows(filtered, sortColumns)
  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(sortedRows)
  const { widths: bbWidths, onResizeStart: bbResizeStart, tableWidth: bbTableWidth } = useColumnResize('shadow-bb', SHADOW_BB_INITIAL_WIDTHS)

  useEffect(() => {
    if (selectedKey === null || sortedRows.length === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      e.preventDefault()
      const idx = sortedRows.findIndex(lp => lp._key === selectedKey)
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
  const clsOptions = [...new Set((result.lps as ComputedLPRecord[]).map(r => r.cls))].sort()

  const summaryExt = useMemo((): BBSummaryExt => {
    if (summaryExtApi) return summaryExtApi
    const lps = result.lps as ComputedLPRecord[]
    const totalUncalledM = lps.reduce((s, r) => s + r.ucM, 0)
    const totalCapCommitM = lps.reduce((s, r) => s + parseM(r.capCommit), 0)
    const totalCalledM    = lps.reduce((s, r) => s + Math.max(0, parseM(r.capCommit) - r.ucM), 0)
    const facRow     = facilityRows.find(f => f.name === facility)
    const facSizeM   = facRow ? parseAumM(facRow.facilitySize) : 0
    const ubsPartM   = facRow ? parseAumM(facRow.ubsParticipation) : 0
    const ubsPartPct = facSizeM > 0 ? ubsPartM / facSizeM : 0
    const sumUcM = (pred: (r: ComputedLPRecord) => boolean) => lps.filter(pred).reduce((s, r) => s + r.ucM, 0)
    const instUncalledM   = sumUcM(r => r.type === 'Institutional')
    const hnwUncalledM    = sumUcM(r => r.type === 'HNW')
    const igUncalledM     = sumUcM(r => r.ig)
    const gt25bnUncalledM = sumUcM(r => parseAumM(r.aum) > 25000)
    const busaMap: Record<string, BkRow> = { '90%': { rate: '90%', count: 0, dollars: 0, pct: 0 }, '75%': { rate: '75%', count: 0, dollars: 0, pct: 0 }, '65%': { rate: '65%', count: 0, dollars: 0, pct: 0 }, '50%': { rate: '50%', count: 0, dollars: 0, pct: 0 }, '0%': { rate: '0%', count: 0, dollars: 0, pct: 0 } }
    const agentMap: Record<string, BkRow> = {}
    const clsMap: Record<string, BkRow & { label: string }> = { 'Rated Investors': { label: 'Rated Investors', count: 0, dollars: 0, pct: 0 }, 'Unrated Investors': { label: 'Unrated Investors', count: 0, dollars: 0, pct: 0 }, 'Eligible Investors': { label: 'Eligible Investors', count: 0, dollars: 0, pct: 0 }, 'Excluded Investors': { label: 'Excluded Investors', count: 0, dollars: 0, pct: 0 } }
    for (const lp of lps) {
      const bkey = lp.rate || '0%'; if (busaMap[bkey]) { busaMap[bkey].count++; busaMap[bkey].dollars += lp.ucM }
      const akey = lp.agentRate || '0%'; if (!agentMap[akey]) agentMap[akey] = { rate: akey, count: 0, dollars: 0, pct: 0 }; agentMap[akey].count++; agentMap[akey].dollars += lp.ucM
      const clsLabel = canonicalClassBucket(lp.cls)
      clsMap[clsLabel].count++; clsMap[clsLabel].dollars += lp.ucM
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
      busaBreakdown: Object.values(busaMap).map(r => ({ rate: r.rate ?? '0%', count: r.count, dollars: r.dollars, pct: totalUncalledM > 0 ? r.dollars / totalUncalledM : 0 })),
      agentBreakdown: Object.values(agentMap).sort((a, b) => parseFloat(b.rate ?? '0') - parseFloat(a.rate ?? '0')).map(r => ({ rate: r.rate ?? '0%', count: r.count, dollars: r.dollars, pct: totalUncalledM > 0 ? r.dollars / totalUncalledM : 0 })),
      clsBreakdown: Object.values(clsMap).map(r => ({ ...r, pct: totalUncalledM > 0 ? r.dollars / totalUncalledM : 0 })),
    }
  }, [facility, facilityRows, result, summaryExtApi, summary])

  const p = (n: number) => `${(n * 100).toFixed(0)}%`

  return (
    <div>
      {loadError && <div style={{ padding: '10px 16px', background: '#fff0f0', color: 'var(--danger)', fontSize: 12 }}>API error — {loadError}</div>}
      <div className="subbar">
        <span className="subbar-label">Facility</span>
        <select style={{ width: 240 }} value={facility} onChange={e => {
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
                  { k: 'Total Capital Commitments', v: fmtMoneyM(summaryExt.totalCapCommit, !compact), bold: true },
                  { k: 'Total Called Capital',       v: fmtMoneyM(summaryExt.totalCalledCap, !compact) },
                  { k: '% of Called Capital',        v: summaryExt.pctCalled ? p(summaryExt.pctCalled) : '—' },
                  { k: 'Total Uncalled Capital',     v: fmtMoneyM(summaryExt.totalAllUncalled, !compact), bold: true },
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
                  { k: 'Total Facility Size',    v: fmtMoneyM(summaryExt.facilitySize, !compact),       bold: true },
                  { k: 'UBS Participation',      v: fmtMoneyM(summaryExt.ubsParticipation, !compact),  bold: true },
                  { k: 'UBS Participation Rate', v: summaryExt.ubsParticipationPct ? p(summaryExt.ubsParticipationPct) : '—' },
                  { k: 'Facility LTV',           v: summaryExt.facilityLTV ? p(summaryExt.facilityLTV) : '—' },
                  { k: 'Available Commitment',   v: fmtMoneyM(summaryExt.availableCommit, !compact),   bold: true },
                  { k: 'Facility Adv. Rate',     v: summaryExt.facilityAdvRate ? p(summaryExt.facilityAdvRate) : '—' },
                  { k: 'Agent Borrowing Base',   v: fmtMoneyM(summaryExt.agentBBRaw, !compact),         bold: true, hl: true },
                  { k: 'UBS Borrowing Base',     v: fmtMoneyM(summaryExt.ubsBBRaw, !compact),           bold: true },
                  { k: 'UBS Advance Rate',       v: p(summaryExt.ubsAdvRate) },
                ]} />
              </div>
              <div style={{ flex: '1 1 0', minWidth: 150, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryBreakTable title="BUSA" rows={summaryExt.busaBreakdown} full={!compact}/>
              </div>
              <div style={{ flex: '1 1 0', minWidth: 150, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryBreakTable title="Agent" rows={summaryExt.agentBreakdown} full={!compact}/>
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
            <Card title="LP-Level Shadow BB" subtitle={`${facility} · Conc. Limit: $${bbParams.concLimitM.toFixed(0)}M per LP`}
              action={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><select style={{ width: 160 }} value={clsFilter} onChange={e => setClsFilter(e.target.value)}><option value="">Classification: All</option>{clsOptions.map(c => <option key={c} value={c}>{c}</option>)}</select><InfoTip title="Column Guide" items={bbColumnItems} width={340} /><Button variant="secondary" size="sm" onClick={() => { exportShadowBB(facility, summaryExt, sortedRows as unknown as ComputedLPRecord[]); toast('Shadow BB exported to Excel.') }}>↓ Export</Button></div>}>
              <div style={{ position: 'relative' }}>
                <div className="data-table-wrap">
                  <table className="data-table dense" style={{ tableLayout: 'fixed', width: bbTableWidth, minWidth: bbTableWidth }}>
                    <ShadowBBTableHead sort={sort} onSort={requestSort} widths={bbWidths} onResizeStart={bbResizeStart} />
                    <tbody>
                      {pageItems.map(lp => {
                        const key = lp._key
                        const ov = overrides[key] ?? {} as Override
                        const selected = key === selectedKey
                        const c = calcRow(ov, totalCommitM, totalUncalledM)
                        const n = ov.name || lp.name || lp._agentName || '—'
                        const st = saveStatuses[key]
                        return (
                          <tr key={key} className={selected ? 'data-table-row-selected' : undefined} onClick={() => setSelectedKey(key)} style={{ cursor: 'pointer' }}>
                            <td>{rankByKey[key] ?? '—'}</td>
                            <td title={n}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                                <span style={{ fontWeight: selected ? 700 : 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                                {st === 'saving' && <span style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>Saving…</span>}
                                {st === 'saved'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>Saved</span>}
                                {st === 'error'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--danger)', flexShrink: 0 }}>Error</span>}
                              </div>
                            </td>
                            <td title={ov.fundSleeve || '—'}>{ov.fundSleeve || '—'}</td>
                            <td title={ov.parent || '—'}>{ov.parent || '—'}</td>
                            <td>{ov.spv ? 'Yes' : 'No'}</td>
                            <td>{ov.region || lp.region || '—'}</td>
                            <td title={ov.investorType || lp.investorType || '—'}>{ov.investorType || lp.investorType || '—'}</td>
                            <td>{ov.type || '—'}</td>
                            <td title={ov.agentCls || '—'}>{ov.agentCls || '—'}</td>
                            <td style={{ color: ov.cls ? 'var(--text)' : 'var(--danger)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }} title={ov.cls || 'Unclassified'}>{ov.cls || 'Unclassified'}</td>
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
                  <DraggablePanel className="lp-detail-overlay" storageKey="shadow-bb-lp-record">
                    <LPRecordPanel
                      lp={sbOvToLP(selectedLP, overrides[selectedKey])}
                      open={true}
                      rank={rankByKey[selectedKey]}
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
