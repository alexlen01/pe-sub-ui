import { useState, useMemo, useEffect } from 'react'
import { utils, writeFile } from 'xlsx'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Tag from '../../components/ui/Tag'
import { useApp } from '../../context/AppContext'
import { computePortfolioBB, fmtM, getFacilityBBSnapshot, getFacilitySummaryExt, parseM } from '../../services/bbCalculationService'
import { getLPsForFacility } from '../../services/lpService'
import { getFacilities } from '../../services/facilityService'
import type { FacilityRow } from '../../services/facilityService'
import InfoTip from '../../components/ui/InfoTip'
import type { LPRecord } from '../../services/lpService'
import type { ComputedLPRecord, BBSummaryExt } from '../../services/bbCalculationService'

// Summary monetary values arrive in $millions (the API summary-ext and the fallback below both
// emit M-scale numbers). On screen they are always abbreviated to whole millions with an "M"
// suffix; the Excel export (full=true) renders the exact full-dollar figure instead.
function fmtMoneyM(m: number | null | undefined, full = false): string {
  if (m == null) return '—'
  if (full) return '$' + Math.round(m * 1e6).toLocaleString('en-US')
  return '$' + Math.round(m).toLocaleString('en-US') + 'M'
}

// M-scale → exact whole-dollar number, for the Excel export's numeric cells.
function fullDollar(m: number | null | undefined): number {
  return m == null ? 0 : Math.round(m * 1e6)
}

// Roll a granular LP classification (UBS or legacy taxonomy) up into one of the four canonical
// eligibility buckets (SHADOW_BB_ANALYSIS Table 5). Mirrors BbController.canonicalClassBucket.
type ClsBucket = 'Rated Investors' | 'Unrated Investors' | 'Eligible Investors' | 'Excluded Investors'
function canonicalClassBucket(cls: string | null | undefined): ClsBucket {
  switch (cls) {
    case 'Rated Investor': case 'Rated':
      return 'Rated Investors'
    case 'FoF & Other > $10Bn AUM': case 'Corp Pension > $5Bn Assets': case 'Unrated NAV > $1Bn':
    case 'Unrated >2bn': case 'Unrated 1–2bn':
      return 'Unrated Investors'
    case 'Other Institutional': case 'Eligible':
      return 'Eligible Investors'
    case 'Excluded':
      return 'Excluded Investors'
    default:
      return cls ? 'Eligible Investors' : 'Excluded Investors'
  }
}

// Parse an AUM display string (e.g. '$4.2B', '$1.4T', '$620M') to $millions.
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

// Build and download the Shadow BB workbook. Unlike the on-screen tables (which round to whole
// millions), the export carries exact full-dollar values across both summary tables and every LP
// data row. Monetary cells are written as numbers so Excel can format/aggregate them.
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
  pushBreak('LP Classification', 'Classification', ext.clsBreakdown)

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

const BB_COLUMN_ITEMS = [
  { label: 'UBS Advance Rate',   desc: 'UBS (BUSA) advance rate applied to eligible uncalled capital: Rated 90% · Unrated >$2bn 75% · Unrated $1–2bn 65% · Eligible 50% · Excluded 0%.' },
  { label: 'Agent Advance Rate', desc: 'Advance rate assigned by the facility Agent. Typically 95% for highly-rated LPs, lower for others.' },
  { label: 'Agent BB',           desc: "The Agent's borrowing base contribution for this LP: eligible uncalled capital × Agent advance rate, after concentration limits." },
  { label: 'UBS BB',             desc: 'The UBS borrowing base contribution for this LP: eligible uncalled capital × UBS advance rate, after the UBS per-LP concentration limit.' },
]

const SECTION_KEYS = ['Identity & Classification','Ratings','Financial Scale','Borrowing Base Inputs','Commitment Data','Uncalled / Eligible Capital','Concentration & BB','Notes']
const ALL_OPEN = Object.fromEntries(SECTION_KEYS.map(k => [k, true]))

function LPDetailPanel({ lp, onClose }: { lp: ComputedLPRecord; onClose: () => void }) {
  const [open, setOpen] = useState(ALL_OPEN)
  useEffect(() => { setOpen(ALL_OPEN) }, [lp?.name])
  useEffect(() => {
    if (!lp) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lp, onClose])
  if (!lp) return null
  const yn = (v: boolean | undefined) => v ? 'Yes' : 'No'
  const na = (v: string | undefined | null) => v || '—'
  const toggle = (s: string) => setOpen(o => ({ ...o, [s]: !o[s] }))
  const sections = [
    { title: 'Identity & Classification', rows: [{ k: 'Investor Name', v: lp.name ?? '—' }, { k: 'Agent LP Classification', v: lp.agentCls ?? '—' }, { k: 'UBS LP Classification', v: lp.cls ? <Tag>{lp.cls}</Tag> : '—' }, { k: 'Parent', v: na(lp.parent) }, { k: 'SPV', v: yn(lp.spv) }, { k: 'Institutional vs HNW', v: lp.type ?? '—' }, { k: 'Region / Location', v: lp.region ?? '—' }, { k: 'High Quality', v: yn(lp.hq) }, { k: 'Investment Grade', v: yn(lp.ig) }] },
    { title: 'Ratings', rows: [{ k: 'S&P', v: (lp.sp && lp.sp !== 'NR') ? lp.sp : '—' }, { k: "Moody's", v: (lp.mdy && lp.mdy !== 'NR') ? lp.mdy : '—' }, { k: 'Fitch', v: (lp.fitch && lp.fitch !== 'NR') ? lp.fitch : '—' }] },
    { title: 'Financial Scale', rows: [{ k: 'AUM', v: na(lp.aum) }, { k: 'NAV', v: na(lp.nav) }, { k: 'Pension Assets', v: na(lp.pension) }, { k: 'Pension Funded %', v: na(lp.pensionFunded) }] },
    { title: 'Borrowing Base Inputs', rows: [{ k: 'UBS Advance Rate', v: lp.rate ?? '—' }, { k: 'Agent Advance Rate', v: na(lp.agentRate) }] },
    { title: 'Commitment Data', rows: [{ k: 'Capital Commitments', v: na(lp.capCommit) }, { k: '% of Capital Commitments', v: na(lp.pctCapCommit) }, { k: 'Called Capital', v: na(lp.calledCap) }] },
    { title: 'Uncalled / Eligible Capital', rows: [{ k: 'Uncalled Capital', v: lp.uc ?? '—' }, { k: '% of Uncalled', v: na(lp.pctUncalled) }, { k: '% of LP Called', v: na(lp.pctCalled) }] },
    { title: 'Concentration & BB', rows: [{ k: 'Agent Concentration Limit', v: na(lp.agentConc) }, { k: 'UBS Concentration Limit', v: na(lp.ubsConc) }, { k: 'Agent Excess Concentration', v: lp.agentExcess }, { k: 'UBS Excess Concentration', v: lp.concExcessM > 0 ? fmtM(lp.concExcessM) : '—' }, { k: 'Agent Borrowing Base', v: lp.abb ?? '$0' }, { k: 'UBS Borrowing Base', v: lp.ubb ?? '$0' }, { k: 'UBS Included', v: yn(lp.inc && lp.cls !== 'Excluded') }] },
    { title: 'Notes', rows: [{ k: null as string | null, v: lp.notes || '—' }] },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--card)' }}>
      <div style={{ background: 'var(--navy)', color: '#fff', padding: '14px 18px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{lp.name}</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Tag>{lp.cls}</Tag>{lp.rcl && <span className="rcl-badge">Reclassified</span>}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 0 0 12px', opacity: 0.75, flexShrink: 0 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 8px' }}>
        {sections.map(({ title, rows }) => (
          <div key={title}>
            <button onClick={() => toggle(title)} style={{ width: '100%', background: 'var(--tbl)', border: 'none', borderTop: '1px solid var(--border)', borderBottom: open[title] ? '1px solid var(--border)' : 'none', padding: '7px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy)' }}>{title}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', display: 'inline-block', transform: open[title] ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>▾</span>
            </button>
            {open[title] && (
              <div style={{ padding: '0 18px' }}>
                {rows.map((r, i) => r.k === null ? (
                  <p key={i} style={{ fontSize: 12, color: 'var(--navy)', lineHeight: 1.5, margin: '8px 0' }}>{r.v}</p>
                ) : (
                  <div className="detail-row" key={i}><span className="detail-key">{r.k}</span><span className="detail-val">{r.v}</span></div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

type BBResult = ReturnType<typeof computePortfolioBB>

export default function ShadowBB() {
  const { bbParams, toast, targetFacility, setTargetFacility } = useApp()
  const [facilityOptions, setFacilityOptions] = useState<{ id?: number; name: string }[]>([])
  const [facilityRows,    setFacilityRows]    = useState<FacilityRow[]>([])
  const [facility,        setFacility]        = useState('')
  const [facilityId,      setFacilityId]      = useState<number | null>(null)
  const [clsFilter,     setClsFilter]     = useState('')
  const [selectedLP,    setSelectedLP]    = useState<ComputedLPRecord | null>(null)
  const [summaryHidden, setSummaryHidden] = useState(false)
  const [summaryExtApi, setSummaryExtApi] = useState<BBSummaryExt | null>(null)
  const [result,        setResult]        = useState<BBResult>(() => computePortfolioBB([], bbParams))
  const [calcMeta,      setCalcMeta]      = useState<{ facility: string; ts: Date } | null>(null)
  const [loadError,     setLoadError]     = useState<string | null>(null)

  useEffect(() => {
    setLoadError(null)
    getFacilities().then(fs => {
      const opts = fs.map(f => ({ id: f.id, name: f.name }))
      setFacilityOptions(opts)
      setFacilityRows(fs)
      if (opts.length > 0) {
        // Honor a facility handed off by the navigating screen (e.g. "View BB Results" after a
        // Shadow BB run) so the selector retains that facility rather than snapping to the first
        // in the list. Consume it once, then fall back to the first option.
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
    ]).then(([lps, snapshot, ext]) => {
      const hasSnapshot = snapshot != null && Object.keys(snapshot).length > 0
      // The Shadow BB exists only once "Run Shadow BB" has persisted a snapshot. Until then
      // show nothing — never compute a BB on the fly from LP Master records that were just committed.
      if (!hasSnapshot) {
        setResult(computePortfolioBB([], bbParams))
        setSummaryExtApi(null)
        setCalcMeta(null)
        setSelectedLP(null)
        setClsFilter('')
        return
      }
      const computed = computePortfolioBB(lps as LPRecord[], { ...bbParams })
      const snapshotData = snapshot ?? {}
      const patched = Object.keys(snapshotData).length
        ? { ...computed, summary: { ...computed.summary, ...snapshotData }, breaches: [] }
        : computed
      setResult(patched)
      setCalcMeta({ facility, ts: new Date() })
      setSelectedLP(null)
      setClsFilter('')
      if (ext) setSummaryExtApi(ext)
    }).catch(e => setLoadError(String(e)))
  }, [facility, facilityId])

  const filtered = useMemo(() => clsFilter ? result.lps.filter(r => r.cls === clsFilter) : result.lps, [result.lps, clsFilter])
  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(filtered)
  const { summary } = result
  const clsOptions = [...new Set(result.lps.map(r => r.cls))].sort()

  const summaryExt = useMemo((): BBSummaryExt => {
    if (summaryExtApi) return summaryExtApi
    const lps = result.lps
    // All monetary fields below are in $millions, matching the API summary-ext contract so the
    // width-aware formatter (fmtMoneyM) renders both code paths identically.
    const totalUncalledM = lps.reduce((s, r) => s + r.ucM, 0)

    // LP Portfolio totals are carried per-LP — sum them rather than leaving the panel blank.
    const totalCapCommitM = lps.reduce((s, r) => s + parseM(r.capCommit), 0)
    // Called Capital is calculated: Capital Commitments − Uncalled Capital (never negative).
    const totalCalledM    = lps.reduce((s, r) => s + Math.max(0, parseM(r.capCommit) - r.ucM), 0)

    // Borrowing Base header values come from the selected facility's own record (size /
    // UBS participation). parseAumM handles the $B/$M display strings the facility list carries.
    const facRow     = facilityRows.find(f => f.name === facility)
    const facSizeM   = facRow ? parseAumM(facRow.facilitySize) : 0
    const ubsPartM   = facRow ? parseAumM(facRow.ubsParticipation) : 0
    const ubsPartPct = facSizeM > 0 ? ubsPartM / facSizeM : 0

    // Uncalled-weighted population shares (SHADOW_BB_ANALYSIS Table 1): Σ(matching uncalled) ÷ Σ(uncalled)
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
      totalCapCommit: totalCapCommitM,
      totalCalledCap: totalCalledM,
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
      {loadError && <div style={{ padding: '10px 16px', background: '#fff0f0', color: 'var(--red)', fontSize: 12 }}>API error — {loadError}</div>}
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
                  { k: 'Total Capital Commitments', v: fmtMoneyM(summaryExt.totalCapCommit), bold: true },
                  { k: 'Total Called Capital',       v: fmtMoneyM(summaryExt.totalCalledCap) },
                  { k: '% of Called Capital',        v: summaryExt.pctCalled ? p(summaryExt.pctCalled) : '—' },
                  { k: 'Total Uncalled Capital',     v: fmtMoneyM(summaryExt.totalAllUncalled), bold: true },
                  { k: '# of Limited Partners',      v: summaryExt.totalLPs.toLocaleString(), bold: true },
                  { k: '% Institutional',            v: p(summaryExt.pctInstitutional) },
                  { k: '% HNW',                      v: p(summaryExt.pctHNW) },
                  { k: '% Top 10',                   v: p(summaryExt.pctTop10) },
                  { k: '% Top 20',                   v: p(summaryExt.pctTop20) },
                  { k: 'Investment Grade',            v: `${(summaryExt.igRatio * 100).toFixed(1)}%` },
                  { k: '% Uncalled from LPs > $25bn AUM',  v: summaryExt.pctUncalledGt25bnAum ? p(summaryExt.pctUncalledGt25bnAum) : '—' },
                ]} />
              </div>
              <div style={{ flex: '1 1 0', minWidth: 190, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryKVTable title="Borrowing Base" rows={[
                  { k: 'Total Facility Size',    v: fmtMoneyM(summaryExt.facilitySize),       bold: true },
                  { k: 'UBS Participation',      v: fmtMoneyM(summaryExt.ubsParticipation),  bold: true },
                  { k: 'UBS Participation Rate', v: summaryExt.ubsParticipationPct ? p(summaryExt.ubsParticipationPct) : '—' },
                  { k: 'Facility LTV',           v: summaryExt.facilityLTV ? p(summaryExt.facilityLTV) : '—' },
                  { k: 'Available Commitment',   v: fmtMoneyM(summaryExt.availableCommit),   bold: true },
                  { k: 'Facility Adv. Rate',     v: summaryExt.facilityAdvRate ? p(summaryExt.facilityAdvRate) : '—' },
                  { k: 'Agent Borrowing Base',   v: fmtMoneyM(summaryExt.agentBBRaw),         bold: true, hl: true },
                  { k: 'UBS Borrowing Base',     v: fmtMoneyM(summaryExt.ubsBBRaw),           bold: true },
                  { k: 'UBS Advance Rate',       v: p(summaryExt.ubsAdvRate) },
                ]} />
              </div>
              <div style={{ flex: '1 1 0', minWidth: 150, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryBreakTable title="BUSA" rows={summaryExt.busaBreakdown} full={false}/>
              </div>
              <div style={{ flex: '1 1 0', minWidth: 150, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryBreakTable title="Agent" rows={summaryExt.agentBreakdown} full={false}/>
              </div>
              <div style={{ flex: '1 1 0', minWidth: 165, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <SummaryBreakTable title="LP Classification" rows={summaryExt.clsBreakdown} full={false} labelHeader="Classification" />
              </div>
            </div>
          )}
        </Card>
      </div>

      <div style={{ padding: '0 24px 24px', display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Card title="LP-Level Shadow BB" subtitle={`${facility} · Conc. Limit: $${bbParams.concLimitM.toFixed(0)}M per LP`}
            action={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><select style={{ width: 160 }} value={clsFilter} onChange={e => setClsFilter(e.target.value)}><option value="">Classification: All</option>{clsOptions.map(c => <option key={c} value={c}>{c}</option>)}</select><InfoTip title="Column Guide" items={BB_COLUMN_ITEMS} width={340} /><Button variant="secondary" size="sm" onClick={() => { exportShadowBB(facility, summaryExt, filtered); toast('Shadow BB exported to Excel.') }}>↓ Export</Button></div>}>
            <div className="data-table-wrap">
              <table className="data-table" style={{ fontSize: 11, tableLayout: 'fixed', minWidth: 940 }}>
                <colgroup>
                  <col style={{ width: 220 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 85 }} />
                  <col style={{ width: 85 }} />
                  <col style={{ width: 85 }} />
                  <col style={{ width: 60 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 55 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Investor Name</th>
                    <th>Classification</th>
                    <th className="num">Uncalled</th>
                    <th className="num">UBS Eligible</th>
                    <th className="num">Conc. Excess</th>
                    <th className="num">Rate</th>
                    <th className="num">UBS BB</th>
                    <th className="num">Agent BB</th>
                    <th className="num">Delta</th>
                    <th style={{ textAlign: 'center' }}>Incl.</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((lp, i) => {
                    const clp = lp as ComputedLPRecord
                    const included = clp.inc && clp.cls !== 'Excluded'
                    return (
                      <tr key={i} onClick={() => setSelectedLP(clp)} style={{ cursor: 'pointer', background: selectedLP === lp ? 'var(--blue-lt)' : undefined }}>
                        <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><strong>{lp.name}</strong>{lp.rcl && <span className="rcl-badge">R</span>}</td>
                        <td><Tag>{lp.cls}</Tag></td>
                        <td className="num">{lp.uc}</td>
                        <td className="num">{clp.uec}</td>
                        <td className={`num ${clp.concExcessM > 0 ? 'neg' : 'zero'}`}>{clp.concExcessM > 0 ? fmtM(clp.concExcessM) : '—'}</td>
                        <td className="num">{clp.rate}</td>
                        <td className={`num ${clp.ubbM === 0 ? 'zero' : ''}`}>{clp.ubb}</td>
                        <td className={`num ${clp.abbM === 0 ? 'zero' : ''}`}>{lp.abb}</td>
                        <td className={`num ${clp.deltaM < 0 ? 'neg' : clp.deltaM === 0 ? 'zero' : ''}`}>{clp.delta}</td>
                        <td style={{ textAlign: 'center' }}><Tag variant={included ? 'active' : 'excl'}>{included ? 'Y' : 'N'}</Tag></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="tbl-footer">
              <span>Showing {from}–{to} of {filtered.length} LPs &nbsp;·&nbsp; {fmtM(summary.totalUBB)} UBS BB &nbsp;·&nbsp; {fmtM(summary.bbDelta)} delta</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}>{PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}</select>
                {totalPages > 1 && (<><Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>‹ Prev</Button><span style={{ fontSize: 11, color: 'var(--muted)' }}>Page {page} of {totalPages}</span><Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next ›</Button></>)}
              </div>
            </div>
          </Card>
        </div>
        <div style={{ width: 300, flexShrink: 0, overflowY: 'auto' }}>
          {selectedLP ? (
            <LPDetailPanel lp={selectedLP} onClose={() => setSelectedLP(null)} />
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--tbl)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32, color: 'var(--muted)', textAlign: 'center', minHeight: 200 }}>
              <div style={{ fontSize: 22, opacity: 0.35 }}>☰</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>LP Detail</div>
              <div style={{ fontSize: 11, lineHeight: 1.5 }}>Click any row to see the full LP record across all {SECTION_KEYS.length - 1} field groups.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
