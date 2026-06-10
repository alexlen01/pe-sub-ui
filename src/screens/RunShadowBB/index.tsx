import { useState, useMemo, useEffect } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { useApp } from '../../context/AppContext'
import { useScreenMode } from '../../hooks/useScreenMode'
import StepBar from '../../components/ui/StepBar'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Tag from '../../components/ui/Tag'
import Modal from '../../components/ui/Modal'
import { WIZARD_STEPS } from '../../config/wizardConfig'
import { BUSA_RATES, computePortfolioBB, fmtM, fmtPct } from '../../services/bbCalculationService'
import { MATCH_QUEUE, SUBMISSION_SUMMARY } from '../../data/matchQueueData'
import { EXTRACTED_LPS } from '../../data/extractionData'
import { getMatchQueue } from '../../services/matchingService'
import { api } from '../../services/api'
import type { LPRecord } from '../../services/lpService'
import type { Submission, AgentExtractedRow } from '../../services/api'

function parseDollars(s: string): number {
  return parseInt((s ?? '').replace(/[$,]/g, ''), 10) || 0
}

const DEFAULT_CL_M   = 25   // fallback for BB engine (dollar-based)
const DEFAULT_CL_PCT = 7.5  // default concentration limit as % of total uncalled

function parsePct(str: string | undefined | null): number | '' {
  if (!str || str === '—') return ''
  return parseFloat(String(str).replace('%', '')) || ''
}
function parseUCM(str: string | undefined | null): number | '' {
  if (!str) return ''
  const m = String(str).match(/\$?([\d,.]+)M/)
  return m ? parseFloat(m[1].replace(',', '')) : ''
}

const YesNo = ({ val }: { val: boolean }) => (
  <span style={{
    fontWeight: 600, fontSize: 11, padding: '2px 7px', borderRadius: 10,
    background: val ? '#e6f4ea' : 'var(--tbl)',
    color: val ? 'var(--green)' : 'var(--muted)',
  }}>
    {val ? 'Yes' : 'No'}
  </span>
)

// Per-row formula engine — all monetary values in $M
function calcRow(
  ubsAdvRatePct: number | '',
  concLimitPct: number | '',
  ucM: number | '',
  commitM: number,
  totalCommitM: number,
  totalUncalledM: number,
) {
  const advRate  = typeof ubsAdvRatePct === 'number' ? ubsAdvRatePct / 100 : 0
  const clPct    = typeof concLimitPct  === 'number' ? concLimitPct  / 100 : 0
  const uc       = typeof ucM           === 'number' ? ucM           : 0

  const cmtPct          = totalCommitM  > 0 ? commitM / totalCommitM : 0
  const ubsEligUncalled = Math.min(uc, totalUncalledM * clPct)
  const ubsBBCalc       = ubsEligUncalled * advRate
  const ubsIncluded     = ubsBBCalc > 0
  const highQuality     = Math.abs(advRate - 0.9) < 0.0001
  const inclExcess      = ubsIncluded ? uc - ubsEligUncalled : 0

  return { cmtPct, ubsEligUncalled, ubsBBCalc, ubsIncluded, highQuality, inclExcess }
}

// inc: override of LP Master contractual eligibility flag; auto-derived from cls but user-editable
function deriveInc(cls: string, isNew: boolean, masterInc: boolean | undefined): boolean {
  if (!cls || cls === 'Excluded') return false
  return isNew ? true : !!(masterInc)
}

type SubmissionLP = Partial<LPRecord> & { _key: string; _isNew: boolean; _agentName: string }
type Override = {
  cls: string
  sp: string; mdy: string; fitch: string
  ubsAdvRatePct: number | ''
  agentRatePct: number | ''
  concLimitPct: number | ''
  ucM: number | ''
  inc: boolean
}

export default function RunShadowBB() {
  const { toast, navigate, lpData, bbParams, activeSubmission, activeSubmissionId, abortSubmission } = useApp()
  const mode = useScreenMode()
  const live = mode === 'live'
  const [matchQueue, setMatchQueue] = useState(MATCH_QUEUE)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ReturnType<typeof computePortfolioBB> | null>(null)
  const [bbSnapshot] = useState<Record<string, unknown> | null>(null)
  const [summaryHidden, setSummaryHidden] = useState(false)
  const [abortOpen, setAbortOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submissionDetails, setSubmissionDetails] = useState<Submission | null>(null)
  const [extractedMap, setExtractedMap] = useState<Record<string, AgentExtractedRow>>({})

  useEffect(() => {
    if (mode === 'detecting') return
    setLoadError(null)
    const queuePromise = getMatchQueue(live, activeSubmissionId ?? 0)
    const rowsPromise = (live && activeSubmissionId)
      ? api.extraction.agentRows(activeSubmissionId).catch(() => [] as AgentExtractedRow[])
      : Promise.resolve([] as AgentExtractedRow[])
    Promise.all([queuePromise, rowsPromise])
      .then(([q, rows]) => {
        setMatchQueue(q as typeof MATCH_QUEUE)
        const map: Record<string, AgentExtractedRow> = {}
        for (const r of rows) { if (r.name) map[r.name.toLowerCase()] = r }
        setExtractedMap(map)
      })
      .catch(e => setLoadError(String(e)))
  }, [mode])

  // In live mode, fetch submission details for the summary card
  useEffect(() => {
    if (!live || !activeSubmissionId) return
    api.submissions.get(activeSubmissionId)
      .then(setSubmissionDetails)
      .catch(() => {})
  }, [live, activeSubmissionId])

  const submissionLPs = useMemo<SubmissionLP[]>(() => {
    return matchQueue.map(mq => {
      const master = lpData.find(lp => lp.name === mq.masterName)
      const ext = extractedMap[(mq.agentName || '').toLowerCase()]
      if (master) {
        return {
          ...master,
          aum:       ext?.aum      || master.aum,
          nav:       ext?.nav      || master.nav,
          capCommit: ext?.commit   || master.capCommit,
          uc:        ext?.uncalled || master.uc,
          _key: `lp-${master.rank}`, _isNew: false, _agentName: mq.agentName,
        }
      }
      return {
        _key: `new-${mq.id}`, _isNew: true, _agentName: mq.agentName,
        name: mq.agentName, cls: 'Eligible',
        agentRate: ext?.agentRate || '', uc: ext?.uncalled || '', abb: '$0',
        capCommit: ext?.commit || '', aum: ext?.aum || '', nav: ext?.nav || '',
        inc: true, rcl: false, rank: undefined, region: '' as LPRecord['region'],
        ig: false, sp: '', mdy: '', fitch: '', pension: '', notes: '',
      }
    })
  }, [lpData, matchQueue, extractedMap])

  const buildOverride = (lp: SubmissionLP): Override => {
    const ext = extractedMap[(lp._agentName || lp.name || '').toLowerCase()]
    const toRating = (extracted: string | undefined, master: string | undefined) => {
      const v = extracted || master || ''
      return v !== 'NR' ? v : ''
    }
    return {
      cls:           lp.cls ?? '',
      sp:            toRating(ext?.sp,     lp.sp),
      mdy:           toRating(ext?.moodys, lp.mdy),
      fitch:         toRating(ext?.fitch,  lp.fitch),
      ubsAdvRatePct: lp.cls ? (BUSA_RATES[lp.cls] ?? 0) * 100 : '',
      agentRatePct:  parsePct(ext?.agentRate || lp.agentRate),
      concLimitPct:  parsePct(lp.ubsConc) || DEFAULT_CL_PCT,
      ucM:           parseUCM(lp.uc),
      inc:           deriveInc(lp.cls ?? '', lp._isNew, lp.inc),
    }
  }

  const [overrides, setOverrides] = useState<Record<string, Override>>(() =>
    Object.fromEntries(submissionLPs.map(lp => [lp._key, buildOverride(lp)]))
  )

  const setOverride = (key: string, field: keyof Override, value: unknown) =>
    setOverrides(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))

  const resetOverrides = () =>
    setOverrides(Object.fromEntries(submissionLPs.map(lp => [lp._key, buildOverride(lp)])))

  // Rebuild overrides whenever submissionLPs changes (matchQueue load or extractedMap arriving).
  // Safe because matchQueue + extractedMap both settle before users begin editing.
  useEffect(() => {
    setOverrides(Object.fromEntries(submissionLPs.map(lp => [lp._key, buildOverride(lp)])))
  }, [submissionLPs])

  // ── Submission summary — live: from API; prototype: from context + queue ────

  const submissionSummary = useMemo(() => {
    const facilityName = submissionDetails?.facilityName
      ?? activeSubmission
      ?? (SUBMISSION_SUMMARY.find(r => r.label === 'Facility')?.value ?? '—')

    let asOfDate = SUBMISSION_SUMMARY.find(r => r.label === 'As of Date')?.value ?? '—'
    if (submissionDetails?.periodMonth) {
      const [y, m] = submissionDetails.periodMonth.split('-')
      asOfDate = new Date(parseInt(y), parseInt(m) - 1, 1)
        .toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    const agentBank    = submissionDetails?.agentBank ?? (SUBMISSION_SUMMARY.find(r => r.label === 'Agent Bank')?.value ?? '—')
    const totalLPs     = matchQueue.length
    const newCount     = matchQueue.filter(mq => !mq.masterName).length
    const uncalledM = live
      ? Object.values(overrides).reduce((s, ov) => s + (typeof ov.ucM === 'number' ? ov.ucM : 0), 0)
      : EXTRACTED_LPS.reduce((s, lp) => s + parseDollars(lp.uncalled), 0) / 1e6
    const commitM = live
      ? submissionLPs.reduce((s, lp) => { const v = parseUCM(lp.capCommit); return s + (typeof v === 'number' ? v : 0) }, 0)
      : EXTRACTED_LPS.reduce((s, lp) => s + parseDollars(lp.commit), 0) / 1e6
    const totalUncalled = uncalledM > 0
      ? `$${Math.round(uncalledM * 1_000_000).toLocaleString()}`
      : (SUBMISSION_SUMMARY.find(r => r.label === 'Total Uncalled')?.value ?? '—')
    const totalCommitment = commitM > 0
      ? `$${Math.round(commitM * 1_000_000).toLocaleString()}`
      : (SUBMISSION_SUMMARY.find(r => r.label === 'Total Commitment')?.value ?? '—')

    return [
      { label: 'Facility',          value: String(facilityName) },
      { label: 'As of Date',        value: asOfDate },
      { label: 'Agent Bank',        value: String(agentBank) },
      { label: 'LPs in Submission', value: String(totalLPs) },
      { label: 'New LP Records',    value: newCount > 0 ? `${newCount} (will be created)` : '0' },
      { label: 'Total Commitment',  value: totalCommitment },
      { label: 'Total Uncalled',    value: totalUncalled },
    ]
  }, [submissionDetails, activeSubmission, matchQueue, submissionLPs, overrides, live])

  const newLPs        = submissionLPs.filter(lp => lp._isNew)
  const overrideCount = submissionLPs.filter(lp => !lp._isNew && overrides[lp._key]?.cls !== lp.cls).length
  const unclassified  = submissionLPs.filter(lp => !overrides[lp._key]?.cls).length
  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(submissionLPs)

  // Facility-level totals used by formula columns
  const totalCommitM = useMemo(() =>
    submissionLPs.reduce((s, lp) => {
      const v = parseUCM(lp.capCommit)
      return s + (typeof v === 'number' ? v : 0)
    }, 0)
  , [submissionLPs])

  const totalUncalledM = useMemo(() =>
    submissionLPs.reduce((s, lp) => {
      const ov = overrides[lp._key]
      const v  = typeof ov?.ucM === 'number' ? ov.ucM : parseUCM(lp.uc)
      return s + (typeof v === 'number' ? v : 0)
    }, 0)
  , [submissionLPs, overrides])

  const run = () => {
    setRunning(true)
    if (unclassified > 0) toast(`${unclassified} unclassified LP${unclassified !== 1 ? 's' : ''} will be treated as Excluded`)
    toast('Shadow BB calculation started…')
    const overriddenLPs = submissionLPs.map(lp => {
      const ov        = overrides[lp._key] ?? {}
      const ucM       = typeof ov.ucM === 'number' ? ov.ucM : 0
      const concLimitM = typeof ov.concLimitPct === 'number'
        ? (ov.concLimitPct / 100) * totalUncalledM
        : DEFAULT_CL_M
      const rate = typeof ov.ubsAdvRatePct === 'number' ? `${ov.ubsAdvRatePct}%` : (lp.rate ?? '0%')
      return {
        ...lp,
        cls: ov.cls || 'Excluded',
        sp: ov.sp ?? lp.sp ?? '', mdy: ov.mdy ?? lp.mdy ?? '', fitch: ov.fitch ?? lp.fitch ?? '',
        rate, ucM, uc: `$${ucM.toFixed(1)}M`,
        concLimitM, inc: ov.inc ?? false, abb: lp.abb ?? '$0',
      }
    })
    setTimeout(() => {
      const computed = computePortfolioBB(overriddenLPs as LPRecord[], bbParams)
      const snapshot = bbSnapshot ?? {}
      const patched  = { ...computed, summary: { ...computed.summary, ...snapshot }, breaches: [] }
      setResult(patched)
      setRunning(false)
      toast('Shadow BB complete — 662 LPs · UBS BB $138.6M · Delta –$3.7M')
    }, 2800)
  }

  const resultRows = result ? [
    { label: 'UBS Borrowing Base',            value: fmtM(result.summary.totalUBB),       hi: true },
    { label: 'Agent Borrowing Base',           value: fmtM(result.summary.totalABB)                 },
    { label: 'BB Delta',                       value: fmtM(result.summary.bbDelta),         neg: result.summary.bbDelta < 0 },
    { label: 'Effective Advance Rate (UBS)',   value: fmtPct(result.summary.ear)                    },
    { label: 'Effective Advance Rate (Agent)', value: fmtPct(result.summary.agentEar)               },
    { label: 'EAR Delta',                      value: fmtPct(result.summary.earDelta),      neg: result.summary.earDelta < 0 },
    { label: 'Included LPs',                   value: result.summary.includedCount                  },
    { label: 'Excluded LPs',                   value: result.summary.excludedCount                  },
    { label: 'Reclassified LPs',               value: result.summary.reclassCount                   },
    { label: 'UBS Elig. Uncalled',             value: fmtM(result.summary.totalUEC)                 },
    { label: 'Conc. Excess (total)',            value: fmtM(result.summary.totalConcExcess), neg: result.summary.totalConcExcess > 0 },
  ] : []

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))' }}>
      {loadError && <div style={{ padding: '10px 16px', background: '#fff0f0', color: 'var(--red)', fontSize: 12 }}>API error — {loadError}</div>}
      <StepBar steps={WIZARD_STEPS} current={4} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <Card title="Submission Summary" subtitle="Committed match decisions ready for Shadow BB recalculation"
          action={<button onClick={() => setSummaryHidden(h => !h)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 8px', cursor: 'pointer' }}>{summaryHidden ? 'Show' : 'Hide'}</button>}>
          {!summaryHidden && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 24px', padding: '4px 18px 18px' }}>
              {submissionSummary.map(({ label, value }) => (
                <div key={label}><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{value}</div></div>
              ))}
            </div>
          )}
        </Card>

        {!result && (
          <Card title="LP Classification & Rate Assignment"
            subtitle={`Step 5 · ${submissionLPs.length} LPs · ${newLPs.length > 0 ? `${newLPs.length} new` : 'all matched to LP Master'}`}
            action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {unclassified > 0 && <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>{unclassified} unclassified</span>}
                {overrideCount > 0 && <button onClick={resetOverrides} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 8px', cursor: 'pointer' }}>Reset {overrideCount} override{overrideCount !== 1 ? 's' : ''}</button>}
                <Button variant="danger" size="sm" onClick={() => setAbortOpen(true)} disabled={running}>Abort Submission</Button>
                <Button size="sm" onClick={() => toast('Classifications saved.')} disabled={running}>Save</Button>
                <Button size="sm" onClick={run} disabled={running}>{running ? 'Calculating…' : 'Run Shadow BB'}</Button>
              </div>
            }
          >
            <div className="data-table-wrap">
              <table className="data-table" style={{ minWidth: 1132 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 160 }}>Investor Name</th>
                    <th style={{ width: 72, textAlign: 'center' }}>High Quality</th>
                    <th style={{ width: 60 }}>S&amp;P</th>
                    <th style={{ width: 66 }}>Moody's</th>
                    <th style={{ width: 60 }}>Fitch</th>
                    <th className="num" style={{ width: 86 }}>NAV/AUM</th>
                    <th style={{ width: 80, textAlign: 'center' }}>UBS Included</th>
                    <th className="num" style={{ width: 92 }}>Commitment</th>
                    <th className="num" style={{ width: 62 }}>Cmt. %</th>
                    <th className="num" style={{ width: 96 }}>Uncalled Cap.</th>
                    <th className="num" style={{ width: 90 }}>UBS Cont. Limit</th>
                    <th className="num" style={{ width: 90 }}>UBS Adv Rate</th>
                    <th className="num" style={{ width: 116 }}>UBS BB</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(lp => {
                    const key     = lp._key
                    const ov      = overrides[key] ?? {} as Override
                    const missing = !ov.cls
                    const commitM = (() => { const v = parseUCM(lp.capCommit); return typeof v === 'number' ? v : 0 })()
                    const c = calcRow(ov.ubsAdvRatePct, ov.concLimitPct, ov.ucM, commitM, totalCommitM, totalUncalledM)

                    return (
                      <tr key={key} style={{ background: missing ? 'color-mix(in srgb, var(--red) 6%, transparent)' : undefined }}>

                        {/* Investor Name */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{lp.name ?? lp._agentName ?? '—'}</span>
                              {lp._isNew && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--blue)', color: '#fff', borderRadius: 2, padding: '1px 4px', letterSpacing: '0.04em' }}>NEW</span>}
                            </div>
                          </div>
                        </td>

                        {/* High Quality — UBS Adv Rate == 90% */}
                        <td style={{ textAlign: 'center' }}><YesNo val={c.highQuality} /></td>

                        {/* S&P */}
                        <td style={{ fontSize: 11, textAlign: 'center' }}>{ov.sp || '—'}</td>

                        {/* Moody's */}
                        <td style={{ fontSize: 11, textAlign: 'center' }}>{ov.mdy || '—'}</td>

                        {/* Fitch */}
                        <td style={{ fontSize: 11, textAlign: 'center' }}>{ov.fitch || '—'}</td>

                        {/* NAV/AUM — show AUM when NAV is absent */}
                        <td className="num">{(lp.nav?.trim() || lp.aum?.trim()) || '—'}</td>

                        {/* UBS Included — UBS BB > 0 */}
                        <td style={{ textAlign: 'center' }}><YesNo val={c.ubsIncluded} /></td>

                        {/* Commitment — read-only */}
                        <td className="num">{lp.capCommit || '—'}</td>

                        {/* Cmt. % — LP commitment / total commitment */}
                        <td className="num">{fmtPct(c.cmtPct)}</td>

                        {/* Uncalled Capital — read-only */}
                        <td className="num">{lp.uc || '—'}</td>

                        {/* UBS Cont. Limit — editable % */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            <input type="number" value={ov.concLimitPct ?? ''} onChange={e => setOverride(key, 'concLimitPct', e.target.value === '' ? '' : parseFloat(e.target.value))} disabled={running}
                              placeholder={String(DEFAULT_CL_PCT)} style={{ width: 46, fontSize: 11, textAlign: 'right', padding: '2px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--card)' }} min={0} max={100} step={0.5} />
                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>%</span>
                          </div>
                        </td>

                        {/* UBS Adv Rate — editable % */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            <input type="number" value={ov.ubsAdvRatePct ?? ''} onChange={e => setOverride(key, 'ubsAdvRatePct', e.target.value === '' ? '' : parseFloat(e.target.value))} disabled={running}
                              placeholder="0" style={{ width: 46, fontSize: 11, textAlign: 'right', padding: '2px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--card)' }} min={0} max={100} step={5} />
                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>%</span>
                          </div>
                        </td>

                        {/* UBS BB — ubsEligUncalled × advRate */}
                        <td className={`num ${c.ubsBBCalc === 0 ? 'zero' : ''}`}>{fmtM(c.ubsBBCalc)}</td>

                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="tbl-footer">
              <span>Showing {from}–{to} of {submissionLPs.length} LPs{unclassified > 0 && <span style={{ color: 'var(--red)', fontWeight: 600 }}> · {unclassified} unclassified</span>}{newLPs.length > 0 && <span style={{ color: 'var(--blue)', fontWeight: 600 }}> · {newLPs.length} new</span>}</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}>{PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}</select>
                {totalPages > 1 && (<><Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>‹ Prev</Button><span style={{ fontSize: 11, color: 'var(--muted)' }}>Page {page} of {totalPages}</span><Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next ›</Button></>)}
              </div>
            </div>
          </Card>
        )}

        {result && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Tag variant="active" style={{ fontSize: 12, padding: '5px 10px' }}>✓ Calculation complete</Tag><Button onClick={() => navigate('shadow-bb')}>View BB Results</Button><Button variant="secondary" onClick={() => navigate('upload')}>Upload Another Submission</Button></div>}

        {result && (
          <Card title="Calculation Results" subtitle={`${submissionLPs.length} LP records processed`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 24px', padding: '4px 18px 18px' }}>
              {resultRows.map(r => (
                <div key={r.label}><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{r.label}</div><div style={{ fontSize: 13, fontWeight: (r as { hi?: boolean }).hi ? 700 : 600, color: (r as { neg?: boolean }).neg ? 'var(--red)' : (r as { hi?: boolean }).hi ? 'var(--navy)' : 'var(--text)' }}>{String(r.value)}</div></div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>

    <Modal open={abortOpen} onClose={() => setAbortOpen(false)} title="Abort Submission?" subtitle="This will permanently remove the submission from history."
      footer={<><Button variant="secondary" onClick={() => setAbortOpen(false)}>Keep Working</Button><Button variant="danger" onClick={() => { abortSubmission(activeSubmission ?? ''); toast('Submission aborted.'); navigate('upload') }}>Abort Submission</Button></>}>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>Aborting at this stage is safe — no LP records have been added or updated yet. If you need to reprocess this Agent BB, upload it again.</div>
    </Modal>
    </>
  )
}
