import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { useApp } from '../../context/AppContext'
import StepBar from '../../components/ui/StepBar'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Tag from '../../components/ui/Tag'
import Modal from '../../components/ui/Modal'
import { WIZARD_STEPS } from '../../config/wizardConfig'
import {
  UBS_CLS_OPTS, UBS_CLS_DEFAULT_RATE, ubsClassFromAgentRate,
  TYPE_OPTS, SP_RATING_OPTS, MDY_RATING_OPTS, REGION_OPTS,
} from '../../config/classificationConfig'
import { computePortfolioBB, fmtM, fmtPct } from '../../services/bbCalculationService'
import { getMatchQueue } from '../../services/matchingService'
import { api } from '../../services/api'
import type { LPRecord } from '../../services/lpService'
import type { Submission, AgentExtractedRow, LpRate, CommitLpRow, LpClassificationRequest } from '../../services/api'

const DEFAULT_CL_M   = 25
const DEFAULT_CL_PCT = 7.5

function parsePct(str: string | undefined | null): number | '' {
  if (!str || str === '—') return ''
  return parseFloat(String(str).replace('%', '')) || ''
}
function parseMoneyM(str: string | undefined | null): number {
  if (!str) return 0
  const m = String(str).match(/\$?\s*([\d,.]+)\s*([MB])?/i)
  if (!m) return 0
  let v = parseFloat(m[1].replace(/,/g, '')) || 0
  if ((m[2] || '').toUpperCase() === 'B') v *= 1000
  return v
}
const num = (v: number | '' | undefined): number => (typeof v === 'number' ? v : 0)

function fmtFull(n: number): string {
  if (n === 0) return '$0'
  const abs = Math.abs(n)
  return `${n < 0 ? '–' : ''}$${Math.round(abs * 1_000_000).toLocaleString()}`
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

function calcRow(ov: Override, totalCommitM: number, totalUncalledM: number) {
  const advRate  = num(ov.ubsAdvRatePct) / 100
  const agRate   = num(ov.agentRatePct) / 100
  const ubsClPct = num(ov.concLimitPct) / 100
  const agClPct  = num(ov.agentConcLimitPct) / 100
  const uc       = parseMoneyM(ov.ucM)
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
  const bbDelta         = ubsBBCalc - agentBBCalc

  return {
    cmtPct, commitM, calledM, pctUncalled, pctCalled,
    ubsEligUncalled, agentEligUncl, ubsBBCalc, agentBBCalc,
    ubsExcess, agentExcess, ubsIncluded, highQuality, included, bbDelta,
  }
}

function deriveInc(cls: string, isNew: boolean, masterInc: boolean | undefined): boolean {
  if (!cls || cls === 'Excluded') return false
  return isNew ? true : !!(masterInc)
}

type SubmissionLP = Partial<LPRecord> & { _key: string; _isNew: boolean; _agentName: string }
type Override = {
  parent: string; spv: boolean; region: string; type: string; ig: boolean
  cls: string; agentCls: string
  sp: string; mdy: string; fitch: string
  aum: string; nav: string; pension: string; pensionFunded: string
  capCommit: string; ucM: string
  ubsAdvRatePct: number | ''; agentRatePct: number | ''
  concLimitPct: number | ''; agentConcLimitPct: number | ''
  inc: boolean; notes: string
}

// Orders the Run Shadow BB rows in the original Agent BB file order.
export function orderSubmissionLPs<T extends { name?: string; _agentName?: string }>(
  rows: T[],
  matchQueue: { id: number; agentName?: string; masterName?: string | null }[],
  live: boolean,
): T[] {
  if (live) return rows
  const agentOrder: Record<string, number> = {}
  ;[...matchQueue]
    .sort((a, b) => a.id - b.id)
    .forEach((mq, i) => {
      const agent  = (mq.agentName  || '').toLowerCase()
      const master = (mq.masterName || '').toLowerCase()
      if (agent  && !(agent  in agentOrder)) agentOrder[agent]  = i
      if (master && !(master in agentOrder)) agentOrder[master] = i
    })
  const orderOf = (lp: T): number =>
    agentOrder[(lp._agentName || '').toLowerCase()]
    ?? agentOrder[(lp.name || '').toLowerCase()]
    ?? Number.MAX_SAFE_INTEGER
  return [...rows].sort((a, b) => orderOf(a) - orderOf(b))
}

export default function RunShadowBB() {
  const { toast, navigate, bbParams, activeSubmission, activeSubmissionId, abortSubmission, setTargetFacility } = useApp()
  const [matchQueue, setMatchQueue] = useState<Awaited<ReturnType<typeof getMatchQueue>>>([])
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
  const [containerWidth, setContainerWidth] = useState(Infinity)

  useEffect(() => {
    const el = document.querySelector('.content') as HTMLElement | null
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const compact = containerWidth < 1500

  const handleAbort = async () => {
    if (activeSubmissionId != null) {
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
    setLoadError(null)
    const queuePromise = getMatchQueue(activeSubmissionId ?? 0)
    const rowsPromise = activeSubmissionId
      ? api.extraction.agentRows(activeSubmissionId).catch(() => [] as AgentExtractedRow[])
      : Promise.resolve([] as AgentExtractedRow[])
    Promise.all([queuePromise, rowsPromise])
      .then(([q, rows]) => {
        setMatchQueue(q)
        const map: Record<string, AgentExtractedRow> = {}
        for (const r of rows) { if (r.name) map[r.name.toLowerCase()] = r }
        setExtractedMap(map)
      })
      .catch(e => setLoadError(String(e)))
  }, [activeSubmissionId])

  useEffect(() => {
    if (!activeSubmissionId) return
    api.submissions.get(activeSubmissionId)
      .then(setSubmissionDetails)
      .catch(() => {})
  }, [activeSubmissionId])

  useEffect(() => {
    const facilityId = submissionDetails?.facilityId
    if (facilityId == null) return
    api.lps.list({ facilityId })
      .then(setFacilityLPs)
      .catch(() => {})
  }, [submissionDetails?.facilityId])

  useEffect(() => {
    api.lps.rates(submissionDetails?.periodMonth ?? undefined)
      .then(rates => setLpRates(new Map(rates.map(r => [r.lpName.toLowerCase(), r]))))
      .catch(() => {})
  }, [submissionDetails?.periodMonth])

  const submissionLPs = useMemo<SubmissionLP[]>(() => {
    return facilityLPs.map(lp => ({
      ...lp,
      _key: `lp-${lp.name}`, _isNew: false, _agentName: lp.name,
    }))
  }, [facilityLPs])

  const buildOverride = (lp: SubmissionLP): Override => {
    const ext  = extractedMap[(lp._agentName || lp.name || '').toLowerCase()]
    const rate = lpRates.get((lp.name || '').toLowerCase())
               ?? lpRates.get((lp._agentName || '').toLowerCase())
    const toRating = (extracted: string | undefined, master: string | undefined) => {
      const v = extracted || master || ''
      return v !== 'NR' ? v : ''
    }
    const agentRatePct = parsePct(ext?.agentRate || lp.agentRate)
    const isUbsCls = (UBS_CLS_OPTS as readonly string[]).includes(lp.cls ?? '')
    const cls = isUbsCls ? (lp.cls as string) : ubsClassFromAgentRate(agentRatePct)
    return {
      parent:            lp.parent ?? '',
      spv:               !!lp.spv,
      region:            lp.region ?? '',
      type:              lp.type ?? 'Institutional',
      ig:                !!lp.ig,
      cls,
      agentCls:          lp.agentCls ?? '',
      sp:                toRating(ext?.sp,     lp.sp),
      mdy:               toRating(ext?.moodys, lp.mdy),
      fitch:             toRating(ext?.fitch,  lp.fitch),
      aum:               lp.aum || ext?.aum || '',
      nav:               lp.nav || ext?.nav || '',
      pension:           lp.pension ?? '',
      pensionFunded:     lp.pensionFunded ?? '',
      capCommit:         lp.capCommit ?? '',
      ucM:               lp.uc ?? '',
      ubsAdvRatePct:     rate ? rate.ubsAdvRatePct * 100
                              : (cls ? parsePct(UBS_CLS_DEFAULT_RATE[cls]) : '') || parsePct(lp.rate),
      agentRatePct,
      concLimitPct:      rate ? rate.ubsConcLimitPct * 100
                              : parsePct(lp.ubsConc) || DEFAULT_CL_PCT,
      agentConcLimitPct: parsePct(ext?.agentConc || lp.agentConc),
      inc:               deriveInc(cls, lp._isNew, lp.inc),
      notes:             lp.notes ?? '',
    }
  }

  const [overrides, setOverrides] = useState<Record<string, Override>>(() =>
    Object.fromEntries(submissionLPs.map(lp => [lp._key, buildOverride(lp)]))
  )

  type FlashCol = 'highQuality' | 'ubsIncluded' | 'ubsBBCalc'
  type FlashTracker = Record<string, Partial<Record<FlashCol, number>>>
  const [flashKeys, setFlashKeys] = useState<FlashTracker>({})

  type SaveStatus = 'saving' | 'saved' | 'error'
  const [saveState, setSaveState] = useState<Record<string, SaveStatus>>({})
  const savedTimers   = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const persistTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const overridesRef  = useRef<Record<string, Override>>(overrides)
  const editedKeys    = useRef<Set<string>>(new Set())

  useEffect(() => { overridesRef.current = overrides }, [overrides])

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
      aum:               ov.aum || undefined,
      nav:               ov.nav || undefined,
      pension:           ov.pension || undefined,
      pensionFunded:     ov.pensionFunded || undefined,
      capCommit:         ov.capCommit || undefined,
      uc:                ov.ucM || undefined,
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
    if (facilityId == null) return
    const row = toRow(key, ov)
    if (!row) return
    setSaveState(s => ({ ...s, [key]: 'saving' }))
    api.lps.saveClassification({
      facilityId,
      effectiveDate: submissionDetails?.periodMonth ?? undefined,
      rows: [row],
    })
      .then(() => {
        setSaveState(s => ({ ...s, [key]: 'saved' }))
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

  // Always-current ref so the debounce timer calls the latest version of persistRow.
  const persistRowRef = useRef(persistRow)
  persistRowRef.current = persistRow

  const flushAuditRef = useRef<() => void>(() => {})
  flushAuditRef.current = () => {
    const facilityId = submissionDetails?.facilityId
    if (facilityId == null || editedKeys.current.size === 0) return
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

  useEffect(() => () => {
    Object.values(savedTimers.current).forEach(clearTimeout)
    Object.values(persistTimers.current).forEach(clearTimeout)
    flushAuditRef.current()
  }, [])

  // Apply a field change immediately to live overrides, detect flash-worthy column changes,
  // and debounce the API persist so rapid typing doesn't produce a request per keystroke.
  const handleFieldChange = (field: keyof Override, value: unknown) => {
    if (!selectedKey) return
    const key = selectedKey
    const old = overrides[key]
    const next = { ...old, [field]: value } as Override
    if (field === 'cls') {
      next.ubsAdvRatePct = parsePct(UBS_CLS_DEFAULT_RATE[value as string])
    }
    if (old) {
      const oldC = calcRow(old, totalCommitM, totalUncalledM)
      const newC = calcRow(next, totalCommitM, totalUncalledM)
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
    }
    setOverrides(prev => ({ ...prev, [key]: next }))
    editedKeys.current.add(key)
    clearTimeout(persistTimers.current[key])
    persistTimers.current[key] = setTimeout(() => {
      persistRowRef.current(key, overridesRef.current[key])
    }, 600)
  }

  const resetOverrides = () => {
    setOverrides(Object.fromEntries(submissionLPs.map(lp => [lp._key, buildOverride(lp)])))
    setFlashKeys({})
  }

  const savedOverridesApplied = useRef(false)

  useEffect(() => {
    if (savedOverridesApplied.current) return
    setOverrides(Object.fromEntries(submissionLPs.map(lp => [lp._key, buildOverride(lp)])))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionLPs, lpRates])

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

  const submissionSummary = useMemo(() => {
    const facilityName = submissionDetails?.facilityName ?? activeSubmission ?? '—'
    let asOfDate = '—'
    if (submissionDetails?.periodMonth) {
      const [y, m] = submissionDetails.periodMonth.split('-')
      asOfDate = new Date(parseInt(y), parseInt(m) - 1, 1)
        .toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
    }
    const agentBank = submissionDetails?.agentBank ?? '—'
    const totalLPs  = matchQueue.length
    const newCount  = matchQueue.filter(mq => !mq.masterName).length
    const uncalledM = Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.ucM), 0)
    const commitM   = Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.capCommit), 0)
    const totalUncalled   = uncalledM > 0 ? `$${Math.round(uncalledM * 1_000_000).toLocaleString()}` : '—'
    const totalCommitment = commitM   > 0 ? `$${Math.round(commitM   * 1_000_000).toLocaleString()}` : '—'
    return [
      { label: 'Facility',          value: String(facilityName) },
      { label: 'As of Date',        value: asOfDate },
      { label: 'Agent Bank',        value: String(agentBank) },
      { label: 'LPs in Submission', value: String(totalLPs) },
      { label: 'New LP Records',    value: newCount > 0 ? `${newCount} created` : '0' },
      { label: 'Total Commitment',  value: totalCommitment },
      { label: 'Total Uncalled',    value: totalUncalled },
    ]
  }, [submissionDetails, activeSubmission, matchQueue, overrides])

  const newLPs        = submissionLPs.filter(lp => lp._isNew)
  const overrideCount = submissionLPs.filter(lp => !lp._isNew && overrides[lp._key]?.cls !== lp.cls).length
  const unclassified  = submissionLPs.filter(lp => !overrides[lp._key]?.cls).length

  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false)
  const displayLPs = useMemo(() => {
    if (!unclassifiedOnly || unclassified === 0) return submissionLPs
    return submissionLPs
      .filter(lp => !overrides[lp._key]?.cls)
      .sort((a, b) => (a.name ?? a._agentName ?? '').localeCompare(b.name ?? b._agentName ?? ''))
  }, [submissionLPs, overrides, unclassifiedOnly, unclassified])

  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(displayLPs)

  const totalCommitM = useMemo(() =>
    Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.capCommit), 0)
  , [overrides])

  const totalUncalledM = useMemo(() =>
    Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.ucM), 0)
  , [overrides])

  // Deselect if the selected row leaves the current page or the BB result replaces the table.
  useEffect(() => {
    if (!selectedKey) return
    if (result || !pageItems.some(lp => lp._key === selectedKey)) setSelectedKey(null)
  }, [pageItems, selectedKey, result])

  useEffect(() => {
    if (selectedKey === null || displayLPs.length === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      e.preventDefault()
      const idx = displayLPs.findIndex(lp => lp._key === selectedKey)
      if (idx === -1) return
      const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1
      if (nextIdx < 0 || nextIdx >= displayLPs.length) return
      setSelectedKey(displayLPs[nextIdx]._key)
      const nextPage = Math.floor(nextIdx / pageSize) + 1
      if (nextPage !== page) setPage(nextPage)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [displayLPs, selectedKey, page, pageSize, setPage])

  const run = async () => {
    setRunning(true)
    setLoadError(null)
    if (unclassified > 0) toast(`${unclassified} unclassified LP${unclassified !== 1 ? 's' : ''} will be treated as Excluded`)
    toast('Shadow BB calculation started…')

    const overriddenLPs = submissionLPs.map(lp => {
      const ov         = overrides[lp._key] ?? buildOverride(lp)
      const c          = calcRow(ov, totalCommitM, totalUncalledM)
      const ucM        = parseMoneyM(ov.ucM)
      const concLimitM = typeof ov.concLimitPct === 'number'
        ? (ov.concLimitPct / 100) * totalUncalledM
        : DEFAULT_CL_M
      const rate      = typeof ov.ubsAdvRatePct === 'number' ? `${ov.ubsAdvRatePct}%` : (lp.rate ?? '0%')
      const agentRate = typeof ov.agentRatePct  === 'number' ? `${ov.agentRatePct.toFixed(1)}%` : (lp.agentRate ?? '')
      return {
        ...lp,
        parent: ov.parent, spv: ov.spv, region: ov.region as LPRecord['region'], type: ov.type as LPRecord['type'], ig: ov.ig,
        cls: ov.cls || 'Excluded', agentCls: ov.agentCls,
        sp: ov.sp ?? '', mdy: ov.mdy ?? '', fitch: ov.fitch ?? '',
        aum: ov.aum, nav: ov.nav, pension: ov.pension, pensionFunded: ov.pensionFunded,
        capCommit: ov.capCommit, rate, agentRate, ucM, uc: `$${ucM.toFixed(1)}M`,
        ubsConc: fmtM(concLimitM),
        agentExcessConc: fmtM(c.agentExcess), ubsExcessConc: fmtM(c.ubsExcess),
        abb: fmtM(c.agentBBCalc), ubb: fmtM(c.ubsBBCalc),
        concLimitM, inc: ov.inc ?? false, notes: ov.notes,
      }
    })

    const computed = computePortfolioBB(overriddenLPs as LPRecord[], bbParams)
    const { summary } = computed

    {
      const facilityId = submissionDetails?.facilityId
      if (facilityId != null) {
        try {
          const commitRows: CommitLpRow[] = overriddenLPs.map(lp => ({
            name:            lp.name ?? '',
            parent:          lp.parent ?? null,
            spv:             lp.spv ?? false,
            hq:              lp.hq ?? true,
            type:            lp.type ?? 'Institutional',
            region:          lp.region ?? '',
            ig:              lp.ig ?? false,
            cls:             lp.cls ?? 'Excluded',
            agentCls:        lp.agentCls || null,
            sp:              lp.sp ?? '',
            mdy:             lp.mdy ?? '',
            fitch:           lp.fitch ?? '',
            aum:             lp.aum || null,
            nav:             lp.nav || null,
            pension:         lp.pension || null,
            pensionFunded:   lp.pensionFunded || null,
            capCommit:       lp.capCommit || null,
            pctCapCommit:    lp.pctCapCommit || null,
            calledCap:       lp.calledCap || null,
            uc:              lp.uc || null,
            pctUncalled:     lp.pctUncalled || null,
            pctCalled:       lp.pctCalled || null,
            agentConc:       lp.agentConc || null,
            ubsConc:         lp.ubsConc || null,
            agentRate:       lp.agentRate || null,
            abb:             lp.abb || null,
            ubb:             lp.ubb || null,
            agentExcessConc: lp.agentExcessConc || null,
            ubsExcessConc:   lp.ubsExcessConc || null,
            inc:             lp.inc ?? false,
            rcl:             lp.rcl ?? false,
            notes:           lp.notes || null,
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
    { label: 'UBS Borrowing Base',            value: fmtFull(result.summary.totalUBB),        hi: true },
    { label: 'Agent Borrowing Base',           value: fmtFull(result.summary.totalABB)                  },
    { label: 'BB Delta',                       value: fmtFull(result.summary.bbDelta),          neg: result.summary.bbDelta < 0 },
    { label: 'Effective Advance Rate (UBS)',   value: fmtPct(result.summary.ear)                     },
    { label: 'Effective Advance Rate (Agent)', value: fmtPct(result.summary.agentEar)                },
    { label: 'EAR Delta',                      value: fmtPct(result.summary.earDelta),       neg: result.summary.earDelta < 0 },
    { label: 'Included LPs',                   value: result.summary.includedCount                   },
    { label: 'Excluded LPs',                   value: result.summary.excludedCount                   },
    { label: 'Reclassified LPs',               value: result.summary.reclassCount                    },
    { label: 'UBS Elig. Uncalled',             value: fmtFull(result.summary.totalUEC)                  },
    { label: 'Conc. Excess (total)',            value: fmtFull(result.summary.totalConcExcess), neg: result.summary.totalConcExcess > 0 },
  ] : []

  const selectedLp = submissionLPs.find(lp => lp._key === selectedKey) ?? null

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))' }}>
      {loadError && <div style={{ padding: '10px 16px', background: '#fff0f0', color: 'var(--danger)', fontSize: 12 }}>API error — {loadError}</div>}
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
          <Card title="LP Category & Rate Assignment"
            subtitle={`Step 5 · ${submissionLPs.length} LPs · ${newLPs.length > 0 ? `${newLPs.length} new` : 'all matched to LP Master'} · select a row to edit the full LP record`}
            action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {unclassified > 0 && <button onClick={() => setUnclassifiedOnly(v => !v)} title={unclassifiedOnly ? 'Show all LPs' : 'Show only unclassified LPs'} style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, background: unclassifiedOnly ? 'color-mix(in srgb, var(--danger) 12%, transparent)' : 'none', border: 'none', padding: '3px 6px', borderRadius: 3, cursor: 'pointer', textDecoration: 'underline' }}>{unclassified} unclassified</button>}
                {overrideCount > 0 && <button onClick={resetOverrides} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 8px', cursor: 'pointer' }}>Reset {overrideCount} override{overrideCount !== 1 ? 's' : ''}</button>}
                <Button variant="danger" size="sm" onClick={() => setAbortOpen(true)} disabled={running}>Abort Submission</Button>
                <Button size="sm" onClick={run} disabled={running}>{running ? 'Calculating…' : 'Run Shadow BB'}</Button>
              </div>
            }
          >
            {/* Table (left) + LP record card (right / overlay). Clicking a row opens the card.
                Wide (>1500): 2-column grid with wider sticky card on the right; full dollar amounts.
                Compact (≤1500): single column; card slides in as overlay; amounts in $M. */}
            <div style={compact
              ? { position: 'relative', padding: '4px 18px 0' }
              : { display: 'grid', gridTemplateColumns: selectedLp && selectedKey && overrides[selectedKey] ? 'minmax(0, 1fr) 520px' : 'minmax(0, 1fr)', gap: 14, padding: '4px 18px 0', alignItems: 'start' }
            }>

              <div style={{ minWidth: 0 }}>
                <div className="data-table-wrap">
                  <table className="data-table dense" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Investor Name</th>
                        <th style={{ width: 96 }}>LP Category</th>
                        <th style={{ width: 168 }}>UBS Classification</th>
                        <th className="num" style={{ width: 64 }}>UBS Rate</th>
                        <th className="num" style={{ width: 66 }}>Agent Rate</th>
                        <th className="num" style={{ width: compact ? 92 : 130 }}>Uncalled</th>
                        <th className="num" style={{ width: compact ? 78 : 116 }}>Agent BB</th>
                        <th className="num" style={{ width: compact ? 78 : 116 }}>UBS BB</th>
                        <th style={{ width: 52, textAlign: 'center' }}>Incl.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map(lp => {
                        const key      = lp._key
                        const ov       = overrides[key] ?? {} as Override
                        const missing  = !ov.cls
                        const selected = key === selectedKey
                        const c = calcRow(ov, totalCommitM, totalUncalledM)
                        const n = lp.name ?? lp._agentName ?? '—'
                        return (
                          <tr key={key} className={selected ? 'data-table-row-selected' : undefined} onClick={() => setSelectedKey(key)}
                            style={{ cursor: 'pointer',
                              background: !selected && missing ? 'color-mix(in srgb, var(--danger) 6%, transparent)' : undefined }}>
                            <td title={n}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                                <span style={{ fontWeight: selected ? 700 : 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                                {lp._isNew && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--red)', color: '#fff', borderRadius: 2, padding: '1px 4px', letterSpacing: '0.04em', flexShrink: 0 }}>NEW</span>}
                                {saveState[key] === 'saving' && <span style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>Saving…</span>}
                                {saveState[key] === 'saved'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>✓</span>}
                                {saveState[key] === 'error'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--danger)', flexShrink: 0 }}>✕</span>}
                              </div>
                            </td>
                            <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{ov.type || '—'}</td>
                            <td style={{ color: ov.cls ? 'var(--text)' : 'var(--danger)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }} title={ov.cls || 'Unclassified'}>{ov.cls || 'Unclassified'}</td>
                            <td className="num">{typeof ov.ubsAdvRatePct === 'number' ? `${ov.ubsAdvRatePct}%` : '—'}</td>
                            <td className="num">{typeof ov.agentRatePct === 'number' ? `${ov.agentRatePct.toFixed(0)}%` : '—'}</td>
                            <td className="num">{compact ? (ov.ucM || '—') : (ov.ucM ? fmtFull(parseMoneyM(ov.ucM)) : '—')}</td>
                            <td className={`num ${c.agentBBCalc === 0 ? 'zero' : ''}`}>{compact ? fmtM(c.agentBBCalc) : fmtFull(c.agentBBCalc)}</td>
                            <td key={`ubb-${key}-${flashKeys[key]?.ubsBBCalc ?? 0}`} className={`num ${c.ubsBBCalc === 0 ? 'zero' : ''} ${flashKeys[key]?.ubsBBCalc ? 'cell-flash' : ''}`}>{compact ? fmtM(c.ubsBBCalc) : fmtFull(c.ubsBBCalc)}</td>
                            <td style={{ textAlign: 'center' }}><YesNo val={c.included} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="tbl-footer">
                  <span>Showing {from}–{to} of {displayLPs.length} LPs{unclassifiedOnly && unclassified > 0 && <span style={{ color: 'var(--muted)' }}> (filtered)</span>}{unclassified > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}> · {unclassified} unclassified</span>}{newLPs.length > 0 && <span style={{ color: 'var(--red)', fontWeight: 600 }}> · {newLPs.length} new</span>}</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}>{PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}</select>
                    {totalPages > 1 && (<><Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>‹ Prev</Button><span style={{ fontSize: 11, color: 'var(--muted)' }}>Page {page} of {totalPages}</span><Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next ›</Button></>)}
                  </div>
                </div>
              </div>

              {/* Compact overlay card — slides in over the table on row click */}
              {compact && selectedLp && selectedKey && overrides[selectedKey] && (
                <div className="lp-detail-overlay">
                  <LPRecordCard
                    lp={selectedLp}
                    ov={overrides[selectedKey]}
                    calc={calcRow(overrides[selectedKey], totalCommitM, totalUncalledM)}
                    saveStatus={saveState[selectedKey]}
                    running={running}
                    onDeselect={() => setSelectedKey(null)}
                    onChange={handleFieldChange}
                  />
                </div>
              )}

              {/* Wide right-side LP record card — sticky so it stays in view while scrolling */}
              {!compact && selectedLp && selectedKey && overrides[selectedKey] && (
                <div style={{ position: 'sticky', top: 4 }}>
                  <LPRecordCard
                    lp={selectedLp}
                    ov={overrides[selectedKey]}
                    calc={calcRow(overrides[selectedKey], totalCommitM, totalUncalledM)}
                    saveStatus={saveState[selectedKey]}
                    running={running}
                    onDeselect={() => setSelectedKey(null)}
                    onChange={handleFieldChange}
                  />
                </div>
              )}
            </div>
          </Card>
        )}

        {result && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Tag variant="active" style={{ fontSize: 12, padding: '5px 10px' }}>✓ Calculation complete</Tag><Button onClick={() => { setTargetFacility(submissionDetails?.facilityName ?? activeSubmission ?? null); navigate('shadow-bb') }}>View BB Results</Button><Button variant="secondary" onClick={() => navigate('upload')}>Upload Another Submission</Button></div>}

        {result && (
          <Card title="Calculation Results" subtitle={`${submissionLPs.length} LP records processed`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 24px', padding: '4px 18px 18px' }}>
              {resultRows.map(r => (
                <div key={r.label}><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{r.label}</div><div style={{ fontSize: 13, fontWeight: (r as { hi?: boolean }).hi ? 700 : 600, color: (r as { neg?: boolean }).neg ? 'var(--danger)' : (r as { hi?: boolean }).hi ? 'var(--navy)' : 'var(--text)' }}>{String(r.value)}</div></div>
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

// ── LP record card — sectioned editable form; used as the right-side panel in Step 5.
// Manual-Input columns are editable; Calculated columns are derived live by calcRow and read-only.
// Layout and section structure mirror LP Master Database (LPDetailOverlay) exactly.
function LPRecordCard({ lp, ov, calc, onChange, onDeselect, running, saveStatus }: {
  lp: SubmissionLP
  ov: Override
  calc: ReturnType<typeof calcRow>
  onChange: (field: keyof Override, value: unknown) => void
  onDeselect?: () => void
  running: boolean
  saveStatus?: 'saving' | 'saved' | 'error'
}) {
  const name = lp.name ?? lp._agentName ?? '—'

  // ── Helpers matching LP Master Database style ────────────────────────────────
  const inputSt: React.CSSProperties = { width: '100%', fontSize: 12, padding: '3px 6px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--card)' }
  const roSt:    React.CSSProperties = { ...inputSt, background: 'var(--tbl)', color: 'var(--muted)' }
  const COLS: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', padding: '12px 16px' }

  const sec = (t: string) => (
    <div style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy)', marginTop: 10, padding: '4px 10px', background: 'var(--tbl)', borderRadius: 4, borderLeft: '3px solid var(--navy)' }}>{t}</div>
  )
  const flbl = (label: string, calculated?: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)' }}>{label}</span>
      {calculated && <span title="Calculated field" style={{ fontSize: 8, fontWeight: 700, lineHeight: 1, color: 'var(--red)', background: '#eef3fb', borderRadius: 3, padding: '1px 4px', fontStyle: 'italic' }}>ƒ</span>}
    </div>
  )
  const fcaption = (formula: string) => (
    <div style={{ fontSize: 9, fontStyle: 'italic', color: 'var(--muted)', lineHeight: 1.4, padding: '2px 0 0' }}>{formula}</div>
  )
  const wrap = (span: boolean | number, children: React.ReactNode, key: string) => (
    <div key={key} style={typeof span === 'number' ? { gridColumn: `span ${span}` } : span ? { gridColumn: '1 / -1' } : undefined}>{children}</div>
  )

  // Read-only calculated field with ƒ badge and optional formula caption
  const ro = (label: string, value: React.ReactNode, span2: boolean | number = false, formula?: string) =>
    wrap(span2, <>
      {flbl(label, true)}
      <input type="text" value={String(value ?? '—')} style={roSt} readOnly />
      {formula && fcaption(formula)}
    </>, label)

  const txt = (label: string, field: keyof Override, span2: boolean | number = false) =>
    wrap(span2, <>{flbl(label)}<input type="text" value={String(ov[field] ?? '')} disabled={running} style={inputSt} onChange={e => onChange(field, e.target.value)} /></>, label)

  const sel = (label: string, field: keyof Override, opts: readonly string[], span2: boolean | number = false) =>
    wrap(span2, <>{flbl(label)}<select value={String(ov[field] ?? '')} disabled={running} style={inputSt} onChange={e => onChange(field, e.target.value)}>{opts.map(o => <option key={o || '__empty'} value={o}>{o || '—'}</option>)}</select></>, label)

  const chk = (label: string, field: keyof Override) =>
    wrap(false, <>{flbl(label)}<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer', minHeight: 24 }}><input type="checkbox" checked={!!ov[field]} disabled={running} onChange={e => onChange(field, e.target.checked)} /> Yes</label></>, label)

  // ── UBS vs Agent comparison row ──────────────────────────────────────────────
  const cmpAgent = (node: React.ReactNode, tone?: 'neg' | 'zero') => (
    <div style={{ fontSize: 12.5, padding: '4px 8px', minHeight: 28, display: 'flex', alignItems: 'center',
      background: 'var(--tbl)', borderRadius: 3, color: tone === 'neg' ? 'var(--danger)' : tone === 'zero' ? 'var(--muted)' : 'var(--text)' }}>{node}</div>
  )
  const cmpUbsRo = (node: React.ReactNode, tone?: 'neg' | 'pos' | 'zero') => (
    <div style={{ fontSize: 12.5, fontWeight: 600, padding: '4px 8px', minHeight: 28, display: 'flex', alignItems: 'center',
      background: 'color-mix(in srgb, var(--red) 7%, transparent)', borderRadius: 3,
      color: tone === 'neg' ? 'var(--danger)' : tone === 'pos' ? 'var(--green)' : tone === 'zero' ? 'var(--muted)' : 'var(--navy)' }}>{node}</div>
  )
  const cmpUbsSel = (field: keyof Override, opts: readonly string[]) => (
    <select value={String(ov[field] ?? '')} disabled={running} style={inputSt} onChange={e => onChange(field, e.target.value)}>
      {opts.map(o => <option key={o || '__empty'} value={o}>{o || '—'}</option>)}
    </select>
  )
  const cmpUbsPct = (field: keyof Override, step = 5) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <input type="number" value={ov[field] === '' || ov[field] == null ? '' : Number(ov[field])} disabled={running}
        min={0} max={100} step={step} style={{ ...inputSt, textAlign: 'right' }}
        onChange={e => onChange(field, e.target.value === '' ? '' : parseFloat(e.target.value))} />
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>%</span>
    </div>
  )
  const pctStr = (v: number | '' | undefined) => (typeof v === 'number' ? `${v}%` : '—')
  const cmpRow = (label: string, agentNode: React.ReactNode, ubsNode: React.ReactNode) => (
    <Fragment key={label}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center' }}>{label}</div>
      {agentNode}
      {ubsNode}
    </Fragment>
  )

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
      {/* ── Header ── */}
      <div style={{ background: 'var(--navy)', color: '#fff', padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</div>
            {lp._isNew && <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(255,255,255,.2)', borderRadius: 3, padding: '2px 6px', flexShrink: 0 }}>NEW</span>}
          </div>
          {onDeselect && <button onClick={onDeselect} aria-label="Close" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1, opacity: .7, padding: 0, flexShrink: 0 }}>×</button>}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: .92 }}>
          {ov.cls && <Tag>{ov.cls}</Tag>}
          <span style={{ fontSize: 11, opacity: .8 }}>{pctStr(ov.ubsAdvRatePct)} UBS · {pctStr(ov.agentRatePct)} Agent</span>
          {saveStatus === 'saving' && <span style={{ fontSize: 10 }}>Saving…</span>}
          {saveStatus === 'saved'  && <span style={{ fontSize: 10, fontWeight: 700, color: '#9be8b6' }}>✓ Saved</span>}
          {saveStatus === 'error'  && <span style={{ fontSize: 10, fontWeight: 700, color: '#ff9b9b' }}>✕ Failed</span>}
        </div>
      </div>

      {/* ── Body — 2-column grid matching LP Master Database layout ── */}
      <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
        <div style={COLS}>
          {sec('Identity')}
          {wrap(true, <>{flbl('Investor Name')}<input type="text" value={name} style={roSt} readOnly /></>, 'inv-name')}
          {txt('Parent / Manager / Sponsor', 'parent', true)}
          {chk('SPV?', 'spv')}
          {sel('Region / Location', 'region', ['', ...REGION_OPTS])}
          {sel('Investor Type', 'type', TYPE_OPTS)}
          {chk('Investment Grade?', 'ig')}
          {ro('High Quality', <YesNo val={calc.highQuality} />, false, 'Flagged when UBS Advance Rate = 90%')}

          {sec('UBS vs Agent — Classification, Rates & Borrowing Base')}
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: '7px 12px', alignItems: 'center' }}>
            <div />
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Agent · from BB</div>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--red)' }}>UBS · editable</div>
            {cmpRow('LP Category',   cmpAgent(ov.agentCls || '—'),                                               cmpUbsSel('cls', UBS_CLS_OPTS))}
            {cmpRow('Advance Rate',  cmpAgent(pctStr(ov.agentRatePct)),                                           cmpUbsPct('ubsAdvRatePct', 5))}
            {cmpRow('Conc. Limit',   cmpAgent(pctStr(ov.agentConcLimitPct)),                                      cmpUbsPct('concLimitPct', 0.5))}
            {cmpRow('Elig. Uncalled',cmpAgent(fmtM(calc.agentEligUncl)),                                          cmpUbsRo(fmtM(calc.ubsEligUncalled)))}
            {cmpRow('Excess Conc.',  cmpAgent(fmtM(calc.agentExcess), calc.agentExcess > 0 ? 'neg' : 'zero'),    cmpUbsRo(fmtM(calc.ubsExcess), calc.ubsExcess > 0 ? 'neg' : 'zero'))}
            {cmpRow('Borrowing Base',cmpAgent(fmtM(calc.agentBBCalc), calc.agentBBCalc === 0 ? 'zero' : undefined), cmpUbsRo(fmtM(calc.ubsBBCalc), calc.ubsBBCalc > 0 ? 'pos' : 'zero'))}
            {cmpRow('Included',      cmpAgent('—'),                                                               cmpUbsRo(<YesNo val={calc.ubsIncluded} />))}
          </div>

          {sec('Credit Ratings')}
          {sel('S&P', 'sp', SP_RATING_OPTS)}
          {sel("Moody's", 'mdy', MDY_RATING_OPTS)}
          {sel('Fitch', 'fitch', SP_RATING_OPTS)}

          {sec('Financial Scale')}
          {txt('AUM', 'aum')}
          {txt('NAV', 'nav')}
          {txt('Pension Assets', 'pension')}
          {txt('Pension Funded %', 'pensionFunded')}

          {sec('Commitments & Capital')}
          {txt('Capital Commitments', 'capCommit')}
          {ro('% of Capital Commitments', fmtPct(calc.cmtPct), false, 'LP commitment ÷ total fund commitments')}
          {ro('Called Capital',           fmtM(calc.calledM),  false, 'Capital Commitments − Uncalled Capital')}
          {txt('Uncalled Capital', 'ucM')}
          {ro('% of Uncalled Capital', fmtPct(calc.pctUncalled), false, 'LP uncalled ÷ total fund uncalled')}
          {ro('% of LP Called',        fmtPct(calc.pctCalled),   false, 'Called Capital ÷ Capital Commitments')}

          {sec('Notes')}
          {wrap(true, <>{flbl('Notes')}<textarea value={ov.notes ?? ''} disabled={running} style={{ ...inputSt, height: 56, resize: 'vertical' }} onChange={e => onChange('notes', e.target.value)} /></>, 'notes')}
        </div>
      </div>
    </div>
  )
}
