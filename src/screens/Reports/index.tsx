import { useEffect, useMemo, useState } from 'react'

import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { formatRegion } from '../../config/regionReference'
import { useApp } from '../../context/AppContext'
import { api, type CollateralReport } from '../../services/api'
import { getReportConfig, type ReportConfig } from '../../services/configService'
import { getFacilities, type FacilityRow } from '../../services/facilityService'
import {
  buildAgentBankRows, buildBreachRows, buildCertClassRows, buildCertRows,
  buildEarTrendRows, buildHistoryRows, downloadCollateralPdf, exportXlsx, formatReportTimestamp,
  getAgentBankExposure, getCollateralReport, getConcentrationBreaches, getEarTrend,
  getReportHistory, recordReport, formatUsdAmount, formatUsdMillions, formatSignedUsdMillions, isNegativeDisplayValue, isPositiveDisplayValue,
  type ReportHistoryRow, type XlsxSheet,
} from '../../services/reportService'
import { parseM } from '../../utils/execSummary'
import { formatPercentageFraction } from '../../utils/percentage'
import type { BBSnapshot, ComputedLP } from '../../types/bb'
import { useConfigCache } from '../../store/configStore'

// ── Preview pane state ────────────────────────────────────────────────────────

type Preview =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'cert'; report: CollateralReport; snapshot: BBSnapshot | null }
  | { kind: 'table'; title: string; subtitle: string; columns: string[]
      rows: Array<Array<string | number>>; exportName: string }

const LEGACY_CLS_FILTER_OPTS = ['All', 'Rated', 'Unrated >2bn', 'Unrated 1–2bn', 'Eligible', 'Excluded']

/** A facility row that is guaranteed to carry its API id (always the case in live mode). */
type FacilityOpt = FacilityRow & { id: number }

const CERT_SECTIONS = [
  { id: 'catSummary',    label: 'LP Category Summary' },
  { id: 'coverageTrend', label: 'Coverage Ratio Trend' },
  { id: 'concAnalysis',  label: 'Concentration Limit Analysis' },
  { id: 'reclass',       label: 'Reclassified LP Detail' },
  { id: 'quality',       label: 'Collateral Quality Breakdown' },
] as const
type CertSectionId = typeof CERT_SECTIONS[number]['id']

// ── Small shared pieces ───────────────────────────────────────────────────────

function EmptyPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 8, height: '100%',
                  color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
      <span style={{ fontSize: 32, opacity: .3 }}>&#x25AB;</span>
      Select options and generate a report to see the preview.
    </div>
  )
}

function PaneTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>{desc}</div>
      <hr className="sep" />
    </>
  )
}

function FacilitySelect({ facilities, value, onChange, allLabel }: {
  facilities: FacilityOpt[]
  value: string
  onChange: (v: string) => void
  allLabel?: string
}) {
  return (
    <select style={{ width: '100%' }} value={value} onChange={e => onChange(e.target.value)}>
      {allLabel !== undefined && <option value="all">{allLabel}</option>}
      {facilities.length === 0 && allLabel === undefined && <option value="">No facilities available</option>}
      {facilities.map(f => <option key={f.id} value={String(f.id)}>{f.name}</option>)}
    </select>
  )
}

function rowsToSheet(name: string, columns: string[], rows: Array<Array<string | number>>): XlsxSheet {
  return { name, rows: rows.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i]]))) }
}

// ── Generated-table preview (EAR / agent bank / concentration / ad hoc) ────────

function TablePreview({ preview, onExport }: {
  preview: Extract<Preview, { kind: 'table' }>
  onExport: () => void
}) {
  const ADHOC_INVESTOR_COL_WIDTH_PX = 260 // reduced by 50px to keep Investor Name less dominant
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{preview.title}</div>
        <Button variant="secondary" onClick={onExport}>&#x2193; Download Excel</Button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>{preview.subtitle}</div>
      {preview.rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '24px 0' }}>
          No data for the selected options.
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>{preview.columns.map((c, i) => {
              const isAdhocInvestorCol = preview.title === 'Ad Hoc LP-Level Query' && i === 1
              return <th key={c} style={isAdhocInvestorCol ? { width: `${ADHOC_INVESTOR_COL_WIDTH_PX}px`, maxWidth: `${ADHOC_INVESTOR_COL_WIDTH_PX}px` } : undefined}>{c}</th>
            })}</tr></thead>
            <tbody>
              {preview.rows.map((r, i) => (
                <tr key={i}>{r.map((cell, j) => {
                  const isAdhocFacilityCol = preview.title === 'Ad Hoc LP-Level Query' && j === 0
                  const isAdhocInvestorCol = preview.title === 'Ad Hoc LP-Level Query' && j === 1
                  const cellStyle = isNegativeDisplayValue(cell)
                    ? { color: 'var(--danger)', fontWeight: 700 }
                    : isAdhocFacilityCol
                      ? { color: 'var(--muted)' }
                      : isAdhocInvestorCol
                        ? { width: `${ADHOC_INVESTOR_COL_WIDTH_PX}px`, maxWidth: `${ADHOC_INVESTOR_COL_WIDTH_PX}px`, overflow: 'hidden', textOverflow: 'ellipsis' }
                      : undefined
                  return <td key={j} style={cellStyle}>{cell}</td>
                })}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Certificate preview ───────────────────────────────────────────────────────

function CertPreview({ report, snapshot, snapshots, watermark, detail, includeLps, sections,
                       history, format, onExportPdf, onExportXlsx }: {
  report: CollateralReport
  snapshot: BBSnapshot | null
  snapshots: BBSnapshot[]
  watermark: string
  detail: string
  includeLps: string
  sections: Record<CertSectionId, boolean>
  history: ReportHistoryRow[]
  format: string
  onExportPdf: () => void
  onExportXlsx: () => void
}) {
  const certRows  = buildCertRows(report)
  const classRows = buildCertClassRows(report)
  const allLps: ComputedLP[] = snapshot?.result?.lps ?? []
  const lps = includeLps === 'all' ? allLps : allLps.filter(LPRecord => LPRecord.included)
  const breaches = snapshot?.result?.breaches ?? []
  const reclassed = allLps.filter(LPRecord => LPRecord.reclassified)
  const trendRows = buildEarTrendRows(
    snapshots
      .filter(s => s.result?.summary)
      .map(s => ({ calculatedAt: s.calculatedAt, ear: s.result.summary.ear,
                   agentEar: s.result.summary.agentEar, earDelta: s.result.summary.earDelta }))
  )
  const hqUncalledM    = allLps.filter(LPRecord => LPRecord.highQuality).reduce((s, LPRecord) => s + parseM(LPRecord.uncalledCapital), 0)
  const otherUncalledM = allLps.filter(LPRecord => !LPRecord.highQuality).reduce((s, LPRecord) => s + parseM(LPRecord.uncalledCapital), 0)

  return (
    <div>
      <div className="cert-preview" style={{ marginBottom: 12 }}>
        {watermark !== 'None' && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <span className="cert-watermark">{watermark}</span>
          </div>
        )}
        <div className="cert-title">BORROWING BASE CERTIFICATE</div>
        <div className="cert-sub">
          {report.facilityName}<br />
          Agent Bank: {report.agentBank} · Calculation Date: {formatReportTimestamp(report.calculatedAt)}<br />
          Generated: {formatReportTimestamp(new Date().toISOString())} · PE Sub Finance · UBS
        </div>
        <hr className="sep" />
        <table className="cert-table" style={{ marginBottom: 14 }}>
          <thead><tr><th>Metric</th><th className="num">UBS (BUSA)</th><th className="num">Agent</th></tr></thead>
          <tbody>
            {certRows.map((r, i) => (
              <tr key={i} className={r.cls}>
                <td>{r.metric}</td>
                <td
                  className="num"
                  style={
                    isNegativeDisplayValue(r.ubs)
                      ? { color: 'var(--danger)', fontWeight: 700 }
                      : (r.metric === 'UBS BB Delta' || r.metric === 'UBS EAR Delta') && isPositiveDisplayValue(r.ubs)
                        ? { color: 'var(--success)', fontWeight: 700 }
                        : undefined
                  }
                >
                  {r.ubs}
                </td>
                <td className="num" style={{ color: 'var(--muted)' }}>{r.agent}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {detail !== 'exec' && sections.catSummary && (
          <table className="cert-table" style={{ marginBottom: 14 }}>
            <thead><tr><th>LP Category</th><th className="num"># LPs</th><th className="num">Uncalled Capital</th><th className="num">UBS BB</th><th className="num">Advance Rate</th></tr></thead>
            <tbody>
              {classRows.map((r, i) => (
                <tr key={i}>
                  <td>{r.ubsLpCategory}</td>
                  <td className="num">{r.n}</td>
                  <td className="num">{r.uncalledCapital}</td>
                  <td className="num">{r.ubsBorrowingBase}</td>
                  <td className="num">{r.ubsAdvanceRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {detail !== 'exec' && sections.coverageTrend && trendRows.length > 0 && (
          <table className="cert-table" style={{ marginBottom: 14 }}>
            <thead><tr><th>Coverage Ratio Trend</th><th className="num">UBS EAR</th><th className="num">Agent EAR</th><th className="num">Delta</th></tr></thead>
            <tbody>
              {trendRows.map((r, i) => (
                <tr key={i}><td>{r.date}</td><td className="num" style={isNegativeDisplayValue(r.ear) ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{r.ear}</td><td className="num" style={isNegativeDisplayValue(r.agentEar) ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{r.agentEar}</td><td className="num" style={isNegativeDisplayValue(r.delta) ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{r.delta}</td></tr>
              ))}
            </tbody>
          </table>
        )}

        {detail !== 'exec' && sections.concAnalysis && (
          <table className="cert-table" style={{ marginBottom: 14 }}>
            <thead><tr><th>Concentration Limit Analysis</th><th className="num">Severity</th></tr></thead>
            <tbody>
              {breaches.length === 0
                ? <tr><td colSpan={2}>All concentration tests pass.</td></tr>
                : breaches.map((b, i) => (
                    <tr key={i} className={b.severity === 'breach' ? 'delta' : ''}>
                      <td>{b.message}</td>
                      <td className="num">{b.severity}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        )}

        {detail !== 'exec' && sections.reclass && reclassed.length > 0 && (
          <table className="cert-table" style={{ marginBottom: 14 }}>
            <thead><tr><th>Investor Name</th><th>Status</th><th className="num">LP Category</th><th className="num">Uncalled Capital</th><th className="num">Agent BB</th><th className="num">UBS BB</th></tr></thead>
            <tbody>
              {reclassed.map((LPRecord, i) => (
                <tr key={i}><td>{LPRecord.investorName}</td><td><span className="rcl-badge" title="Reclassified" aria-label="Reclassified">R</span></td><td className="num">{LPRecord.ubsLpCategory}</td><td className="num" style={isNegativeDisplayValue(formatUsdAmount(LPRecord.uncalledCapital)) ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{formatUsdAmount(LPRecord.uncalledCapital)}</td><td className="num" style={isNegativeDisplayValue(formatUsdAmount(LPRecord.agentBorrowingBase)) ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{formatUsdAmount(LPRecord.agentBorrowingBase)}</td><td className="num" style={isNegativeDisplayValue(formatUsdAmount(LPRecord.ubsBorrowingBase)) ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{formatUsdAmount(LPRecord.ubsBorrowingBase)}</td></tr>
              ))}
            </tbody>
          </table>
        )}

        {detail !== 'exec' && sections.quality && allLps.length > 0 && (
          <table className="cert-table" style={{ marginBottom: 14 }}>
            <thead><tr><th>Collateral Quality</th><th className="num"># LPs</th><th className="num">Uncalled Cap.</th></tr></thead>
            <tbody>
              <tr><td>High quality (Rated / Unrated tiers)</td><td className="num">{allLps.filter(LPRecord => LPRecord.highQuality).length}</td><td className="num">{formatUsdMillions(hqUncalledM)}</td></tr>
              <tr><td>Other</td><td className="num">{allLps.filter(LPRecord => !LPRecord.highQuality).length}</td><td className="num" style={isNegativeDisplayValue(formatUsdMillions(otherUncalledM)) ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{formatUsdMillions(otherUncalledM)}</td></tr>
            </tbody>
          </table>
        )}

        {detail === 'LPRecord' && (
          <table className="cert-table">
            <thead><tr><th>Investor Name</th><th className="num">LP Category</th><th className="num">Uncalled Capital</th><th className="num">Advance Rate</th><th className="num">Agent BB</th><th className="num">UBS BB</th><th className="num">Delta</th></tr></thead>
            <tbody>
              {lps.map((LPRecord, i) => (
                <tr key={i}>
                  <td>{LPRecord.investorName} {LPRecord.reclassified && <span className="rcl-badge" title="Reclassified" aria-label="Reclassified">R</span>}</td>
                  <td className="num">{LPRecord.ubsLpCategory}</td>
                  <td className="num" style={isNegativeDisplayValue(formatUsdAmount(LPRecord.uncalledCapital)) ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{formatUsdAmount(LPRecord.uncalledCapital)}</td>
                  <td className="num">{formatPercentageFraction(LPRecord.ubsAdvanceRate ?? NaN)}</td>
                  <td className="num" style={isNegativeDisplayValue(formatUsdAmount(LPRecord.agentBorrowingBase)) ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{formatUsdAmount(LPRecord.agentBorrowingBase)}</td>
                  <td className="num" style={isNegativeDisplayValue(formatUsdAmount(LPRecord.ubsBorrowingBase)) ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{formatUsdAmount(LPRecord.ubsBorrowingBase)}</td>
                  <td className="num" style={LPRecord.deltaM < 0 ? { color: 'var(--danger)', fontWeight: 700 } : LPRecord.deltaM > 0 ? { color: 'var(--success)', fontWeight: 700 } : undefined}>{formatSignedUsdMillions(LPRecord.deltaM)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {(format === 'PDF' || format === 'Both') && <Button onClick={onExportPdf}>&#x2193; Download PDF</Button>}
        {(format === 'Excel' || format === 'Both') && <Button onClick={onExportXlsx}>&#x2193; Download Excel</Button>}
      </div>

      <Card title="Report History">
        {history.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', padding: '10px 0' }}>No reports generated yet.</div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Report</th><th>Facility</th><th>Snapshot</th><th>Format</th><th>By</th><th>Generated</th></tr></thead>
              <tbody>
                {history.map((r, i) => (
                  <tr key={i}>
                    <td>{r.report}</td><td>{r.facility}</td><td>{r.snap}</td><td>{r.fmt}</td>
                    <td style={{ color: 'var(--muted)' }}>{r.user}</td>
                    <td style={{ color: 'var(--muted)' }}>{r.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function Reports() {
  const { toast }     = useApp()
  const classCfg      = useConfigCache().classification
  const [tab, setTab] = useState('collateral')

  const [facilities, setFacilities] = useState<FacilityOpt[]>([])
  const [reportCfg, setReportCfg]   = useState<ReportConfig | null>(null)
  const [history, setHistory]       = useState<ReportHistoryRow[]>([])
  const [preview, setPreview]       = useState<Preview>({ kind: 'none' })
  const [busy, setBusy]             = useState(false)

  // Collateral certificate options
  const [colFacilityId, setColFacilityId] = useState('')
  const [snapshots, setSnapshots]         = useState<BBSnapshot[]>([])
  const [colSnapshotId, setColSnapshotId] = useState('')
  const [includeLps, setIncludeLps]       = useState('included')
  const [watermark, setWatermark]         = useState('DRAFT - For Internal Review')
  const [detail, setDetail]               = useState('LPRecord')
  const [certFormat, setCertFormat]       = useState('PDF')
  const [sections, setSections]           = useState<Record<CertSectionId, boolean>>({
    catSummary: true, coverageTrend: true, concAnalysis: true, reclass: false, quality: false,
  })

  // Other tabs
  const [earFacilityId, setEarFacilityId]   = useState('')
  const [bankFilter, setBankFilter]         = useState('all')
  const [concFacilityId, setConcFacilityId] = useState('all')
  const [selectedTests, setSelectedTests]   = useState<string[]>([])
  const [adhocFacilityId, setAdhocFacilityId] = useState('all')
  const [adhocCls, setAdhocCls]             = useState('All')
  const [adhocSort, setAdhocSort]           = useState('name')

  const adhocClsOptions = useMemo(() => {
    const configured = (classCfg?.UBS_CLS_OPTS ?? []).filter(Boolean)
    return configured.length > 0 ? ['All', ...configured] : LEGACY_CLS_FILTER_OPTS
  }, [classCfg])

  const currentMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })

  useEffect(() => {
    getFacilities().then(rows => {
      const withIds = rows.filter((r): r is FacilityOpt => typeof r.id === 'number')
      setFacilities(withIds)
      if (withIds.length > 0) {
        setColFacilityId(String(withIds[0].id))
        setEarFacilityId(String(withIds[0].id))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    getReportConfig().then(cfg => {
      setReportCfg(cfg)
      setTab(cfg.REPORT_TABS[0]?.id ?? 'collateral')
      setSelectedTests(cfg.CONCENTRATION_TESTS)
    }).catch(() => {})
  }, [])

  const refreshHistory = () => {
    getReportHistory().then(entries => setHistory(buildHistoryRows(entries))).catch(() => {})
  }
  useEffect(refreshHistory, [])

  // Snapshot list follows the certificate facility selection.
  useEffect(() => {
    if (!colFacilityId) { setSnapshots([]); setColSnapshotId(''); return }
    api.bb.snapshots(Number(colFacilityId))
      .then(snaps => {
        setSnapshots(snaps)
        setColSnapshotId(snaps.length > 0 ? String(snaps[snaps.length - 1].id) : '')
      })
      .catch(() => { setSnapshots([]); setColSnapshotId('') })
  }, [colFacilityId])

  const facilityName = (id: string) =>
    facilities.find(f => String(f.id) === id)?.name ?? `Facility ${id}`

  const logReport = (report: string, facilityId: number | undefined, snapshotLabel: string, format: string) => {
    recordReport({ report, facilityId, snapshotLabel, format })
      .then(refreshHistory)
      .catch(() => {})
  }

  const fail = (e: unknown) => {
    const message = e instanceof Error ? e.message : 'Report generation failed.'
    setPreview({ kind: 'error', message })
    toast('Report generation failed.')
  }

  // ── Generate handlers ─────────────────────────────────────────────────────────

  const generateCertificate = async () => {
    if (!colFacilityId) return
    setBusy(true)
    try {
      const report = await getCollateralReport(
        Number(colFacilityId),
        colSnapshotId ? Number(colSnapshotId) : undefined,
      )
      setPreview({ kind: 'cert', report, snapshot: snapshots.find(s => s.id === report.snapshotId) ?? null })
      logReport('Collateral & Coverage', report.facilityId, formatReportTimestamp(report.calculatedAt), certFormat)
      toast('Certificate generated.')
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const generateEar = async () => {
    if (!earFacilityId) return
    setBusy(true)
    try {
      const points = await getEarTrend(Number(earFacilityId))
      const rows = buildEarTrendRows(points)
      setPreview({
        kind: 'table',
        title: 'Effective Advance Rates',
        subtitle: `${facilityName(earFacilityId)} · one point per Shadow BB run`,
        columns: ['Calculated', 'UBS EAR', 'Agent EAR', 'EAR Delta'],
        rows: rows.map(r => [r.date, r.ear, r.agentEar, r.delta]),
        exportName: 'effective-advance-rates.xlsx',
      })
      logReport('Effective Advance Rates', Number(earFacilityId), currentMonth, 'Excel')
      toast('Effective Advance Rates report generated.')
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const generateAgentBanks = async () => {
    setBusy(true)
    try {
      const all = buildAgentBankRows(await getAgentBankExposure())
      const rows = bankFilter === 'all' ? all : all.filter(r => r.agentBank === bankFilter)
      setPreview({
        kind: 'table',
        title: 'Agent Bank Exposure',
        subtitle: `Latest snapshot per facility · ${bankFilter === 'all' ? 'all agent banks' : bankFilter}`,
        columns: ['Agent Bank', 'Facilities', 'LPs', 'UBS BB', 'Agent BB', 'Delta'],
        rows: rows.map(r => [r.agentBank, r.facilities, r.lps, r.ubsBB, r.agentBB, r.delta]),
        exportName: 'agent-bank-exposure.xlsx',
      })
      logReport('Agent Bank Exposure', undefined, currentMonth, 'Excel')
      toast('Agent Bank Exposure report generated.')
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const generateConcentration = async () => {
    setBusy(true)
    try {
      const targets = concFacilityId === 'all'
        ? facilities.map(f => ({ id: f.id, name: f.name }))
        : [{ id: Number(concFacilityId), name: facilityName(concFacilityId) }]
      // Facilities without a snapshot 404 — skip them rather than failing the whole report.
      const settled = await Promise.allSettled(
        targets.map(t => getConcentrationBreaches(t.id).then(breaches => ({ facility: t.name, breaches })))
      )
      const perFacility = settled
        .filter((s): s is PromiseFulfilledResult<{ facility: string; breaches: BBSnapshot['result']['breaches'] }> => s.status === 'fulfilled')
        .map(s => s.value)
      if (concFacilityId !== 'all' && perFacility.length === 0) {
        setPreview({ kind: 'error', message: `No Shadow BB snapshot exists for ${facilityName(concFacilityId)} yet.` })
        return
      }
      const rows = buildBreachRows(perFacility, selectedTests)
      setPreview({
        kind: 'table',
        title: 'Concentration Exposures',
        subtitle: `${concFacilityId === 'all' ? 'All facilities with a Shadow BB' : facilityName(concFacilityId)} · ${selectedTests.length} test(s) selected`,
        columns: ['Facility', 'Test', 'Severity', 'Detail', 'Value', 'Limit'],
        rows: rows.map(r => [r.facility, r.test, r.severity, r.message, r.value, r.limit]),
        exportName: 'concentration-exposures.xlsx',
      })
      logReport('Concentration Exposures',
        concFacilityId === 'all' ? undefined : Number(concFacilityId), currentMonth, 'Excel')
      toast('Concentration Exposures report generated.')
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const runAdhoc = async () => {
    setBusy(true)
    try {
      const lps = await api.lpRecords.list({
        facilityId: adhocFacilityId === 'all' ? undefined : Number(adhocFacilityId),
        cls: adhocCls === 'All' ? undefined : adhocCls,
      })
      const sorted = [...lps].sort((a, b) =>
        adhocSort === 'name' ? a.investorName.localeCompare(b.investorName)
        : adhocSort === 'aum' ? parseM(b.aum) - parseM(a.aum)
        : parseM(b.uncalledCapital) - parseM(a.uncalledCapital))
      const columns = ['Facility', 'Investor Name', 'Status', 'UBS LP Category', 'Uncalled Capital', 'AUM', 'Region', 'Included']
      const selectedFacilityLabel = facilityName(adhocFacilityId)
      const rows = sorted.map(LPRecord => [
        (() => {
          const row = LPRecord as { facilityName?: string; facilityId?: number }
          if (row.facilityName && row.facilityName.trim()) return row.facilityName
          if (typeof row.facilityId === 'number') {
            const mapped = facilities.find(f => f.id === row.facilityId)?.name
            if (mapped) return mapped
          }
          return adhocFacilityId === 'all' ? '—' : selectedFacilityLabel
        })(),
        LPRecord.investorName,
        LPRecord.reclassified ? 'Reclassified' : '',
        LPRecord.ubsLpCategory,
        formatUsdAmount(LPRecord.uncalledCapital),
        formatUsdAmount(LPRecord.aum),
        formatRegion(LPRecord.regionLocation),
        LPRecord.included ? 'Y' : 'N',
      ] as Array<string | number>)
      setPreview({
        kind: 'table',
        title: 'Ad Hoc LP-Level Query',
        subtitle: `${adhocFacilityId === 'all' ? 'All facilities' : facilityName(adhocFacilityId)} · category: ${adhocCls} · ${sorted.length} LP record(s)`,
        columns, rows,
        exportName: 'adhoc-LPRecord-query.xlsx',
      })
      logReport('Ad Hoc Reporting',
        adhocFacilityId === 'all' ? undefined : Number(adhocFacilityId), currentMonth, 'Preview')
      toast('Ad hoc report generated.')
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  const exportCertificate = (report: CollateralReport, snapshot: BBSnapshot | null) => {
    const certRows  = buildCertRows(report)
    const classRows = buildCertClassRows(report)
    const sheets: XlsxSheet[] = [
      { name: 'Summary', rows: certRows.map(r => ({ Metric: r.metric, 'UBS (BUSA)': r.ubs, Agent: r.agent })) },
      { name: 'LP Categories', rows: classRows.map(r => ({ 'LP Category': r.ubsLpCategory, 'LPs': r.n, 'Uncalled Capital': r.uncalledCapital, 'UBS BB': r.ubsBorrowingBase, 'Advance Rate': r.ubsAdvanceRate })) },
    ]
    const lps: ComputedLP[] = snapshot?.result?.lps ?? []
    if (detail === 'LPRecord' && lps.length > 0) {
      sheets.push({
        name: 'LPs',
        rows: (includeLps === 'all' ? lps : lps.filter(LPRecord => LPRecord.included)).map(LPRecord => ({
          'Investor Name': LPRecord.investorName, Status: LPRecord.reclassified ? 'Reclassified' : '', 'LP Category': LPRecord.ubsLpCategory, 'Uncalled Capital': formatUsdAmount(LPRecord.uncalledCapital), 'Advance Rate': formatPercentageFraction(LPRecord.ubsAdvanceRate ?? NaN),
          'Agent BB': formatUsdAmount(LPRecord.agentBorrowingBase), 'UBS BB': formatUsdAmount(LPRecord.ubsBorrowingBase), Delta: formatSignedUsdMillions(LPRecord.deltaM),
        })),
      })
    }
    exportXlsx(`bb-certificate-${report.facilityName.replace(/\s+/g, '-').toLowerCase()}.xlsx`, sheets)
    toast('Excel downloaded.')
  }

  const exportCertificatePdf = async (report: CollateralReport) => {
    await downloadCollateralPdf(report.facilityId, report.facilityName, {
      snapshotId: report.snapshotId, watermark, detail, includeLps,
      catSummary: String(sections.catSummary), coverageTrend: String(sections.coverageTrend),
      concAnalysis: String(sections.concAnalysis), reclass: String(sections.reclass),
      quality: String(sections.quality),
    })
    toast('PDF downloaded.')
  }

  const exportTable = (p: Extract<Preview, { kind: 'table' }>) => {
    exportXlsx(p.exportName, [rowsToSheet('Report', p.columns, p.rows)])
    toast('Excel downloaded.')
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="report-tabs">
        {(reportCfg?.REPORT_TABS ?? []).map(t => (
          <div key={t.id} className={`r-tab ${tab === t.id ? 'active' : ''}`}
               onClick={() => { setTab(t.id); setPreview({ kind: 'none' }) }}>{t.label}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', height: 'calc(100vh - var(--topbar-h) - 84px)', overflow: 'hidden' }}>
        <div style={{ borderRight: '1px solid var(--border)', overflow: 'auto', padding: 18, background: 'var(--card)' }}>

          {tab === 'collateral' && (
            <div>
              <PaneTitle title="Collateral Market Value & Coverage"
                desc="Overall collateral quality, coverage ratios, and UBS Shadow BB vs. Agent BB comparison." />
              <div className="form-group">
                <label className="form-label">Facility</label>
                <FacilitySelect facilities={facilities} value={colFacilityId} onChange={setColFacilityId} />
              </div>
              <div className="form-group">
                <label className="form-label">BB Snapshot</label>
                <select style={{ width: '100%' }} value={colSnapshotId} onChange={e => setColSnapshotId(e.target.value)}>
                  {snapshots.length === 0
                    ? <option value="">No snapshots — run a Shadow BB first</option>
                    : [...snapshots].reverse().map((s, i) => (
                        <option key={s.id} value={String(s.id)}>
                          {formatReportTimestamp(s.calculatedAt)}{i === 0 ? ' (latest)' : ''}
                        </option>
                      ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Include LPs</label>
                <select style={{ width: '100%' }} value={includeLps} onChange={e => setIncludeLps(e.target.value)}>
                  <option value="included">Included only (UBS Included = Y)</option>
                  <option value="all">All LPs</option>
                  <option value="variance">Included + variance highlighted</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Watermark</label>
                <select style={{ width: '100%' }} value={watermark} onChange={e => setWatermark(e.target.value)}>
                  <option>DRAFT - For Internal Review</option>
                  <option>FINAL</option>
                  <option>None</option>
                </select>
              </div>
              <hr className="sep" />
              <div className="form-group">
                <label className="form-label">Detail Level</label>
                {[['LPRecord', 'LP-level drill-down'], ['facility', 'Facility summary only'], ['exec', 'Executive summary only']].map(([value, label]) => (
                  <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6, cursor: 'pointer' }}>
                    <input type="radio" name="detail" checked={detail === value} onChange={() => setDetail(value)} /> {label}
                  </label>
                ))}
              </div>
              <div className="form-group">
                <label className="form-label">Format</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  {['PDF', 'Excel', 'Both'].map(o => (
                    <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                      <input type="radio" name="fmt" checked={certFormat === o} onChange={() => setCertFormat(o)} /> {o}
                    </label>
                  ))}
                </div>
              </div>
              <hr className="sep" />
              <div className="form-group">
                <label className="form-label">Additional Sections</label>
                {CERT_SECTIONS.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={sections[s.id]}
                           onChange={e => setSections({ ...sections, [s.id]: e.target.checked })} /> {s.label}
                  </label>
                ))}
              </div>
              <hr className="sep" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={generateCertificate} disabled={busy || !colSnapshotId}>Generate Certificate</Button>
                <Button variant="secondary" onClick={() => toast('Scheduling not yet implemented.')}>Schedule</Button>
              </div>
            </div>
          )}

          {tab === 'ear' && (
            <div>
              <PaneTitle title="Effective Advance Rates"
                desc="Blended UBS advance rate per facility — trend across Shadow BB runs and delta vs. agent EAR." />
              <div className="form-group">
                <label className="form-label">Facility</label>
                <FacilitySelect facilities={facilities} value={earFacilityId} onChange={setEarFacilityId} />
              </div>
              <div className="form-group"><label className="form-label">Period</label>
                <select style={{ width: '100%' }}><option>All Shadow BB runs</option></select>
              </div>
              <Button onClick={generateEar} disabled={busy || !earFacilityId}>Generate Report</Button>
            </div>
          )}

          {tab === 'agent-bank' && (
            <div>
              <PaneTitle title="Agent Bank Exposure"
                desc="UBS exposure by agent bank — BB value, LPRecord count, and variance from each agent's submitted BB." />
              <div className="form-group"><label className="form-label">Agent Bank</label>
                <select style={{ width: '100%' }} value={bankFilter} onChange={e => setBankFilter(e.target.value)}>
                  <option value="all">All Agent Banks</option>
                  {[...new Set(facilities.map(f => f.agentBank))].map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Snapshot</label>
                <select style={{ width: '100%' }}><option>{currentMonth} (latest)</option></select>
              </div>
              <Button onClick={generateAgentBanks} disabled={busy}>Generate Report</Button>
            </div>
          )}

          {tab === 'concentration' && (
            <div>
              <PaneTitle title="Concentration Exposures"
                desc="LP-level and category-level concentration limit analysis across all active facilities." />
              <div className="form-group">
                <label className="form-label">Facility</label>
                <FacilitySelect facilities={facilities} value={concFacilityId} onChange={setConcFacilityId} allLabel="All Facilities" />
              </div>
              <div className="form-group">
                <label className="form-label">Concentration Tests</label>
                {(reportCfg?.CONCENTRATION_TESTS ?? []).map(t => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}>
                    <input type="checkbox" checked={selectedTests.includes(t)}
                           onChange={e => setSelectedTests(e.target.checked
                             ? [...selectedTests, t]
                             : selectedTests.filter(x => x !== t))} /> {t}
                  </label>
                ))}
              </div>
              <Button onClick={generateConcentration} disabled={busy}>Generate Report</Button>
            </div>
          )}

          {tab === 'adhoc' && (
            <div>
              <PaneTitle title="Ad Hoc Reporting"
                desc="On-demand analysis — build a custom LP-level query and export results." />
              <div className="form-group">
                <label className="form-label">Facility</label>
                <FacilitySelect facilities={facilities} value={adhocFacilityId} onChange={setAdhocFacilityId} allLabel="All Facilities" />
              </div>
              <div className="form-group"><label className="form-label">Filter by LP Category</label>
                <select style={{ width: '100%' }} value={adhocCls} onChange={e => setAdhocCls(e.target.value)}>
                  {adhocClsOptions.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Sort By</label>
                <select style={{ width: '100%' }} value={adhocSort} onChange={e => setAdhocSort(e.target.value)}>
                  <option value="uc">Uncalled Capital (desc)</option>
                  <option value="name">Investor Name</option>
                  <option value="aum">AUM (desc)</option>
                </select>
              </div>
              <Button onClick={runAdhoc} disabled={busy}>Run Report</Button>
            </div>
          )}

          {tab === 'scheduled' && (
            <div>
              <PaneTitle title="Scheduled Jobs"
                desc="System-managed batch jobs. Run automatically — no user configuration required." />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {(reportCfg?.REPORT_SCHEDULES ?? []).map((s, i) => (
                  <div key={i} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tbl)' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--navy)', marginBottom: 4 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.freq} · Next run: {s.next}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        <div style={{ overflow: 'auto', padding: 18, background: 'var(--bg)' }}>
          {preview.kind === 'none' && <EmptyPreview />}
          {preview.kind === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                          justifyContent: 'center', gap: 8, height: '100%',
                          color: 'var(--red)', fontSize: 12, textAlign: 'center' }}>
              <span style={{ fontSize: 32, opacity: .3 }}>&#x26A0;</span>
              {preview.message}
            </div>
          )}
          {preview.kind === 'cert' && (
            <CertPreview report={preview.report} snapshot={preview.snapshot} snapshots={snapshots}
                         watermark={watermark} detail={detail} includeLps={includeLps} sections={sections}
                         history={history} format={certFormat}
                         onExportPdf={() => void exportCertificatePdf(preview.report).catch(fail)}
                         onExportXlsx={() => exportCertificate(preview.report, preview.snapshot)} />
          )}
          {preview.kind === 'table' && (
            <TablePreview preview={preview} onExport={() => exportTable(preview)} />
          )}
        </div>
      </div>
    </div>
  )
}
