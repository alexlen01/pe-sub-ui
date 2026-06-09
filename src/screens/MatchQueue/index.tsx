import { useState, useMemo, useEffect } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { useApp } from '../../context/AppContext'
import { useScreenMode } from '../../hooks/useScreenMode'
import Button from '../../components/ui/Button'
import Tag from '../../components/ui/Tag'
import Modal from '../../components/ui/Modal'
import StepBar from '../../components/ui/StepBar'
import { getMatchQueue } from '../../services/matchingService'
import { api } from '../../services/api'
import { WIZARD_STEPS } from '../../config/wizardConfig'
import { DEFAULT_THRESHOLDS, LEGAL_SUFFIXES, KNOWN_ABBREVIATIONS, ABBREV_REGEX_MAP } from '../../config/matchingConfig'
import { MATCH_QUEUE } from '../../data/matchQueueData'
import { normaliseName, jwSim, levSim, combineScores } from '../../utils/fuzzyMatch'

type QueueRow = (typeof MATCH_QUEUE)[0] & { status: string }

const SUFFIX_RE = new RegExp(`\\b(${LEGAL_SUFFIXES.filter(s => s.strip).map(s => s.abbr.replace('.', '\\.')).join('|')})\\b`, 'gi')

function buildNormSteps(name: string) {
  const steps: { label: string; rule: string; before: string; after: string }[] = []
  let cur = name
  const folded = cur.toLowerCase(); steps.push({ label: 'Case fold', rule: 'Lowercase all characters', before: cur, after: folded }); cur = folded
  const stripped = cur.replace(/[.,\-()]/g, ' ').replace(/\s+/g, ' ').trim(); if (stripped !== cur) { steps.push({ label: 'Strip punctuation', rule: 'Remove . , - ( ) characters', before: cur, after: stripped }); cur = stripped }
  const noSuffix = cur.replace(SUFFIX_RE, '').replace(/\s+/g, ' ').trim(); if (noSuffix !== cur) { steps.push({ label: 'Legal suffix strip', rule: 'Remove legal entity suffixes: ' + LEGAL_SUFFIXES.filter(s => s.strip).map(s => s.abbr).join(', '), before: cur, after: noSuffix }); cur = noSuffix }
  let s = cur; const acronymExpansions: string[] = []
  KNOWN_ABBREVIATIONS.forEach(({ token, expansion }) => { const re = new RegExp(`\\b${token}\\b`, 'gi'); if (re.test(s)) { acronymExpansions.push(`${token} → ${expansion}`); s = s.replace(re, expansion.toLowerCase()) } })
  s = s.replace(/\s+/g, ' ').trim(); if (s !== cur) { steps.push({ label: 'Acronym expansion', rule: acronymExpansions.join('; '), before: cur, after: s }); cur = s }
  let expanded = cur; const abbrevExpansions: string[] = []
  Object.entries(ABBREV_REGEX_MAP).forEach(([pat, full]) => { const re = new RegExp(`\\b${pat}\\b`, 'gi'); if (re.test(expanded)) { abbrevExpansions.push(`${pat.replace(/\\\./g, '.')} → ${full}`); expanded = expanded.replace(re, (full as string).toLowerCase()) } })
  expanded = expanded.replace(/\s+/g, ' ').trim(); if (expanded !== cur) { steps.push({ label: 'Abbrev expansion', rule: abbrevExpansions.join('; '), before: cur, after: expanded }); cur = expanded }
  return { steps, normalised: cur }
}

function verdictFor(score: number) {
  return score >= DEFAULT_THRESHOLDS.autoAccept ? 'Auto-accept' : score >= DEFAULT_THRESHOLDS.reviewQueue ? 'Review queue' : 'Below threshold'
}

function strHash(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return (h >>> 0) / 0x100000000 }
const DECOY_SUFFIXES = ['Capital Partners', 'Capital Management', 'Asset Management', 'Investment Group', 'Capital Advisors', 'Investment Partners', 'Capital Fund', 'Investment Trust']
function makeDecoyName(seed: string, words: string[], salt: string) { const r = strHash(seed + salt); const sfx = DECOY_SUFFIXES[Math.floor(r * DECOY_SUFFIXES.length)]; const meaningful = words.filter(w => w.length > 3); const base = meaningful.length >= 2 ? `${meaningful[0]} ${meaningful[Math.floor(strHash(seed + salt + '2') * (meaningful.length - 1)) + 1]}` : meaningful[0] || words[0]; return `${base} ${sfx}` }

function buildParentSignal(r: QueueRow) {
  if (!r.agentParent) return null
  const masterParent = r.masterParent || r.masterName || ''
  if (!masterParent) return { agentParent: r.agentParent, masterParent: '', score: null as number | null, adjustment: 0, effect: 'unresolved' }
  const normA = normaliseName(r.agentParent), normM = normaliseName(masterParent)
  const score = combineScores(jwSim(normA, normM), levSim(normA, normM))
  let adjustment = 0, effect = 'neutral'
  if (score >= 85) { adjustment = +3; effect = 'boost' } else if (score >= 70) { adjustment = +1; effect = 'partial' } else if (score < 50) { adjustment = -2; effect = 'penalty' }
  return { agentParent: r.agentParent, masterParent, score, adjustment, effect }
}

function buildCandidates(r: QueueRow) {
  const normAgent = normaliseName(r.agentName)
  if (r.masterName) {
    const normMaster = normaliseName(r.masterName), jw1 = jwSim(normAgent, normMaster), lv1 = levSim(normAgent, normMaster), co1 = combineScores(jw1, lv1)
    const mWords = r.masterName.split(/\s+/), d1 = makeDecoyName(r.masterName, mWords, 'α'), d2 = makeDecoyName(r.masterName, mWords, 'β')
    const jw2 = jwSim(normAgent, normaliseName(d1)), lv2 = levSim(normAgent, normaliseName(d1)), co2 = combineScores(jw2, lv2)
    const jw3 = jwSim(normAgent, normaliseName(d2)), lv3 = levSim(normAgent, normaliseName(d2)), co3 = combineScores(jw3, lv3)
    return [{ name: r.masterName, jw: jw1, lev: lv1, combined: co1, verdict: verdictFor(co1) }, { name: d1, jw: jw2, lev: lv2, combined: co2, verdict: 'Discarded' }, { name: d2, jw: jw3, lev: lv3, combined: co3, verdict: 'Discarded' }]
  }
  return []
}

const scoreColor = (s: number) => s >= 95 ? 'var(--green)' : s >= 80 ? 'var(--amber)' : 'var(--red)'
const scoreBand = (s: number) => s >= 95 ? 'Auto-accept' : s >= 80 ? 'Review' : 'No Match'
const bandVariant = (s: number) => s >= 95 ? 'active' : s >= 80 ? 'pending' : 'excl'

function MatchDetailPanel({ row, onClose, onResolve, thresholds }: { row: QueueRow; onClose: () => void; onResolve: ((id: number, action: string) => void) | null; thresholds: typeof DEFAULT_THRESHOLDS }) {
  const { steps, normalised } = buildNormSteps(row.agentName)
  const candidates = buildCandidates(row), topCandidate = candidates[0]
  const parentSignal = buildParentSignal(row)
  const verdictColor = (v: string) => v === 'Auto-accept' ? 'var(--green)' : v === 'Review queue' ? 'var(--amber)' : 'var(--red)'
  const parentEffectLabel = (sig: ReturnType<typeof buildParentSignal>) => {
    if (!sig) return null
    if (sig.score === null) return { text: 'No LP Master parent to compare', color: 'var(--muted)' }
    if (sig.effect === 'boost')   return { text: `Strong match · score +${sig.adjustment} pts`, color: 'var(--green)' }
    if (sig.effect === 'partial') return { text: `Partial match · score +${sig.adjustment} pt`,  color: 'var(--amber)' }
    if (sig.effect === 'penalty') return { text: `Mismatch · score ${sig.adjustment} pts`,        color: 'var(--red)'   }
    return { text: 'Near match · no adjustment', color: 'var(--muted)' }
  }
  return (
    <div style={{ width: 360, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', background: 'var(--card)', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>Match Analysis</div><div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>#{row.id} - {row.facility}</div></div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--muted)', lineHeight: 1, padding: 2 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Agent Input</div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{row.agentName}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Normalised: <span style={{ color: 'var(--text)' }}>{normalised}</span></div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Normalisation Pipeline — {steps.length} step{steps.length !== 1 ? 's' : ''}</div>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, paddingBottom: i < steps.length - 1 ? 12 : 0, position: 'relative' }}>
              {i < steps.length - 1 && <div style={{ position: 'absolute', left: 11, top: 24, bottom: 0, width: 1, background: 'var(--border)' }} />}
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--blue)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', marginBottom: 2 }}>{step.label}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{step.rule}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', padding: '2px 6px', borderRadius: 3 }}><span style={{ color: 'var(--muted)' }}>IN  </span>{step.before}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text)', background: 'var(--tbl)', padding: '2px 6px', borderRadius: 3, marginTop: 2 }}><span style={{ color: 'var(--green)' }}>OUT </span>{step.after}</div>
              </div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Parent / Sponsor Signal</div>
          {parentSignal ? (() => { const eff = parentEffectLabel(parentSignal)!; return (
            <div style={{ background: 'var(--tbl)', borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span style={{ color: 'var(--muted)' }}>Agent doc</span><span style={{ fontWeight: 600 }}>{parentSignal.agentParent}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span style={{ color: 'var(--muted)' }}>LP Master</span><span style={{ fontWeight: 600, color: parentSignal.masterParent ? 'var(--text)' : 'var(--muted)', fontStyle: parentSignal.masterParent ? 'normal' : 'italic' }}>{parentSignal.masterParent || 'not available'}</span></div>
              {typeof parentSignal.score === 'number' && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span style={{ color: 'var(--muted)' }}>Match score</span><span style={{ fontWeight: 700, color: scoreColor(parentSignal.score) }}>{parentSignal.score}%</span></div>}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 5, fontSize: 10, fontWeight: 700, color: eff.color }}>{eff.text}</div>
            </div>
          )})() : <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', padding: '6px 0' }}>Not provided in agent document — signal unavailable</div>}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Candidate Matches</div>
          {candidates.length === 0
            ? <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', padding: '6px 0' }}>No candidates found in LP Master</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr style={{ background: 'var(--tbl)' }}>{['LP Master Candidate','JW','Lev','Score','Verdict'].map(h => <th key={h} style={{ padding: '5px 6px', textAlign: h === 'LP Master Candidate' ? 'left' : 'center', color: 'var(--navy)', fontWeight: 700, borderBottom: '1px solid var(--border)', fontSize: 10 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {candidates.map((c, i) => (
                    <tr key={i} style={{ background: i === 0 && row.masterName ? 'var(--blue-lt)' : 'transparent' }}>
                      <td style={{ padding: '5px 6px', borderBottom: '1px solid var(--border)', fontWeight: i === 0 ? 600 : 400 }}>{c.name}</td>
                      <td style={{ padding: '5px 6px', borderBottom: '1px solid var(--border)', textAlign: 'center', color: 'var(--muted)' }}>{typeof c.jw === 'number' ? `${c.jw}%` : c.jw}</td>
                      <td style={{ padding: '5px 6px', borderBottom: '1px solid var(--border)', textAlign: 'center', color: 'var(--muted)' }}>{typeof c.lev === 'number' ? `${c.lev}%` : c.lev}</td>
                      <td style={{ padding: '5px 6px', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: typeof c.combined === 'number' ? scoreColor(c.combined) : 'var(--muted)' }}>{typeof c.combined === 'number' ? `${c.combined}%` : c.combined}</td>
                      <td style={{ padding: '5px 6px', borderBottom: '1px solid var(--border)', textAlign: 'center', color: verdictColor(c.verdict), fontWeight: 600, fontSize: 10 }}>{c.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>}
        </div>
        <div style={{ background: 'var(--tbl)', borderRadius: 6, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Algorithm Decision</div>
          {topCandidate && <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>Combined = JW×{thresholds.jwWeight} + Lev×{thresholds.levWeight}{typeof topCandidate.combined === 'number' && <span> = <strong style={{ color: scoreColor(topCandidate.combined) }}>{topCandidate.combined}%</strong></span>}</div>}
          {topCandidate
            ? <div style={{ fontSize: 12 }}>Combined score <strong style={{ color: scoreColor(topCandidate.combined ?? 0) }}>{topCandidate.combined}%</strong> — {topCandidate.verdict === 'Auto-accept' ? 'above auto-accept threshold · committed without review.' : 'proposed for review.'}<div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 11 }}>Proposed match: <strong style={{ color: 'var(--text)' }}>{row.masterName}</strong></div></div>
            : <div style={{ fontSize: 12 }}>No candidates found in LP Master — a <strong>new LP record</strong> will be created.</div>}
        </div>
      </div>
      {onResolve && row.status !== 'Auto-accept' && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          {row.status !== 'Accepted' && <Button size="sm" onClick={() => onResolve(row.id, 'Accepted')}>✓ Accept</Button>}
          {row.status !== 'Rejected' && <Button variant="ghost" size="sm" onClick={() => onResolve(row.id, 'Rejected')}>✕ Reject</Button>}
        </div>
      )}
    </div>
  )
}

export default function MatchQueue() {
  const { toast, navigate, activeSubmission, abortSubmission, activeSubmissionId } = useApp()
  const mode = useScreenMode()
  const live = mode === 'live'
  const [queue, setQueue] = useState<QueueRow[]>(MATCH_QUEUE as QueueRow[])
  const [statusFilter, setStatusFilter] = useState('Pending')
  const [bandFilter, setBandFilter] = useState('')
  const [checked, setChecked] = useState(new Set<number>())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [abortOpen, setAbortOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (mode === 'detecting') return
    setLoadError(null)
    getMatchQueue(live, activeSubmissionId ?? 0)
      .then(q => setQueue(q as QueueRow[]))
      .catch(e => setLoadError(String(e)))
  }, [mode, activeSubmissionId])

  const filtered = useMemo(() => queue.filter(r => {
    const matchStatus = !statusFilter || r.status === statusFilter
    const matchBand   = !bandFilter   || scoreBand(r.score) === bandFilter
    return matchStatus && matchBand
  }), [queue, statusFilter, bandFilter])

  const allChecked = filtered.length > 0 && filtered.every(r => checked.has(r.id))
  const someChecked = !allChecked && filtered.some(r => checked.has(r.id))
  const toggleAll = () => setChecked(prev => { const next = new Set(prev); if (allChecked) filtered.forEach(r => next.delete(r.id)); else filtered.forEach(r => next.add(r.id)); return next })
  const toggleRow = (id: number) => setChecked(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })

  const resolve = (ids: Set<number>, action: string) => {
    setQueue(prev => prev.map(r => ids.has(r.id) ? { ...r, status: action } : r))
    setChecked(new Set())
    toast(`${ids.size} match${ids.size > 1 ? 'es' : ''} ${action === 'Accepted' ? 'accepted' : 'rejected'}.`)
    ids.forEach(id => api.matching.decide(id, action).catch(() => {}))
  }
  const resolveOne = (id: number, action: string) => {
    setQueue(prev => prev.map(r => r.id === id ? { ...r, status: action } : r))
    toast(`Match ${action.toLowerCase()}.`)
    api.matching.decide(id, action).catch(() => {})
  }

  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(filtered)
  const pending = queue.filter(r => r.status === 'Pending').length
  const autoAccepted = queue.filter(r => r.status === 'Accepted' && r.score >= 95).length
  const selectionIds = new Set([...checked].filter(id => filtered.some(r => r.id === id)))
  const selectedRow = selectedId ? queue.find(r => r.id === selectedId) ?? null : null

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))' }}>
      {loadError && <div style={{ padding: '10px 16px', background: '#fff0f0', color: 'var(--red)', fontSize: 12 }}>API error — {loadError}</div>}
      <StepBar steps={WIZARD_STEPS} current={3} />
      {autoAccepted > 0 && (
        <div style={{ padding: '7px 20px', background: 'var(--blue-lt)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700 }}>✓ {autoAccepted} records auto-matched</span>
          <span style={{ color: 'var(--muted)' }}>— extraction confidence ≥ 95% · committed to LP Master without review</span>
          <button onClick={() => setStatusFilter('Accepted')} style={{ marginLeft: 8, background: 'none', border: '1px solid var(--blue)', borderRadius: 4, padding: '1px 8px', fontSize: 11, color: 'var(--blue)', cursor: 'pointer' }}>View</button>
        </div>
      )}
      <div className="filter-bar">
        <select style={{ width: 150 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">Status: All</option><option value="Pending">Pending</option><option value="Accepted">Accepted</option><option value="Rejected">Rejected</option></select>
        <select style={{ width: 170 }} value={bandFilter} onChange={e => setBandFilter(e.target.value)}><option value="">Confidence: All</option><option value="Review">Review (80–94%)</option><option value="No Match">No Match (&lt;80%)</option></select>
        {selectionIds.size > 0 && (<><span style={{ fontSize: 11, color: 'var(--muted)' }}>{selectionIds.size} selected</span><Button size="sm" onClick={() => resolve(selectionIds, 'Accepted')}>✓ Accept Selected</Button><Button variant="danger" size="sm" onClick={() => resolve(selectionIds, 'Rejected')}>✕ Reject Selected</Button></>)}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{pending} pending · {filtered.length} shown</span>
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        <Button variant="danger" size="sm" onClick={() => setAbortOpen(true)}>Abort Submission</Button>
        <Button size="sm" onClick={() => { toast('Match decisions committed to lp_master.'); navigate('run-shadow-bb') }}>Commit Decisions</Button>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
          <table className="data-table" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked }} onChange={toggleAll} /></th>
                <th>Agent LP Name</th><th>Matched LP Master Record</th>
                <th style={{ width: 70, textAlign: 'right' }}>Conf.</th>
                <th style={{ width: 96 }}>Quality</th><th style={{ width: 82 }}>Status</th>
                <th style={{ width: 160, padding: '8px 6px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(r => (
                <tr key={r.id} onClick={() => setSelectedId(prev => prev === r.id ? null : r.id)} style={{ opacity: r.status !== 'Pending' ? 0.55 : 1, cursor: 'pointer', background: selectedId === r.id ? 'var(--blue-lt)' : undefined }}>
                  <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={checked.has(r.id)} onChange={() => toggleRow(r.id)} /></td>
                  <td><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={r.agentName}>{r.agentName}</div></td>
                  <td><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.masterName ? 'var(--text)' : 'var(--muted)', fontStyle: r.masterName ? 'normal' : 'italic' }} title={r.masterName ?? ''}>{r.masterName ?? 'No match found — new LP record will be created'}</div></td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: scoreColor(r.score) }}>{r.score}%</td>
                  <td><Tag variant={bandVariant(r.score)}>{scoreBand(r.score)}</Tag></td>
                  <td><Tag variant={r.status === 'Accepted' ? 'active' : r.status === 'Rejected' ? 'excl' : 'pending'}>{r.status}</Tag></td>
                  <td style={{ padding: '7px 6px' }} onClick={e => e.stopPropagation()}>
                    {r.status === 'Pending' ? (<div style={{ display: 'flex', gap: 6 }}><Button size="sm" onClick={() => resolveOne(r.id, 'Accepted')}>✓ Accept</Button><Button variant="ghost" size="sm" onClick={() => resolveOne(r.id, 'Rejected')}>✕ Reject</Button></div>) : (<span style={{ fontSize: 11, color: 'var(--blue)', cursor: 'pointer', fontWeight: 600 }} onClick={() => resolveOne(r.id, 'Pending')}>Undo</span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="tbl-footer">
            <span>Showing {from}–{to} of {filtered.length} · {queue.filter(r => r.status === 'Accepted').length} accepted · {queue.filter(r => r.status === 'Rejected').length} rejected · {pending} pending</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}>{PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}</select>
              {totalPages > 1 && (<><Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>‹ Prev</Button><span style={{ fontSize: 11, color: 'var(--muted)' }}>Page {page} of {totalPages}</span><Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next ›</Button></>)}
              <Button size="sm" onClick={() => { toast('Match decisions committed to lp_master.'); navigate('run-shadow-bb') }}>Commit Decisions</Button>
            </div>
          </div>
        </div>
        {selectedRow
          ? <MatchDetailPanel row={selectedRow} onClose={() => setSelectedId(null)} onResolve={resolveOne} thresholds={DEFAULT_THRESHOLDS} />
          : <div style={{ width: 360, flexShrink: 0, alignSelf: 'flex-start', border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, color: 'var(--muted)', textAlign: 'center', background: 'var(--tbl)' }}><div style={{ fontSize: 22, opacity: 0.35 }}>⌕</div><div style={{ fontSize: 12, fontWeight: 600 }}>Match Analysis</div><div style={{ fontSize: 11, lineHeight: 1.5 }}>Click any row to review the normalisation pipeline and candidate matches.</div></div>}
      </div>
    </div>
    <Modal open={abortOpen} onClose={() => setAbortOpen(false)} title="Abort Submission?" subtitle="This will permanently remove the submission from history."
      footer={<><Button variant="secondary" onClick={() => setAbortOpen(false)}>Keep Working</Button><Button variant="danger" onClick={() => { abortSubmission(activeSubmission ?? ''); toast('Submission aborted.'); navigate('upload') }}>Abort Submission</Button></>}>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>Aborting at this stage is safe — no LP records have been added or updated yet. If you need to reprocess this Agent BB, upload it again.</div>
    </Modal>
    </>
  )
}
