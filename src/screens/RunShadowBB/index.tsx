import { useState, useMemo, useEffect } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { useApp } from '../../context/AppContext'
import { useScreenMode } from '../../hooks/useScreenMode'
import StepBar from '../../components/ui/StepBar'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Tag from '../../components/ui/Tag'
import Modal from '../../components/ui/Modal'
import { getSubmissionSummary } from '../../services/matchingService'
import { WIZARD_STEPS } from '../../config/wizardConfig'
import { BUSA_RATES, computePortfolioBB, fmtM, fmtPct } from '../../services/bbCalculationService'
import { MATCH_QUEUE } from '../../data/matchQueueData'
import { getMatchQueue } from '../../services/matchingService'
import type { LPRecord } from '../../services/lpService'

const submissionSummary = getSubmissionSummary()
const CLS_OPTIONS = ['', 'Rated', 'Unrated >2bn', 'Unrated 1–2bn', 'Eligible', 'Excluded']
const DEFAULT_CL_M = 25

function parsePct(str: string | undefined | null): number | '' {
  if (!str || str === '—') return ''
  return parseFloat(String(str).replace('%', '')) || ''
}
function parseUCM(str: string | undefined | null): number | '' {
  if (!str) return ''
  const m = String(str).match(/\$?([\d,.]+)M/)
  return m ? parseFloat(m[1].replace(',', '')) : ''
}

type SubmissionLP = Partial<LPRecord> & { _key: string; _isNew: boolean; _agentName: string; lei?: string }
type Override = { cls: string; busaRatePct: number | ''; agentRatePct: number | ''; concLimitM: number; ucM: number | '' }

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

  useEffect(() => {
    if (mode === 'detecting') return
    setLoadError(null)
    getMatchQueue(live, activeSubmissionId ?? 0)
      .then(q => setMatchQueue(q as typeof MATCH_QUEUE))
      .catch(e => setLoadError(String(e)))
  }, [mode])

  const submissionLPs = useMemo<SubmissionLP[]>(() => {
    return matchQueue.map(mq => {
      const master = lpData.find(lp => lp.name === mq.masterName)
      return master
        ? { ...master, _key: `lp-${master.rank}`, _isNew: false, _agentName: mq.agentName }
        : { _key: `new-${mq.id}`, _isNew: true, _agentName: mq.agentName, name: mq.agentName, cls: 'Eligible', agentRate: '', uc: '', abb: '$0', inc: true, rcl: false, rank: undefined, region: '' as LPRecord['region'], ig: false, sp: '', mdy: '', fitch: '', aum: '', nav: '', capCommit: '', notes: '' }
    })
  }, [lpData, matchQueue])

  const [overrides, setOverrides] = useState<Record<string, Override>>(() =>
    Object.fromEntries(submissionLPs.map(lp => [lp._key, {
      cls:          lp.cls ?? '',
      busaRatePct:  lp.cls ? (BUSA_RATES[lp.cls] ?? 0) * 100 : '',
      agentRatePct: parsePct(lp.agentRate),
      concLimitM:   bbParams.concLimitM ?? DEFAULT_CL_M,
      ucM:          parseUCM(lp.uc),
    }]))
  )

  const setOverride = (key: string, field: keyof Override, value: unknown) =>
    setOverrides(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))

  const handleClsChange = (key: string, newCls: string) => {
    const derivedRate = newCls ? (BUSA_RATES[newCls] ?? 0) * 100 : ''
    setOverrides(prev => ({ ...prev, [key]: { ...prev[key], cls: newCls, busaRatePct: derivedRate } }))
  }

  const resetOverrides = () => setOverrides(Object.fromEntries(submissionLPs.map(lp => [lp._key, {
    cls:          lp.cls ?? '',
    busaRatePct:  lp.cls ? (BUSA_RATES[lp.cls] ?? 0) * 100 : '',
    agentRatePct: parsePct(lp.agentRate),
    concLimitM:   bbParams.concLimitM ?? DEFAULT_CL_M,
    ucM:          parseUCM(lp.uc),
  }])))

  const newLPs        = submissionLPs.filter(lp => lp._isNew)
  const overrideCount = submissionLPs.filter(lp => !lp._isNew && overrides[lp._key]?.cls !== lp.cls).length
  const unclassified  = submissionLPs.filter(lp => !overrides[lp._key]?.cls).length
  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(submissionLPs)

  const run = () => {
    setRunning(true)
    if (unclassified > 0) toast(`${unclassified} unclassified LP${unclassified !== 1 ? 's' : ''} will be treated as Excluded`)
    toast('Shadow BB calculation started…')
    const overriddenLPs = submissionLPs.map(lp => {
      const ov = overrides[lp._key] ?? {}
      return { ...lp, cls: ov.cls || 'Excluded', ucM: typeof ov.ucM === 'number' ? ov.ucM : 0, uc: typeof ov.ucM === 'number' ? `$${ov.ucM.toFixed(1)}M` : '$0', concLimitM: ov.concLimitM ?? DEFAULT_CL_M, inc: lp._isNew ? (!!ov.cls && ov.cls !== 'Excluded') : lp.inc, abb: lp.abb ?? '$0' }
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
            subtitle={`Step 3b–3c · ${submissionLPs.length} LPs · ${newLPs.length > 0 ? `${newLPs.length} new` : 'all matched to LP Master'}`}
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
              <table className="data-table compact" style={{ minWidth: 912, tableLayout: 'fixed' }}>
                <colgroup><col style={{ width: 230 }} /><col style={{ width: 80 }} /><col style={{ width: 152 }} /><col style={{ width: 92 }} /><col style={{ width: 92 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 52 }} /></colgroup>
                <thead>
                  <tr>
                    <th>Investor Name</th><th>LEI / ID</th><th>UBS Classification</th>
                    <th style={{ textAlign: 'center' }}>BUSA Rate %</th><th style={{ textAlign: 'center' }}>Agent Rate %</th>
                    <th style={{ textAlign: 'center' }}>Conc. Limit $M</th><th style={{ textAlign: 'center' }}>Uncalled Cap. $M</th>
                    <th style={{ textAlign: 'center' }}>Incl.</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(lp => {
                    const key = lp._key; const ov = overrides[key] ?? {} as Override
                    const cls = ov.cls ?? ''; const included = cls && cls !== 'Excluded' && (lp._isNew ? true : lp.inc)
                    const changed = !lp._isNew && cls !== (lp.cls ?? ''); const missing = !cls
                    return (
                      <tr key={key} style={{ background: missing ? 'color-mix(in srgb, var(--red) 6%, transparent)' : changed ? 'var(--amber-lt)' : undefined }}>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><strong style={{ fontSize: 12 }}>{lp.name}</strong>{lp._isNew && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--blue)', color: '#fff', borderRadius: 2, padding: '1px 4px', letterSpacing: '0.04em' }}>NEW</span>}{changed && <span style={{ fontSize: 10, color: 'var(--amber)' }}>was: {lp.cls}</span>}</div></td>
                        <td style={{ fontFamily: 'monospace', fontSize: 10, color: (lp as LPRecord & { lei?: string }).lei ? 'var(--muted)' : 'var(--border)', letterSpacing: '0.02em' }}>{(lp as LPRecord & { lei?: string }).lei || '—'}</td>
                        <td><select value={cls} onChange={e => handleClsChange(key, e.target.value)} disabled={running} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 3, border: missing ? '1px solid var(--red)' : '1px solid var(--border)', background: 'var(--card)', width: 148 }}><option value="">{lp._isNew ? '— select —' : '— select —'}</option>{CLS_OPTIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}</select></td>
                        <td style={{ textAlign: 'center' }}><input type="number" value={ov.busaRatePct ?? ''} onChange={e => setOverride(key, 'busaRatePct', e.target.value === '' ? '' : parseFloat(e.target.value))} disabled={running} placeholder="0" style={{ width: 52, fontSize: 11, textAlign: 'right', padding: '2px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--card)' }} min={0} max={100} step={5} /><span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2 }}>%</span></td>
                        <td style={{ textAlign: 'center' }}><input type="number" value={ov.agentRatePct ?? ''} onChange={e => setOverride(key, 'agentRatePct', e.target.value === '' ? '' : parseFloat(e.target.value))} disabled={running} placeholder="0" style={{ width: 52, fontSize: 11, textAlign: 'right', padding: '2px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--card)' }} min={0} max={100} step={5} /><span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2 }}>%</span></td>
                        <td style={{ textAlign: 'center' }}><div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><span style={{ fontSize: 10, color: 'var(--muted)' }}>$</span><input type="number" value={ov.concLimitM ?? ''} onChange={e => setOverride(key, 'concLimitM', e.target.value === '' ? '' : parseFloat(e.target.value))} disabled={running} placeholder={String(DEFAULT_CL_M)} style={{ width: 48, fontSize: 11, textAlign: 'right', padding: '2px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--card)' }} min={0} step={5} /><span style={{ fontSize: 10, color: 'var(--muted)' }}>M</span></div></td>
                        <td style={{ textAlign: 'center' }}><div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><span style={{ fontSize: 10, color: 'var(--muted)' }}>$</span><input type="number" value={ov.ucM ?? ''} onChange={e => setOverride(key, 'ucM', e.target.value === '' ? '' : parseFloat(e.target.value))} disabled={running} placeholder="0" style={{ width: 52, fontSize: 11, textAlign: 'right', padding: '2px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--card)' }} min={0} step={0.1} /><span style={{ fontSize: 10, color: 'var(--muted)' }}>M</span></div></td>
                        <td style={{ textAlign: 'center' }}>{cls ? <Tag variant={included ? 'active' : 'excl'}>{included ? 'Y' : 'N'}</Tag> : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}</td>
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
