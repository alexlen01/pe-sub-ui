import { useState, useMemo, useEffect, useRef } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { SortableHeader, useSortableRows } from '../../hooks/useTableSort'
import { useColumnResize } from '../../hooks/useColumnResize'
import { useApp } from '../../context/AppContext'
import Button from '../../components/ui/Button'
import Tag from '../../components/ui/Tag'
import Modal from '../../components/ui/Modal'
import StepBar from '../../components/ui/StepBar'
import DraggablePanel from '../../components/ui/DraggablePanel'
import { getMatchQueue } from '../../services/matchingService'
import { api } from '../../services/api'
import { getMatchingConfig, getWizardConfig } from '../../services/configService'
import { formatPercentageValue } from '../../utils/percentage'
import { normaliseName, jwSim, levSim, combineScores } from '../../utils/fuzzyMatch'
import { analysisCandidates, normalisedAgentName } from './matchAnalysis'
import type { MatchAnalysis, MatchingConfig, MatchingThresholds } from '../../services/api'

type QueueRow = Awaited<ReturnType<typeof getMatchQueue>>[0] & { status: string; matchDetails?: MatchAnalysis | null }

// Agent name / matched master / ultimate parent — the flexible, text-length-driven columns. Below
// this width they stop being readable, so the table scrolls horizontally instead of squeezing them.
// The floor also has to clear the longest of the three headers, "Ultimate Parent (To Be Applied)"
// — 181px of 12px bold Segoe UI plus the 36px side padding and the 13px sort indicator — and that
// column only draws a 33% share of the floor, so the per-column floor carries the headroom.
const NAME_COLS = 3
const MIN_NAME_COL_PX = 240

function suffixRe(config: MatchingConfig): RegExp | null {
  const suffixes = config.legalSuffixes.filter(s => s.strip).map(s => s.abbr.replace('.', '\\.'))
  return suffixes.length ? new RegExp(`\\b(${suffixes.join('|')})\\b`, 'gi') : null
}

function buildNormSteps(name: string, config: MatchingConfig) {
  const steps: { label: string; rule: string; before: string; after: string }[] = []
  let cur = name
  const folded = cur.toLowerCase(); steps.push({ label: 'Case fold', rule: 'Lowercase all characters', before: cur, after: folded }); cur = folded
  const stripped = cur.replace(/[.,\-()]/g, ' ').replace(/\s+/g, ' ').trim(); if (stripped !== cur) { steps.push({ label: 'Strip punctuation', rule: 'Remove . , - ( ) characters', before: cur, after: stripped }); cur = stripped }
  const suffix = suffixRe(config)
  const noSuffix = suffix ? cur.replace(suffix, '').replace(/\s+/g, ' ').trim() : cur; if (noSuffix !== cur) { steps.push({ label: 'Legal suffix strip', rule: 'Remove legal entity suffixes: ' + config.legalSuffixes.filter(s => s.strip).map(s => s.abbr).join(', '), before: cur, after: noSuffix }); cur = noSuffix }
  const retired = cur.replace(/\bret\s+sys(?:tem)?\b/g, 'retirement system').replace(/\bret\b/g, 'retirement'); if (retired !== cur) { steps.push({ label: 'Retirement normalize', rule: 'Ret. Sys. → retirement system; Ret. → retirement', before: cur, after: retired }); cur = retired }
  let s = cur; const acronymExpansions: string[] = []
  config.knownAbbreviations.forEach(({ token, expansion }) => { const re = new RegExp(`\\b${token}\\b`, 'gi'); if (re.test(s)) { acronymExpansions.push(`${token} → ${expansion}`); s = s.replace(re, expansion.toLowerCase()) } })
  s = s.replace(/\s+/g, ' ').trim(); if (s !== cur) { steps.push({ label: 'Acronym expansion', rule: acronymExpansions.join('; '), before: cur, after: s }); cur = s }
  let expanded = cur; const abbrevExpansions: string[] = []
  Object.entries(config.abbrevRegexMap ?? {}).forEach(([pat, full]) => { const re = new RegExp(`\\b${pat}\\b`, 'gi'); if (re.test(expanded)) { abbrevExpansions.push(`${pat.replace(/\\\./g, '.')} → ${full}`); expanded = expanded.replace(re, (full as string).toLowerCase()) } })
  expanded = expanded.replace(/\s+/g, ' ').trim(); if (expanded !== cur) { steps.push({ label: 'Abbrev expansion', rule: abbrevExpansions.join('; '), before: cur, after: expanded }); cur = expanded }
  return { steps, normalised: cur }
}

function buildParentSignal(r: QueueRow, config: MatchingConfig) {
  if (!r.agentParent) return null
  const masterParent = r.masterParent || r.masterName || ''
  if (!masterParent) return { agentParent: r.agentParent, masterParent: '', score: null as number | null, adjustment: 0, effect: 'unresolved' }
  const normA = normaliseName(r.agentParent, config), normM = normaliseName(masterParent, config)
  const score = combineScores(jwSim(normA, normM), levSim(normA, normM), config.thresholds)
  let adjustment = 0, effect = 'neutral'
  if (score >= 85) { adjustment = +3; effect = 'boost' } else if (score >= 70) { adjustment = +1; effect = 'partial' } else if (score < 50) { adjustment = -2; effect = 'penalty' }
  return { agentParent: r.agentParent, masterParent, score, adjustment, effect }
}

/**
 * Whose credit profile an Accept would actually apply (LP mapping design, Phase 3/4).
 *
 * A match against a feeder or SPV routes up to its ultimate parent, so the analyst must see that
 * entity before deciding — the ratings, LP category and advance rate come from there. Three states,
 * deliberately distinct: a resolved parent, "Self" when the match is already the ultimate entity,
 * and no match at all (a new LP record, so nothing to apply).
 */
export function appliedEntity(r: Pick<QueueRow, 'masterName' | 'masterParent'>): { label: string; routed: boolean; matched: boolean } {
  if (!r.masterName) return { label: '', routed: false, matched: false }
  const parent = (r.masterParent ?? '').trim()
  return parent
    ? { label: parent, routed: true, matched: true }
    : { label: 'Self', routed: false, matched: true }
}

const scoreColor = (s: number) => s >= 95 ? 'var(--green)' : s >= 80 ? 'var(--amber)' : 'var(--danger)'
const scoreBand = (s: number, thresholds: MatchingThresholds) =>
  s >= thresholds.autoAccept ? 'Auto-accept' : s >= thresholds.reviewQueue ? 'Review' : 'No Match'
const bandVariant = (s: number, thresholds: MatchingThresholds) =>
  s >= thresholds.autoAccept ? 'active' : s >= thresholds.reviewQueue ? 'pending' : 'excl'

/**
 * Match Analysis for one queue row.
 *
 * `overlay` makes the panel fill its parent instead of sitting in a fixed 360px column — the
 * docked-overlay mode, where the surrounding `DraggablePanel` owns the positioning class. The
 * inline mode is kept for any caller that still wants it beside a narrower table.
 */
function MatchDetailPanel({ row, onClose, onResolve, onDiscard, config, overlay }: { row: QueueRow; onClose: () => void; onResolve: ((id: number, action: string) => void) | null; onDiscard?: (id: number) => void; config: MatchingConfig; overlay?: boolean }) {
  const thresholds = config.thresholds
  const { steps, normalised: reconstructed } = buildNormSteps(row.agentName, config)
  const normalised = normalisedAgentName(row, reconstructed)
  const candidates = analysisCandidates(row, config), topCandidate = candidates[0]
  const hasProposedMatch = !!row.masterName
  const parentSignal = buildParentSignal(row, config)
  const verdictColor = (v: string) => v === 'Auto-accept' ? 'var(--green)' : v.startsWith('Review') ? 'var(--amber)' : 'var(--danger)'
  const parentEffectLabel = (sig: ReturnType<typeof buildParentSignal>) => {
    if (!sig) return null
    if (sig.score === null) return { text: 'No LP Master parent to compare', color: 'var(--muted)' }
    if (sig.effect === 'boost')   return { text: `Strong match · score +${sig.adjustment} pts`, color: 'var(--green)' }
    if (sig.effect === 'partial') return { text: `Partial match · score +${sig.adjustment} pt`,  color: 'var(--amber)' }
    if (sig.effect === 'penalty') return { text: `Mismatch · score ${sig.adjustment} pts`,        color: 'var(--danger)'   }
    return { text: 'Near match · no adjustment', color: 'var(--muted)' }
  }
  return (
    <div
      style={overlay
        ? { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--card)', overflow: 'hidden' }
        : { width: 360, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', background: 'var(--card)', height: '100%', overflow: 'hidden' }}
    >
      <div className="LPRecord-detail-hdr" style={{ padding: '12px 16px', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div><div className="LPRecord-detail-name" style={{ fontSize: 12, fontWeight: 700 }}>Match Analysis</div><div style={{ fontSize: 11, marginTop: 2, opacity: 0.75 }}>#{row.id} - {row.facility}</div></div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: '#fff', lineHeight: 1, padding: 2, opacity: 0.7 }}>×</button>
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
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</div>
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
                <thead><tr style={{ background: '#e5e7eb' }}>{['LP Master Candidate','JW','Lev','Score','Verdict'].map(h => <th key={h} style={{ padding: '5px 6px', textAlign: h === 'LP Master Candidate' ? 'left' : 'center', color: 'var(--navy)', fontWeight: 700, borderBottom: '1px solid var(--border)', fontSize: 10 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {candidates.map((c, i) => (
                    <tr key={i} style={{ background: i === 0 && hasProposedMatch ? 'var(--red-lt)' : 'transparent' }}>
                      <td style={{ padding: '5px 6px', borderBottom: '1px solid var(--border)', fontWeight: i === 0 ? 600 : 400 }}>{c.name}</td>
                      <td style={{ padding: '5px 6px', borderBottom: '1px solid var(--border)', textAlign: 'center', color: 'var(--muted)' }}>{typeof c.jw === 'number' ? formatPercentageValue(c.jw) : c.jw}</td>
                      <td style={{ padding: '5px 6px', borderBottom: '1px solid var(--border)', textAlign: 'center', color: 'var(--muted)' }}>{typeof c.lev === 'number' ? formatPercentageValue(c.lev) : c.lev}</td>
                      <td style={{ padding: '5px 6px', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: typeof c.combined === 'number' ? scoreColor(c.combined) : 'var(--muted)' }}>{typeof c.combined === 'number' ? formatPercentageValue(c.combined) : c.combined}</td>
                      <td style={{ padding: '5px 6px', borderBottom: '1px solid var(--border)', textAlign: 'center', color: verdictColor(c.verdict), fontWeight: 600, fontSize: 10 }}>{c.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>}
        </div>
        <div style={{ background: 'var(--tbl)', borderRadius: 6, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Algorithm Decision</div>
          {topCandidate && <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>Combined = JW×{thresholds.jwWeight} + Lev×{thresholds.levWeight}{typeof topCandidate.combined === 'number' && <span> = <strong style={{ color: scoreColor(topCandidate.combined) }}>{topCandidate.combined}%</strong></span>}</div>}
          {hasProposedMatch && topCandidate
            ? <div style={{ fontSize: 12 }}>Combined score <strong style={{ color: scoreColor(topCandidate.combined ?? 0) }}>{topCandidate.combined}%</strong> — {topCandidate.verdict === 'Auto-accept' ? 'above auto-accept threshold · committed without review.' : 'proposed for review.'}<div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 11 }}>Proposed match: <strong style={{ color: 'var(--text)' }}>{row.masterName}</strong></div></div>
            : <div style={{ fontSize: 12 }}>No confident match{topCandidate ? <span> (closest <strong style={{ color: scoreColor(topCandidate.combined ?? 0) }}>{topCandidate.combined}%</strong>)</span> : ' in LP Master'} — a <strong>new LP record</strong> will be created.</div>}
        </div>
        {/* The resolution must be visible, not implied: on Accept the credit profile applied to the
            facility record comes from the ultimate entity, which for a feeder is not the row matched. */}
        {hasProposedMatch && (() => { const applied = appliedEntity(row); return (
          <div style={{ background: applied.routed ? 'var(--amber-lt)' : 'var(--tbl)', border: applied.routed ? '1px solid var(--amber)' : '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Parent Routing</div>
            {applied.routed ? (
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text)' }}>{row.masterName}</strong> is a feeder/SPV.
                <div style={{ marginTop: 4 }}>
                  Ratings, LP category and advance rate will be applied from{' '}
                  <strong style={{ color: 'var(--navy)' }}>{applied.label}</strong>, filling only the fields the matched record leaves blank.
                </div>
                <div style={{ marginTop: 5, fontSize: 10, color: 'var(--muted)' }}>
                  The record stays linked to {row.masterName} for audit.
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12 }}>
                <strong style={{ color: 'var(--text)' }}>{row.masterName}</strong> is the ultimate entity — its own credit profile is applied.
              </div>
            )}
          </div>
        )})()}
      </div>
      {(onDiscard || (onResolve && row.status !== 'Auto-accept')) && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          {onResolve && row.status !== 'Auto-accept' && row.status !== 'Accepted' && <Button size="sm" onClick={() => onResolve(row.id, 'Accepted')}>✓ Accept</Button>}
          {onResolve && row.status !== 'Auto-accept' && row.status !== 'Rejected' && <Button variant="ghost" size="sm" onClick={() => onResolve(row.id, 'Rejected')}>✕ Reject</Button>}
          {/* Escape hatch for a row the Agent BB parsed badly: neither Accept nor Reject describes
              it — the row should not reach the Shadow BB at all. */}
          {onDiscard && <Button variant="danger" size="sm" style={{ marginLeft: 'auto' }} onClick={() => onDiscard(row.id)}>⊘ Discard Row</Button>}
        </div>
      )}
    </div>
  )
}

export default function MatchQueue() {
  const { toast, navigate, activeSubmission, abortSubmission, activeSubmissionId } = useApp()
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [bandFilter, setBandFilter] = useState('')
  const [checked, setChecked] = useState(new Set<number>())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [abortOpen, setAbortOpen] = useState(false)
  const [discardConfirmId, setDiscardConfirmId] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [wizardSteps, setWizardSteps] = useState<string[]>([])
  const [matchingConfig, setMatchingConfig] = useState<MatchingConfig | null>(null)

  const handleAbort = async (msg = 'Submission aborted.') => {
    if (activeSubmissionId != null) {
      try { await api.submissions.abort(activeSubmissionId) }
      catch (e) { toast(`Abort failed: ${String(e)}`); return }
    } else {
      abortSubmission(activeSubmission ?? '')
    }
    setAbortOpen(false)
    toast(msg)
    navigate('upload')
  }

  useEffect(() => {
    setLoadError(null)
    Promise.all([
      getMatchQueue(activeSubmissionId ?? 0),
      getWizardConfig(),
      getMatchingConfig(),
    ])
      .then(([q, wizard, config]) => {
        setQueue(q as QueueRow[])
        setWizardSteps(wizard.WIZARD_STEPS)
        setMatchingConfig(config)
      })
      .catch(e => setLoadError(String(e)))
  }, [activeSubmissionId])

  const filtered = useMemo(() => queue.filter(r => {
    const matchStatus = !statusFilter || r.status === statusFilter
    const matchBand   = !bandFilter   || (matchingConfig && scoreBand(r.score, matchingConfig.thresholds) === bandFilter)
    return matchStatus && matchBand
  }), [queue, statusFilter, bandFilter, matchingConfig])

  const allChecked = filtered.length > 0 && filtered.every(r => checked.has(r.id))
  const someChecked = !allChecked && filtered.some(r => checked.has(r.id))
  const toggleAll = () => setChecked(prev => { const next = new Set(prev); if (allChecked) filtered.forEach(r => next.delete(r.id)); else filtered.forEach(r => next.add(r.id)); return next })
  const toggleRow = (id: number) => setChecked(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })

  // Tracks in-flight decide PATCHes so Commit can wait for them — otherwise the backend may
  // read the match queue before the accept/reject decisions have persisted and commit nothing.
  const pendingDecides = useRef<Promise<unknown>[]>([])

  const resolve = (ids: Set<number>, action: string) => {
    setQueue(prev => prev.map(r => ids.has(r.id) ? { ...r, status: action } : r))
    setChecked(new Set())
    toast(`${ids.size} match${ids.size > 1 ? 'es' : ''} ${action === 'Accepted' ? 'accepted' : 'rejected'}.`)
    // One batched PATCH for the whole selection instead of one request per row — the backend
    // applies them in a single transaction, and Commit still awaits this via pendingDecides.
    pendingDecides.current.push(
      api.matching.decideBatch([...ids].map(id => ({ id, decision: action }))).catch(() => {}),
    )
  }
  const resolveOne = (id: number, action: string) => {
    setQueue(prev => prev.map(r => r.id === id ? { ...r, status: action } : r))
    toast(`Match ${action.toLowerCase()}.`)
    pendingDecides.current.push(api.matching.decide(id, action).catch(() => {}))
  }

  // Removes the queue entry outright, so the row is never committed as an LP record. Used for
  // rows the Agent BB parsed badly — a decision of Accept or Reject would still carry them forward.
  const handleDiscard = async () => {
    if (discardConfirmId == null) return
    const id = discardConfirmId
    setDiscardConfirmId(null)
    setQueue(prev => prev.filter(r => r.id !== id))
    setChecked(prev => { const next = new Set(prev); next.delete(id); return next })
    if (selectedId === id) setSelectedId(null)
    try {
      await api.matching.discard(id)
      toast('Row discarded.')
    } catch (e) {
      toast(`Discard failed: ${String(e)}`)
      getMatchQueue(activeSubmissionId ?? 0)
        .then(q => setQueue(q as QueueRow[]))
        .catch(err => setLoadError(String(err)))
    }
  }

  const sortColumns = useMemo(() => [
    { key: 'agentName', getValue: (r: QueueRow) => r.agentName },
    { key: 'masterName', getValue: (r: QueueRow) => r.masterName ?? '' },
    { key: 'ultimateParent', getValue: (r: QueueRow) => appliedEntity(r).label },
    { key: 'score', getValue: (r: QueueRow) => r.score },
    { key: 'quality', getValue: (r: QueueRow) => matchingConfig ? scoreBand(r.score, matchingConfig.thresholds) : '' },
    { key: 'status', getValue: (r: QueueRow) => r.status },
    { key: 'action', getValue: (r: QueueRow) => r.status },
  ], [matchingConfig])
  const { sort, sortedRows, requestSort } = useSortableRows(filtered, sortColumns)
  const { page, setPage, totalPages, total, pageItems, from, to, pageSize, setPageSize } = usePagination(sortedRows)
  // Two width sets, because the columns behave differently. Checkbox/Confidence/Quality/Status/
  // Action hold bounded content, so each keeps a hard pixel width: its widest item (the header
  // itself for Confidence, a Tag for Quality/Status, the button pair for Action) plus the 18px side
  // padding of `.data-table th/td`. The three name columns carry VARCHAR(255) text and split what
  // is left in the shares below (~20–25% of the table each), so a wider window grows the names
  // instead of inflating the badge columns — which is what `table-layout: fixed` did before,
  // spreading its slack across every declared width.
  // Storage keys are versioned: useColumnResize merges stored widths over these defaults, so a
  // returning user would otherwise keep the old Confidence/Action sizing forever.
  const { widths: fixedW, onResizeStart: onFixedResize } = useColumnResize('match-queue-fixed-v3', {
    checkbox: 42, score: 116, quality: 104, status: 104, action: 140,
  })
  const fixedTotal = Object.values(fixedW).reduce((sum, w) => sum + w, 0)
  const { widths: flexShare, onResizeStart: onFlexResize } = useColumnResize('match-queue-flex-v3', {
    agentName: 34, masterName: 33, ultimateParent: 33,
  }, '%', fixedTotal)
  // The share is resolved to pixels here rather than handed to CSS as a percentage: Blink treats a
  // `calc()` mixing % and px on a cell of a `table-layout: fixed` table as `auto`, which silently
  // ignores the width — the columns then split the leftover space evenly and refuse to be dragged.
  const [queueWidth, setQueueWidth] = useState(0)
  const queueWrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = queueWrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setQueueWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Below its floor the table stops shrinking and the wrapper scrolls, so the name columns never
  // get squeezed to nothing — and the widths always add up exactly, leaving no slack for
  // `table-layout: fixed` to spread over the pixel columns.
  const usableWidth = Math.max(queueWidth, fixedTotal + NAME_COLS * MIN_NAME_COL_PX)
  // Rounding each share on its own can add a stray pixel that scrolls the whole table sideways, so
  // round the running total instead: the parts then always sum back to the space being divided.
  const flexPx = useMemo(() => {
    const remainder = usableWidth - fixedTotal
    let acc = 0
    const take = (share: number) => {
      const start = acc
      acc += (remainder * share) / 100
      return Math.round(acc) - Math.round(start)
    }
    return {
      agentName: take(flexShare.agentName),
      masterName: take(flexShare.masterName),
      ultimateParent: take(flexShare.ultimateParent),
    }
  }, [usableWidth, fixedTotal, flexShare])
  const mqTableWidth = fixedTotal + Object.values(flexPx).reduce((sum, w) => sum + w, 0)

  useEffect(() => {
    if (selectedId === null || sortedRows.length === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      e.preventDefault()
      const idx = sortedRows.findIndex(r => r.id === selectedId)
      if (idx === -1) return
      const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1
      if (nextIdx < 0 || nextIdx >= sortedRows.length) return
      setSelectedId(sortedRows[nextIdx].id)
      const nextPage = Math.floor(nextIdx / pageSize) + 1
      if (nextPage !== page) setPage(nextPage)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [sortedRows, selectedId, page, pageSize, setPage])

  const pending = queue.filter(r => r.status === 'Pending').length
  const acceptedCount = queue.filter(r => r.status === 'Accepted').length
  const rejectedCount = queue.filter(r => r.status === 'Rejected').length
  const autoAccepted = queue.filter(r => r.status === 'Accepted' && r.score >= 95).length
  const canCommit = pending === 0
  const selectionIds = new Set([...checked].filter(id => filtered.some(r => r.id === id)))

  const [committing, setCommitting] = useState(false)

  const handleCommit = async () => {
    if (pending > 0) {
      toast(`${pending} decision${pending !== 1 ? 's' : ''} still pending — resolve all matches before committing.`, 4000, 'warning')
      return
    }
    if (activeSubmissionId) {
      // Wait for the accept/reject PATCHes, then advance only this submission.
      // Facility LP records are not touched until the Shadow BB run is executed.
      setCommitting(true)
      try {
        await Promise.allSettled(pendingDecides.current)
        pendingDecides.current = []
        await api.submissions.saveShadowBbState(activeSubmissionId, null)
      } catch {
        setCommitting(false)
        toast('Commit failed — please try again.')
        return
      }
      setCommitting(false)
    }
    toast(`${acceptedCount} accepted · ${rejectedCount} new LPRecord${rejectedCount !== 1 ? 's' : ''} ready for Shadow BB.`, 3200, 'success')
    navigate('run-shadow-bb')
  }
  const selectedRow = selectedId ? queue.find(r => r.id === selectedId) ?? null : null

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))' }}>
      {loadError && <div style={{ padding: '10px 16px', background: '#fff0f0', color: 'var(--danger)', fontSize: 12 }}>API error — {loadError}</div>}
      <StepBar steps={wizardSteps} current={3} />
      {autoAccepted > 0 && (
        <div style={{ padding: '7px 20px', background: 'var(--red-lt)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700 }}>✓ {autoAccepted} records auto-matched</span>
          <span style={{ color: 'var(--muted)' }}>— match score ≥ 95% · existing LP Master records will feed Run Shadow BB</span>
          <button onClick={() => setStatusFilter('Accepted')} style={{ marginLeft: 8, background: 'none', border: '1px solid var(--red)', borderRadius: 4, padding: '1px 8px', fontSize: 11, color: 'var(--red)', cursor: 'pointer' }}>View</button>
        </div>
      )}
      <div className="filter-bar">
        <select style={{ width: 150 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">Status: All</option><option value="Pending">Pending</option><option value="Accepted">Accepted</option><option value="Rejected">Rejected</option></select>
        <select style={{ width: 170 }} value={bandFilter} onChange={e => setBandFilter(e.target.value)}><option value="">Confidence: All</option><option value="Review">Review (80–94%)</option><option value="No Match">No Match (&lt;80%)</option></select>
        {selectionIds.size > 0 && (<><span style={{ fontSize: 11, color: 'var(--muted)' }}>{selectionIds.size} selected</span><Button size="sm" onClick={() => resolve(selectionIds, 'Accepted')}>✓ Accept Selected</Button><Button variant="danger" size="sm" onClick={() => resolve(selectionIds, 'Rejected')}>✕ Reject Selected</Button></>)}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{pending} pending · {filtered.length} shown</span>
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        <Button variant="danger" size="sm" onClick={() => setAbortOpen(true)}>Abort Submission</Button>
        <Button size="sm" disabled={committing} style={!canCommit ? { opacity: 0.45, cursor: 'default' } : undefined} title={pending > 0 ? `${pending} item${pending > 1 ? 's' : ''} still pending` : undefined} onClick={handleCommit}>{committing ? 'Committing…' : 'Commit Decisions'}</Button>
      </div>
      {/* The queue takes the full width; the Match Analysis form is a docked overlay on row click,
          the same pattern the LP Master screens use for their record panels. */}
      <div style={{ flex: 1, display: 'flex', padding: '0 20px', overflow: 'hidden' }}>
        <div ref={queueWrapRef} className="data-table-wrap" style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minWidth: 0 }}>
          <table className="data-table" style={{ tableLayout: 'fixed', width: mqTableWidth, minWidth: mqTableWidth }}>
            <thead>
              <tr>
                <th style={{ width: fixedW.checkbox, padding: '8px 10px', position: 'relative' }}><input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked }} onChange={toggleAll} /></th>
                <SortableHeader sortKey="agentName"  sort={sort} onSort={requestSort} style={{ width: flexPx.agentName }}                         onResizeStart={onFlexResize}>Agent LPRecord Name</SortableHeader>
                <SortableHeader sortKey="masterName" sort={sort} onSort={requestSort} style={{ width: flexPx.masterName }}                        onResizeStart={onFlexResize}>Matched LP Master Record</SortableHeader>
                <SortableHeader sortKey="ultimateParent" sort={sort} onSort={requestSort} style={{ width: flexPx.ultimateParent }}                onResizeStart={onFlexResize}>Ultimate Parent (To Be Applied)</SortableHeader>
                <SortableHeader sortKey="score"      sort={sort} onSort={requestSort} className="num" style={{ width: fixedW.score, textAlign: 'right' }} onResizeStart={onFixedResize}>Confidence</SortableHeader>
                <SortableHeader sortKey="quality"    sort={sort} onSort={requestSort} style={{ width: fixedW.quality }}                          onResizeStart={onFixedResize}>Quality</SortableHeader>
                <SortableHeader sortKey="status"     sort={sort} onSort={requestSort} style={{ width: fixedW.status }}                           onResizeStart={onFixedResize}>Status</SortableHeader>
                <SortableHeader sortKey="action"     sort={sort} onSort={requestSort} style={{ width: fixedW.action, padding: '8px 6px' }}       onResizeStart={onFixedResize}>Action</SortableHeader>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(r => {
                const applied = appliedEntity(r)
                return (
                <tr key={r.id} className={selectedId === r.id ? 'data-table-row-selected' : undefined} onClick={() => setSelectedId(prev => prev === r.id ? null : r.id)} style={{ opacity: r.status !== 'Pending' ? 0.55 : 1, cursor: 'pointer' }}>
                  <td style={{ padding: '7px 10px' }} onClick={e => e.stopPropagation()}><input type="checkbox" checked={checked.has(r.id)} onChange={() => toggleRow(r.id)} /></td>
                  <td><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={r.agentName}>{r.agentName}</div></td>
                  <td><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.masterName ? 'var(--text)' : 'var(--muted)', fontStyle: r.masterName ? 'normal' : 'italic' }} title={r.masterName ?? ''}>{r.masterName ?? 'No match found — new LP record will be created'}</div></td>
                  <td>
                    {!applied.matched ? (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    ) : applied.routed ? (
                      <div
                        title={`Feeder/SPV — credit profile is applied from ${applied.label}`}
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--navy)' }}
                      >
                        <span aria-hidden="true" style={{ marginRight: 5, color: 'var(--amber)', fontSize: 10 }}>↰</span>
                        {applied.label}
                      </div>
                    ) : (
                      <span title="Matched record is the ultimate entity — its own profile is applied" style={{ color: 'var(--muted)', fontSize: 11 }}>Self</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: scoreColor(r.score) }}>{r.score}%</td>
                  <td><Tag variant={matchingConfig ? bandVariant(r.score, matchingConfig.thresholds) : ''}>{matchingConfig ? scoreBand(r.score, matchingConfig.thresholds) : '—'}</Tag></td>
                  <td><Tag variant={r.status === 'Accepted' ? 'active' : r.status === 'Rejected' ? 'excl' : 'pending'}>{r.status}</Tag></td>
                  <td style={{ padding: '7px 6px' }} onClick={e => e.stopPropagation()}>
                    {r.status === 'Pending' ? (<div style={{ display: 'flex', gap: 4 }}><Button size="sm" style={{ padding: '0 7px' }} onClick={() => resolveOne(r.id, 'Accepted')}>✓ Accept</Button><Button variant="ghost" size="sm" style={{ padding: '0 7px' }} onClick={() => resolveOne(r.id, 'Rejected')}>✕ Reject</Button></div>) : (<span style={{ fontSize: 11, color: 'var(--red)', cursor: 'pointer', fontWeight: 600 }} onClick={() => resolveOne(r.id, 'Pending')}>Undo</span>)}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          <div className="tbl-footer">
            <span>Showing {from}–{to} of {filtered.length} · {queue.filter(r => r.status === 'Accepted').length} accepted · {queue.filter(r => r.status === 'Rejected').length} rejected · {pending} pending</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {total > 15 && <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}>{PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}</select>}
              {totalPages > 1 && (<><Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>‹ Prev</Button><span style={{ fontSize: 11, color: 'var(--muted)' }}>Page {page} of {totalPages}</span><Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next ›</Button></>)}
              <Button size="sm" disabled={committing} style={!canCommit ? { opacity: 0.45, cursor: 'default' } : undefined} title={pending > 0 ? `${pending} item${pending > 1 ? 's' : ''} still pending` : undefined} onClick={handleCommit}>{committing ? 'Committing…' : 'Commit Decisions'}</Button>
            </div>
          </div>
        </div>

      </div>

      {selectedRow && matchingConfig && (
        <DraggablePanel className="LPRecord-detail-overlay" storageKey="match-queue-detail">
          <MatchDetailPanel
            row={selectedRow}
            onClose={() => setSelectedId(null)}
            onResolve={resolveOne}
            onDiscard={id => setDiscardConfirmId(id)}
            config={matchingConfig}
            overlay
          />
        </DraggablePanel>
      )}
    </div>
    <Modal open={discardConfirmId != null} onClose={() => setDiscardConfirmId(null)} title="Discard Row?" subtitle="This match queue row will be permanently removed."
      footer={<><Button variant="secondary" onClick={() => setDiscardConfirmId(null)}>Cancel</Button><Button variant="danger" onClick={handleDiscard}>Discard</Button></>}>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>The row is dropped from this submission — no LP record is created or updated for it on Commit Decisions, and it will not appear in the Shadow BB. To restore it, re-upload the Agent BB.</div>
    </Modal>
    <Modal open={abortOpen} onClose={() => setAbortOpen(false)} title="Abort Submission?" subtitle="This will permanently remove the submission from history."
      footer={<><Button variant="secondary" onClick={() => setAbortOpen(false)}>Keep Working</Button><Button variant="danger" onClick={() => handleAbort()}>Abort Submission</Button></>}>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>Aborting at this stage is safe — no LP records have been added or updated yet. If you need to reprocess this Agent BB, upload it again.</div>
    </Modal>
    </>
  )
}
