import { useState, useMemo, useEffect, useRef } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { useApp } from '../../context/AppContext'
import { useScreenMode } from '../../hooks/useScreenMode'
import StepBar from '../../components/ui/StepBar'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Tag from '../../components/ui/Tag'
import Modal from '../../components/ui/Modal'
import { WIZARD_STEPS } from '../../config/wizardConfig'
import {
  UBS_CLS_OPTS, AGENT_CLS_OPTS, UBS_CLS_DEFAULT_RATE, LP_SIZE_CRITERIA_OPTS,
  TYPE_OPTS, SP_RATING_OPTS, MDY_RATING_OPTS,
} from '../../config/classificationConfig'
import { computePortfolioBB, fmtM, fmtPct } from '../../services/bbCalculationService'
import { MATCH_QUEUE, SUBMISSION_SUMMARY } from '../../data/matchQueueData'
import { EXTRACTED_LPS } from '../../data/extractionData'
import { getMatchQueue } from '../../services/matchingService'
import { api } from '../../services/api'
import type { LPRecord } from '../../services/lpService'
import type { Submission, AgentExtractedRow, LpRate, CommitLpRow, LpClassificationRequest } from '../../services/api'

function parseDollars(s: string): number {
  return parseInt((s ?? '').replace(/[$,]/g, ''), 10) || 0
}

const DEFAULT_CL_M   = 25   // fallback for BB engine (dollar-based)
const DEFAULT_CL_PCT = 7.5  // default concentration limit as % of total uncalled

function parsePct(str: string | undefined | null): number | '' {
  if (!str || str === '—') return ''
  return parseFloat(String(str).replace('%', '')) || ''
}
// Money string → $M magnitude. Accepts "$250.0M", "1,200", "$1.2B".
function parseMoneyM(str: string | undefined | null): number {
  if (!str) return 0
  const m = String(str).match(/\$?\s*([\d,.]+)\s*([MB])?/i)
  if (!m) return 0
  let v = parseFloat(m[1].replace(/,/g, '')) || 0
  if ((m[2] || '').toUpperCase() === 'B') v *= 1000
  return v
}
const num = (v: number | '' | undefined): number => (typeof v === 'number' ? v : 0)

const YesNo = ({ val }: { val: boolean }) => (
  <span style={{
    fontWeight: 600, fontSize: 11, padding: '2px 7px', borderRadius: 10,
    background: val ? '#e6f4ea' : 'var(--tbl)',
    color: val ? 'var(--green)' : 'var(--muted)',
  }}>
    {val ? 'Yes' : 'No'}
  </span>
)

// Full per-row formula engine — all monetary values in $M. Mirrors the calculated columns
// of Shadow_BB.xlsx; everything here is read-only on the card (the engine owns it).
function calcRow(ov: Override, totalCommitM: number, totalUncalledM: number) {
  const advRate  = num(ov.ubsAdvRatePct) / 100
  const agRate   = num(ov.agentRatePct) / 100
  const ubsClPct = num(ov.concLimitPct) / 100
  const agClPct  = num(ov.agentConcLimitPct) / 100
  const uc       = num(ov.ucM)
  const commitM  = parseMoneyM(ov.capCommit)
  const included = !!ov.inc && !!ov.cls && ov.cls !== 'Excluded'

  const cmtPct          = totalCommitM   > 0 ? commitM / totalCommitM : 0
  const calledM         = Math.max(commitM - uc, 0)
  const pctUncalled     = totalUncalledM > 0 ? uc / totalUncalledM : 0
  const pctCalled       = commitM > 0 ? calledM / commitM : 0

  const ubsEligUncalled = Math.min(uc, totalUncalledM * ubsClPct)
  const agentEligUncl   = Math.min(uc, totalUncalledM * agClPct)
  const ubsBBCalc       = included ? ubsEligUncalled * advRate : 0
  const agentBBCalc     = included ? agentEligUncl   * agRate  : 0
  const ubsExcess       = included ? Math.max(uc - ubsEligUncalled, 0) : 0
  const agentExcess     = included ? Math.max(uc - agentEligUncl,   0) : 0

  const ubsIncluded     = ubsBBCalc > 0
  const highQuality     = Math.abs(advRate - 0.9) < 0.0001

  return {
    cmtPct, commitM, calledM, pctUncalled, pctCalled,
    ubsEligUncalled, agentEligUncl, ubsBBCalc, agentBBCalc,
    ubsExcess, agentExcess, ubsIncluded, highQuality,
  }
}

// inc: override of LP Master contractual eligibility flag; auto-derived from cls but user-editable
function deriveInc(cls: string, isNew: boolean, masterInc: boolean | undefined): boolean {
  if (!cls || cls === 'Excluded') return false
  return isNew ? true : !!(masterInc)
}

type SubmissionLP = Partial<LPRecord> & { _key: string; _isNew: boolean; _agentName: string }
// Override holds every Manual-Input column of Shadow_BB.xlsx — all editable in the card.
type Override = {
  // Identity & classification
  parent: string
  spv: boolean
  type: string                  // Institutional vs HNW
  ig: boolean                   // Investment Grade?
  cls: string                   // UBS LP Classification
  agentCls: string              // Agent LP Classification
  sp: string; mdy: string; fitch: string
  // Scale
  lpSizeBil: string             // LP Size ($ Bil)
  lpSizeCriteria: string        // AUM | NAV | Assets
  // Commitment / capital
  capCommit: string
  ucM: number | ''              // Uncalled Capital ($M)
  // Rates & limits
  ubsAdvRatePct: number | ''    // UBS Advance Rate %
  agentRatePct: number | ''     // Agent Advance Rate %
  concLimitPct: number | ''     // UBS Concentration Limit %
  agentConcLimitPct: number | ''// Agent Concentration Limit %
  // Status
  inc: boolean
  notes: string
}

export default function RunShadowBB() {
  const { toast, navigate, lpData, bbParams, activeSubmission, activeSubmissionId, abortSubmission } = useApp()
  const mode = useScreenMode()
  const live = mode === 'live'
  const [matchQueue, setMatchQueue] = useState(MATCH_QUEUE)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ReturnType<typeof computePortfolioBB> | null>(null)
  const [summaryHidden, setSummaryHidden] = useState(false)
  const [abortOpen, setAbortOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submissionDetails, setSubmissionDetails] = useState<Submission | null>(null)
  const [extractedMap, setExtractedMap] = useState<Record<string, AgentExtractedRow>>({})
  const [lpRates, setLpRates] = useState<Map<string, LpRate>>(new Map())
  const [facilityLPs, setFacilityLPs] = useState<LPRecord[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const handleAbort = async () => {
    if (live && activeSubmissionId != null) {
      try { await api.submissions.abort(activeSubmissionId) }
      catch (e) { toast(`Abort failed: ${String(e)}`); return }
    } else {
      abortSubmission(activeSubmission ?? '')
    }
    setAbortOpen(false)
    toast('Submission aborted.')
    navigate('upload')
  }

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

  // In live mode, load the persisted LP Master records for this facility. They are created
  // up front on "Commit Decisions", so the classification table edits real records rather
  // than synthesized queue rows. Edits auto-save per row, so the in-memory overrides remain
  // the source of truth for the session — no reload after save.
  useEffect(() => {
    const facilityId = submissionDetails?.facilityId
    if (!live || facilityId == null) return
    api.lps.list({ facilityId })
      .then(setFacilityLPs)
      .catch(() => {})
  }, [live, submissionDetails?.facilityId])

  // In live mode, fetch LP rates as-of the submission period (falls back to today if not yet loaded)
  useEffect(() => {
    if (!live) return
    api.lps.rates(submissionDetails?.periodMonth ?? undefined)
      .then(rates => setLpRates(new Map(rates.map(r => [r.lpName.toLowerCase(), r]))))
      .catch(() => {})
  }, [live, submissionDetails?.periodMonth])

  const submissionLPs = useMemo<SubmissionLP[]>(() => {
    // Live: the rows are the persisted LP Master records for this facility, created on Commit.
    // Keyed by name (unique per facility), so edits and Save map straight back to real records.
    if (live) {
      return facilityLPs.map(lp => ({
        ...lp,
        _key: `lp-${lp.name}`, _isNew: false, _agentName: lp.name,
      }))
    }
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
  }, [live, facilityLPs, lpData, matchQueue, extractedMap])

  const buildOverride = (lp: SubmissionLP): Override => {
    const ext  = extractedMap[(lp._agentName || lp.name || '').toLowerCase()]
    const rate = lpRates.get((lp.name || '').toLowerCase())
               ?? lpRates.get((lp._agentName || '').toLowerCase())
    const toRating = (extracted: string | undefined, master: string | undefined) => {
      const v = extracted || master || ''
      return v !== 'NR' ? v : ''
    }
    const sizeBil = lp.lpSizeBil || lp.aum || ext?.aum || lp.nav || ext?.nav || ''
    return {
      parent:         lp.parent ?? '',
      spv:            !!lp.spv,
      type:           lp.type ?? 'Institutional',
      ig:             !!lp.ig,
      cls:            lp.cls ?? '',
      agentCls:       lp.agentCls ?? '',
      sp:             toRating(ext?.sp,     lp.sp),
      mdy:            toRating(ext?.moodys, lp.mdy),
      fitch:          toRating(ext?.fitch,  lp.fitch),
      lpSizeBil:      sizeBil,
      lpSizeCriteria: lp.lpSizeCriteria ?? (lp.nav ? 'NAV' : 'AUM'),
      capCommit:      lp.capCommit ?? '',
      ucM:            parseMoneyM(lp.uc),
      ubsAdvRatePct:  rate ? rate.ubsAdvRatePct * 100
                           : (lp.cls ? parsePct(UBS_CLS_DEFAULT_RATE[lp.cls]) : '') || parsePct(lp.rate),
      agentRatePct:   parsePct(ext?.agentRate || lp.agentRate),
      concLimitPct:   rate ? rate.ubsConcLimitPct * 100
                           : parsePct(lp.ubsConc) || DEFAULT_CL_PCT,
      agentConcLimitPct: parsePct(ext?.agentConc || lp.agentConc),
      inc:            deriveInc(lp.cls ?? '', lp._isNew, lp.inc),
      notes:          lp.notes ?? '',
    }
  }

  const [overrides, setOverrides] = useState<Record<string, Override>>(() =>
    Object.fromEntries(submissionLPs.map(lp => [lp._key, buildOverride(lp)]))
  )

  type FlashCol = 'highQuality' | 'ubsIncluded' | 'ubsBBCalc'
  type FlashTracker = Record<string, Partial<Record<FlashCol, number>>>
  const [flashKeys, setFlashKeys] = useState<FlashTracker>({})

  // Per-row auto-save. Each value change debounces a single-row PATCH so only the edited
  // LP record is updated (the screen has no bulk actions). The in-memory override stays the
  // source of truth — we never reload, avoiding rate flicker / override resets.
  type SaveStatus = 'saving' | 'saved' | 'error'
  const [saveState, setSaveState] = useState<Record<string, SaveStatus>>({})
  const saveTimers  = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // Distinct LP rows touched this session — drives the single aggregated audit entry on exit.
  const editedKeys  = useRef<Set<string>>(new Set())

  type ClassificationRow = LpClassificationRequest['rows'][number]
  const toRow = (key: string, ov: Override): ClassificationRow | null => {
    const lp   = submissionLPs.find(l => l._key === key)
    const name = lp?.name ?? lp?._agentName ?? ''
    if (!name) return null
    return {
      name,
      parent:            ov.parent || undefined,
      spv:               ov.spv,
      type:              ov.type || undefined,
      ig:                ov.ig,
      cls:               ov.cls || undefined,
      agentCls:          ov.agentCls || undefined,
      sp:                ov.sp, mdy: ov.mdy, fitch: ov.fitch,
      lpSizeBil:         ov.lpSizeBil || undefined,
      lpSizeCriteria:    ov.lpSizeCriteria || undefined,
      capCommit:         ov.capCommit || undefined,
      uc:                typeof ov.ucM === 'number' ? `$${ov.ucM.toFixed(1)}M` : undefined,
      ubsAdvRatePct:     typeof ov.ubsAdvRatePct     === 'number' ? ov.ubsAdvRatePct     : undefined,
      agentRatePct:      typeof ov.agentRatePct      === 'number' ? ov.agentRatePct      : undefined,
      ubsConcLimitPct:   typeof ov.concLimitPct      === 'number' ? ov.concLimitPct      : undefined,
      agentConcLimitPct: typeof ov.agentConcLimitPct === 'number' ? ov.agentConcLimitPct : undefined,
      inc:               ov.inc,
      notes:             ov.notes || undefined,
    }
  }

  const persistRow = (key: string, ov: Override) => {
    const facilityId = submissionDetails?.facilityId
    if (!live || facilityId == null) return
    const row = toRow(key, ov)
    if (!row) return

    setSaveState(s => ({ ...s, [key]: 'saving' }))
    // Per-row saves are silent (audit omitted) so the trail isn't spammed per keystroke.
    api.lps.saveClassification({
      facilityId,
      effectiveDate: submissionDetails?.periodMonth ?? undefined,
      rows: [row],
    })
      .then(() => {
        setSaveState(s => ({ ...s, [key]: 'saved' }))
        // Fade the "saved" indicator after a moment so the row returns to a clean state.
        clearTimeout(savedTimers.current[key])
        savedTimers.current[key] = setTimeout(() => {
          setSaveState(s => { const next = { ...s }; delete next[key]; return next })
        }, 2000)
      })
      .catch(e => {
        setSaveState(s => ({ ...s, [key]: 'error' }))
        toast(`Save failed — ${e instanceof Error ? e.message : String(e)}`)
      })
  }

  // One aggregated audit entry per session. When the user leaves the screen (Run Shadow BB,
  // left-menu navigation, abort — any unmount), re-send every edited row in a single PATCH with
  // audit:true. This collapses the trail to one "N LP records updated" event and also flushes any
  // edit still inside the debounce window, so the final value is never lost. Held in a ref so the
  // unmount cleanup always sees the latest overrides without re-subscribing.
  const flushAuditRef = useRef<() => void>(() => {})
  flushAuditRef.current = () => {
    const facilityId = submissionDetails?.facilityId
    if (!live || facilityId == null || editedKeys.current.size === 0) return
    const rows = [...editedKeys.current]
      .map(key => toRow(key, overrides[key] ?? {} as Override))
      .filter((r): r is ClassificationRow => r != null)
    if (rows.length === 0) return
    api.lps.saveClassification({
      facilityId,
      effectiveDate: submissionDetails?.periodMonth ?? undefined,
      audit: true,
      rows,
    }).catch(() => {})
  }

  // On unmount: cancel pending timers, then write the single aggregated audit entry.
  useEffect(() => () => {
    Object.values(saveTimers.current).forEach(clearTimeout)
    Object.values(savedTimers.current).forEach(clearTimeout)
    flushAuditRef.current()
  }, [])

  const setOverride = (key: string, field: keyof Override, value: unknown) => {
    const currentOv = overrides[key] ?? {} as Override
    const newOv = { ...currentOv, [field]: value } as Override

    const oldC = calcRow(currentOv, totalCommitM, totalUncalledM)
    const newC = calcRow(newOv, totalCommitM, totalUncalledM)
    const changed: FlashCol[] = []
    if (oldC.highQuality !== newC.highQuality) changed.push('highQuality')
    if (oldC.ubsIncluded !== newC.ubsIncluded) changed.push('ubsIncluded')
    if (Math.abs(oldC.ubsBBCalc - newC.ubsBBCalc) > 0.0001) changed.push('ubsBBCalc')
    if (changed.length > 0) {
      setFlashKeys(f => {
        const rowFlash = { ...(f[key] ?? {}) }
        for (const col of changed) rowFlash[col] = (rowFlash[col] ?? 0) + 1
        return { ...f, [key]: rowFlash }
      })
    }

    setOverrides(prev => ({ ...prev, [key]: newOv }))

    // Auto-save this single row (live only); debounce so rapid typing produces one PATCH.
    if (live) {
      editedKeys.current.add(key)
      clearTimeout(saveTimers.current[key])
      saveTimers.current[key] = setTimeout(() => persistRow(key, newOv), 600)
    }
  }

  const resetOverrides = () => {
    setOverrides(Object.fromEntries(submissionLPs.map(lp => [lp._key, buildOverride(lp)])))
    setFlashKeys({})
  }

  // Tracks whether we have already applied saved overrides from the DB for this session.
  // Prevents the rebuild effect below from overwriting user edits after initial data load.
  const savedOverridesApplied = useRef(false)

  // Rebuild overrides whenever submissionLPs or lpRates changes.
  // Safe because both settle before users begin editing in a session.
  useEffect(() => {
    if (savedOverridesApplied.current) return
    setOverrides(Object.fromEntries(submissionLPs.map(lp => [lp._key, buildOverride(lp)])))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionLPs, lpRates])

  // Once both submissionLPs and submissionDetails are available, apply saved overrides once.
  useEffect(() => {
    if (savedOverridesApplied.current) return
    if (submissionLPs.length === 0) return
    const saved = submissionDetails?.shadowBbOverrides
    if (!saved || Object.keys(saved).length === 0) return
    const currentKeys = new Set(submissionLPs.map(lp => lp._key))
    if (!Object.keys(saved).some(k => currentKeys.has(k))) return
    savedOverridesApplied.current = true
    setOverrides(prev => {
      const merged = { ...prev }
      for (const [key, val] of Object.entries(saved)) {
        if (key in merged) merged[key] = { ...merged[key], ...(val as Partial<Override>) }
      }
      return merged
    })
  }, [submissionLPs, submissionDetails])

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
      ? Object.values(overrides).reduce((s, ov) => s + num(ov.ucM), 0)
      : EXTRACTED_LPS.reduce((s, lp) => s + parseDollars(lp.uncalled), 0) / 1e6
    const commitM = live
      ? Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.capCommit), 0)
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
      { label: 'New LP Records',    value: newCount > 0 ? `${newCount} created` : '0' },
      { label: 'Total Commitment',  value: totalCommitment },
      { label: 'Total Uncalled',    value: totalUncalled },
    ]
  }, [submissionDetails, activeSubmission, matchQueue, overrides, live])

  const newLPs        = submissionLPs.filter(lp => lp._isNew)
  const overrideCount = submissionLPs.filter(lp => !lp._isNew && overrides[lp._key]?.cls !== lp.cls).length
  const unclassified  = submissionLPs.filter(lp => !overrides[lp._key]?.cls).length
  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(submissionLPs)

  // Facility-level totals used by formula columns (from overrides, which are editable).
  const totalCommitM = useMemo(() =>
    Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.capCommit), 0)
  , [overrides])

  const totalUncalledM = useMemo(() =>
    Object.values(overrides).reduce((s, ov) => s + num(ov.ucM), 0)
  , [overrides])

  // Keep a row selected for the side card; default to the first row on the page.
  useEffect(() => {
    if (result) return
    const keys = pageItems.map(lp => lp._key)
    if (keys.length === 0) { setSelectedKey(null); return }
    if (!selectedKey || !keys.includes(selectedKey)) setSelectedKey(keys[0])
  }, [pageItems, selectedKey, result])

  const run = async () => {
    setRunning(true)
    setLoadError(null)
    if (unclassified > 0) toast(`${unclassified} unclassified LP${unclassified !== 1 ? 's' : ''} will be treated as Excluded`)
    toast('Shadow BB calculation started…')

    const overriddenLPs = submissionLPs.map(lp => {
      const ov         = overrides[lp._key] ?? buildOverride(lp)
      const c          = calcRow(ov, totalCommitM, totalUncalledM)
      const ucM        = num(ov.ucM)
      const concLimitM = typeof ov.concLimitPct === 'number'
        ? (ov.concLimitPct / 100) * totalUncalledM
        : DEFAULT_CL_M
      const rate      = typeof ov.ubsAdvRatePct === 'number' ? `${ov.ubsAdvRatePct}%` : (lp.rate ?? '0%')
      const agentRate = typeof ov.agentRatePct  === 'number' ? `${ov.agentRatePct.toFixed(1)}%` : (lp.agentRate ?? '')
      return {
        ...lp,
        parent: ov.parent, spv: ov.spv, type: ov.type as LPRecord['type'], ig: ov.ig,
        cls: ov.cls || 'Excluded', agentCls: ov.agentCls,
        sp: ov.sp ?? '', mdy: ov.mdy ?? '', fitch: ov.fitch ?? '',
        lpSizeBil: ov.lpSizeBil, lpSizeCriteria: ov.lpSizeCriteria,
        capCommit: ov.capCommit, rate, agentRate, ucM, uc: `$${ucM.toFixed(1)}M`,
        ubsConc: fmtM(concLimitM),  // per-LP dollar limit for API re-computation
        agentExcessConc: fmtM(c.agentExcess), ubsExcessConc: fmtM(c.ubsExcess),
        abb: fmtM(c.agentBBCalc), ubb: fmtM(c.ubsBBCalc),
        concLimitM, inc: ov.inc ?? false, notes: ov.notes,
      }
    })

    // Compute locally — gives immediate feedback and serves as the result in prototype mode
    const computed = computePortfolioBB(overriddenLPs as LPRecord[], bbParams)
    const { summary } = computed

    if (live) {
      const facilityId = submissionDetails?.facilityId
      if (facilityId != null) {
        try {
          const commitRows: CommitLpRow[] = overriddenLPs.map(lp => ({
            name:           lp.name ?? '',
            parent:         lp.parent ?? null,
            spv:            lp.spv ?? false,
            hq:             lp.hq ?? true,
            type:           lp.type ?? 'Institutional',
            region:         lp.region ?? '',
            ig:             lp.ig ?? false,
            cls:            lp.cls ?? 'Excluded',
            agentCls:       lp.agentCls || null,
            sp:             lp.sp ?? '',
            mdy:            lp.mdy ?? '',
            fitch:          lp.fitch ?? '',
            aum:            lp.aum || null,
            nav:            lp.nav || null,
            pension:        lp.pension || null,
            pensionFunded:  lp.pensionFunded || null,
            lpSizeBil:      lp.lpSizeBil || null,
            lpSizeCriteria: lp.lpSizeCriteria || null,
            capCommit:      lp.capCommit || null,
            pctCapCommit:   lp.pctCapCommit || null,
            calledCap:      lp.calledCap || null,
            uc:             lp.uc || null,
            pctUncalled:    lp.pctUncalled || null,
            pctCalled:      lp.pctCalled || null,
            agentConc:      lp.agentConc || null,
            ubsConc:        lp.ubsConc || null,
            agentRate:      lp.agentRate || null,
            abb:            lp.abb || null,
            ubb:            lp.ubb || null,
            agentExcessConc: lp.agentExcessConc || null,
            ubsExcessConc:  lp.ubsExcessConc || null,
            inc:            lp.inc ?? false,
            rcl:            lp.rcl ?? false,
            notes:          lp.notes || null,
          }))
          await api.bb.run(facilityId, commitRows)
        } catch (e) {
          setLoadError(String(e))
          setRunning(false)
          return
        }
      }
      if (activeSubmissionId != null) {
        await api.submissions.complete(activeSubmissionId).catch(() => {})
      }
    }

    setResult(computed)
    setRunning(false)
    toast(`Shadow BB complete — ${overriddenLPs.length} LPs · UBS BB ${fmtM(summary.totalUBB)} · Delta ${fmtM(summary.bbDelta)}`)
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

  const selectedLp = submissionLPs.find(lp => lp._key === selectedKey) ?? null
  const selectedOv = selectedKey ? overrides[selectedKey] : undefined

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
            subtitle={`Step 5 · ${submissionLPs.length} LPs · ${newLPs.length > 0 ? `${newLPs.length} new` : 'all matched to LP Master'} · select a row to edit the full LP record`}
            action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {unclassified > 0 && <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>{unclassified} unclassified</span>}
                {overrideCount > 0 && <button onClick={resetOverrides} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 8px', cursor: 'pointer' }}>Reset {overrideCount} override{overrideCount !== 1 ? 's' : ''}</button>}
                <Button variant="danger" size="sm" onClick={() => setAbortOpen(true)} disabled={running}>Abort Submission</Button>
                <Button size="sm" onClick={run} disabled={running}>{running ? 'Calculating…' : 'Run Shadow BB'}</Button>
              </div>
            }
          >
            {/* Compact overview table (left) + full LP record card (right). The table holds the
                most useful columns and fits without horizontal scroll; every field is edited in
                the card, where Manual-Input columns are editable and Calculated columns read-only. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 420px', gap: 14, padding: '4px 18px 0', alignItems: 'start' }}>

              <div style={{ minWidth: 0 }}>
                <div className="data-table-wrap">
                  <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Investor Name</th>
                        <th style={{ width: 132 }}>UBS Class</th>
                        <th className="num" style={{ width: 64 }}>UBS Rate</th>
                        <th className="num" style={{ width: 66 }}>Agent Rate</th>
                        <th className="num" style={{ width: 92 }}>Uncalled</th>
                        <th className="num" style={{ width: 86 }}>UBS BB</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map(lp => {
                        const key      = lp._key
                        const ov       = overrides[key] ?? {} as Override
                        const missing  = !ov.cls
                        const selected = key === selectedKey
                        const c = calcRow(ov, totalCommitM, totalUncalledM)
                        return (
                          <tr key={key} onClick={() => setSelectedKey(key)}
                            style={{ cursor: 'pointer',
                              background: selected ? 'var(--blue-lt)' : missing ? 'color-mix(in srgb, var(--red) 6%, transparent)' : undefined,
                              boxShadow: selected ? 'inset 3px 0 0 var(--blue)' : undefined }}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {(() => { const n = lp.name ?? lp._agentName ?? '—'; const trunc = n.length > 44; return <span style={{ fontSize: 11, fontWeight: selected ? 700 : 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n}>{trunc ? n.slice(0, 44) + '…' : n}</span> })()}
                                {lp._isNew && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--blue)', color: '#fff', borderRadius: 2, padding: '1px 4px', letterSpacing: '0.04em' }}>NEW</span>}
                                {saveState[key] === 'saving' && <span style={{ fontSize: 9, color: 'var(--muted)' }}>Saving…</span>}
                                {saveState[key] === 'saved'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)' }} title="Saved">✓</span>}
                                {saveState[key] === 'error'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--red)' }} title="Save failed">✕</span>}
                              </div>
                            </td>
                            <td style={{ fontSize: 11, color: ov.cls ? 'var(--text)' : 'var(--red)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ov.cls || 'Unclassified'}>{ov.cls || 'Unclassified'}</td>
                            <td className="num">{typeof ov.ubsAdvRatePct === 'number' ? `${ov.ubsAdvRatePct}%` : '—'}</td>
                            <td className="num">{typeof ov.agentRatePct === 'number' ? `${ov.agentRatePct.toFixed(0)}%` : '—'}</td>
                            <td className="num">{typeof ov.ucM === 'number' ? fmtM(ov.ucM) : '—'}</td>
                            <td key={`ubb-${key}-${flashKeys[key]?.ubsBBCalc ?? 0}`} className={`num ${c.ubsBBCalc === 0 ? 'zero' : ''} ${flashKeys[key]?.ubsBBCalc ? 'cell-flash' : ''}`}>{fmtM(c.ubsBBCalc)}</td>
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
              </div>

              {/* Right-side LP record card — all 28 Shadow BB fields */}
              <div style={{ position: 'sticky', top: 4 }}>
                {selectedLp && selectedOv
                  ? <LPRecordCard lp={selectedLp} ov={selectedOv} calc={calcRow(selectedOv, totalCommitM, totalUncalledM)}
                      saveStatus={saveState[selectedLp._key]} running={running}
                      onChange={(field, value) => setOverride(selectedLp._key, field, value)} />
                  : <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Select an LP row to view and edit its record.</div>}
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
      footer={<><Button variant="secondary" onClick={() => setAbortOpen(false)}>Keep Working</Button><Button variant="danger" onClick={handleAbort}>Abort Submission</Button></>}>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>Aborting removes this submission from history. The LP records committed to LP Master remain — re-upload the Agent BB if you need to reprocess and update them.</div>
    </Modal>
    </>
  )
}

// ── LP record card — same sectioned layout as the LP Master detail; reused here so Step 5
// shows every Shadow BB field. Manual-Input columns are editable; Calculated columns are
// derived live by calcRow and rendered read-only.
function LPRecordCard({ lp, ov, calc, onChange, running, saveStatus }: {
  lp: SubmissionLP
  ov: Override
  calc: ReturnType<typeof calcRow>
  onChange: (field: keyof Override, value: unknown) => void
  running: boolean
  saveStatus?: 'saving' | 'saved' | 'error'
}) {
  const name = lp.name ?? lp._agentName ?? '—'

  const sec = (t: string) => (
    <div style={{ gridColumn: '1 / -1', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy)', marginTop: 8, padding: '4px 8px', background: 'var(--tbl)', borderRadius: 4, borderLeft: '3px solid var(--navy)' }}>{t}</div>
  )
  const lbl = (t: string) => (
    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 3 }}>{t}</div>
  )
  const wrap = (span2: boolean, children: React.ReactNode, key: string) => (
    <div key={key} style={span2 ? { gridColumn: '1 / -1' } : undefined}>{children}</div>
  )
  const inputSt: React.CSSProperties = { width: '100%', fontSize: 12, padding: '3px 6px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--card)' }

  // Read-only calculated field
  const ro = (label: string, value: React.ReactNode, span2 = false, tone?: 'neg' | 'pos' | 'zero') =>
    wrap(span2, <>
      {lbl(label)}
      <div style={{ fontSize: 12.5, minHeight: 24, display: 'flex', alignItems: 'center', color: tone === 'neg' ? 'var(--red)' : tone === 'pos' ? 'var(--green)' : tone === 'zero' ? 'var(--muted)' : 'var(--navy)', fontWeight: tone ? 600 : 400 }}>{value}</div>
    </>, label)

  // Editable text input (manual)
  const txt = (label: string, field: keyof Override, span2 = false) =>
    wrap(span2, <>
      {lbl(label)}
      <input type="text" value={String(ov[field] ?? '')} disabled={running} style={inputSt}
        onChange={e => onChange(field, e.target.value)} />
    </>, label)

  // Editable dropdown (manual)
  const sel = (label: string, field: keyof Override, opts: readonly string[], span2 = false) =>
    wrap(span2, <>
      {lbl(label)}
      <select value={String(ov[field] ?? '')} disabled={running} style={inputSt}
        onChange={e => onChange(field, e.target.value)}>
        {opts.map(o => <option key={o || '__empty'} value={o}>{o || '—'}</option>)}
      </select>
    </>, label)

  // Editable checkbox (manual)
  const chk = (label: string, field: keyof Override) =>
    wrap(false, <>
      {lbl(label)}
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer', minHeight: 24 }}>
        <input type="checkbox" checked={!!ov[field]} disabled={running} onChange={e => onChange(field, e.target.checked)} /> Yes
      </label>
    </>, label)

  // Editable percentage input (manual)
  const pct = (label: string, field: keyof Override, step = 5) =>
    wrap(false, <>
      {lbl(label)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <input type="number" value={ov[field] === '' || ov[field] == null ? '' : Number(ov[field])} disabled={running}
          min={0} max={100} step={step} style={{ ...inputSt, width: 70, textAlign: 'right' }}
          onChange={e => onChange(field, e.target.value === '' ? '' : parseFloat(e.target.value))} />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>%</span>
      </div>
    </>, label)

  // Editable $M input (manual)
  const moneyM = (label: string, field: keyof Override) =>
    wrap(false, <>
      {lbl(label)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>$</span>
        <input type="number" value={ov[field] === '' || ov[field] == null ? '' : Number(ov[field])} disabled={running}
          min={0} step={0.1} style={{ ...inputSt, width: 90, textAlign: 'right' }}
          onChange={e => onChange(field, e.target.value === '' ? '' : parseFloat(e.target.value))} />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>M</span>
      </div>
    </>, label)

  const COLS: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', padding: '12px 16px' }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
      <div style={{ background: 'var(--navy)', color: '#fff', padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }} title={name}>{name}</div>
          {lp._isNew && <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(255,255,255,.2)', borderRadius: 3, padding: '2px 6px', flexShrink: 0 }}>NEW</span>}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: .92 }}>
          {ov.cls && <Tag>{ov.cls}</Tag>}
          <span style={{ fontSize: 11, opacity: .8 }}>
            {typeof ov.ubsAdvRatePct === 'number' ? `${ov.ubsAdvRatePct}%` : '—'} UBS · {typeof ov.agentRatePct === 'number' ? `${ov.agentRatePct.toFixed(0)}%` : '—'} Agent
          </span>
          {saveStatus === 'saving' && <span style={{ fontSize: 10 }}>Saving…</span>}
          {saveStatus === 'saved'  && <span style={{ fontSize: 10, fontWeight: 700, color: '#9be8b6' }}>✓ Saved</span>}
          {saveStatus === 'error'  && <span style={{ fontSize: 10, fontWeight: 700, color: '#ff9b9b' }}>✕ Failed</span>}
        </div>
      </div>

      <div style={{ maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
        <div style={COLS}>
          {sec('Identity & Classification')}
          {ro('Investor Name', name, true)}
          {ro('Rank', lp.rank ?? '—')}
          {txt('Parent / Sponsor', 'parent', true)}
          {chk('SPV', 'spv')}
          {sel('Institutional vs HNW', 'type', TYPE_OPTS)}
          {chk('Investment Grade?', 'ig')}
          {ro('High Quality', <YesNo val={calc.highQuality} />)}

          {sec('Classification & Rates')}
          {sel('UBS LP Classification', 'cls', UBS_CLS_OPTS, true)}
          {sel('Agent LP Classification', 'agentCls', AGENT_CLS_OPTS, true)}
          {pct('UBS Advance Rate', 'ubsAdvRatePct', 5)}
          {pct('Agent Advance Rate', 'agentRatePct', 5)}

          {sec('Ratings')}
          {sel('S&P', 'sp', SP_RATING_OPTS)}
          {sel("Moody's", 'mdy', MDY_RATING_OPTS)}
          {sel('Fitch', 'fitch', SP_RATING_OPTS)}

          {sec('Financial Scale')}
          {txt('LP Size ($ Bil)', 'lpSizeBil')}
          {sel('LP Size Criteria', 'lpSizeCriteria', LP_SIZE_CRITERIA_OPTS)}

          {sec('Commitment & Capital')}
          {txt('Capital Commitments', 'capCommit')}
          {ro('% of Capital Committed', fmtPct(calc.cmtPct))}
          {ro('Called Capital', fmtM(calc.calledM))}
          {moneyM('Uncalled Capital', 'ucM')}
          {ro('% of Uncalled Capital', fmtPct(calc.pctUncalled))}
          {ro('% of LP Called', fmtPct(calc.pctCalled))}

          {sec('Concentration & Borrowing Base')}
          {pct('Agent Concentration Limit', 'agentConcLimitPct', 0.5)}
          {pct('UBS Concentration Limit', 'concLimitPct', 0.5)}
          {ro('Agent Excess Conc. Base', fmtM(calc.agentExcess), false, calc.agentExcess > 0 ? 'neg' : 'zero')}
          {ro('UBS Excess Conc. Base', fmtM(calc.ubsExcess), false, calc.ubsExcess > 0 ? 'neg' : 'zero')}
          {ro('Agent Borrowing Base', fmtM(calc.agentBBCalc), false, calc.agentBBCalc === 0 ? 'zero' : undefined)}
          {ro('UBS Borrowing Base', fmtM(calc.ubsBBCalc), false, calc.ubsBBCalc > 0 ? 'pos' : 'zero')}
          {ro('UBS Eligible Uncalled', fmtM(calc.ubsEligUncalled))}
          {ro('UBS Included', <YesNo val={calc.ubsIncluded} />)}

          {sec('Status & Notes')}
          {chk('Included', 'inc')}
          {wrap(true, <>
            {lbl('Notes')}
            <textarea value={ov.notes ?? ''} disabled={running} style={{ ...inputSt, height: 56, resize: 'vertical' }}
              onChange={e => onChange('notes', e.target.value)} />
          </>, 'notes')}
        </div>
      </div>
    </div>
  )
}
