import { useState, useMemo, useEffect, useRef } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { SortableHeader, useSortableRows, type SortSpec } from '../../hooks/useTableSort'
import { useColumnResize, type ColWidths } from '../../hooks/useColumnResize'
import { useApp } from '../../context/AppContext'
import StepBar from '../../components/ui/StepBar'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Tag from '../../components/ui/Tag'
import Modal from '../../components/ui/Modal'
import DraggablePanel from '../../components/ui/DraggablePanel'
import LPRecordPanel  from '../../components/ui/LPRecordPanel'
import {
  buildBusaRateFractions,
  getClassificationConfig,
  getEligibilityConfig,
  getWizardConfig,
  ubsClassFromAgentCls,
  ubsClassFromAgentRate,
  type ClassificationConfig,
  type EligibilityConfig,
} from '../../services/configService'
import { computePortfolioBB, fmtM, fmtPct } from '../../services/bbCalculationService'
import { getMatchQueue } from '../../services/matchingService'
import { api } from '../../services/api'
import type { LPRecord } from '../../services/lpService'
import type { Submission, AgentExtractedRow, LpRate, CommitLpRow, LpClassificationRequest } from '../../services/api'

const DEFAULT_CL_M   = 25
const DEFAULT_CL_PCT = 7.5
export const SHADOW_BB_TABLE_WIDTH = 4145

export const SHADOW_BB_INITIAL_WIDTHS: ColWidths = {
  rank: 52, name: 220, fundSleeve: 140, parent: 160, spv: 54,
  region: 140, investorType: 140, type: 122, agentCls: 166, cls: 174,
  included: 72, ig: 114, sp: 76, mdy: 84, fitch: 76,
  lpSizeBil: 84, lpSizeCriteria: 107, capCommit: 138, cmtPct: 157,
  calledM: 106, ucM: 116, pctUncalled: 128, pctCalled: 104,
  agentRatePct: 120, ubsAdvRatePct: 114, agentConcLimitPct: 158,
  concLimitPct: 144, agentExcess: 164, ubsExcess: 154,
  agentBBCalc: 138, pctAgentBB: 110, ubsBBCalc: 128, pctUbsBB: 110, notes: 180,
}

interface ShadowBBTableHeadProps {
  sort: SortSpec | null
  onSort: (key: string) => void
  widths?: ColWidths
  onResizeStart?: (col: string, e: React.MouseEvent) => void
}

export function ShadowBBTableHead({ sort, onSort, widths, onResizeStart }: ShadowBBTableHeadProps) {
  const w = (key: keyof typeof SHADOW_BB_INITIAL_WIDTHS) => widths?.[key] ?? SHADOW_BB_INITIAL_WIDTHS[key]
  return (
    <thead>
      <tr>
        <SortableHeader sortKey="rank"              sort={sort} onSort={onSort} style={{ width: w('rank') }}                          onResizeStart={onResizeStart}>Rank</SortableHeader>
        <SortableHeader sortKey="name"              sort={sort} onSort={onSort} style={{ width: w('name') }}                          onResizeStart={onResizeStart}>Investor Name</SortableHeader>
        <SortableHeader sortKey="fundSleeve"        sort={sort} onSort={onSort} style={{ width: w('fundSleeve') }}                    onResizeStart={onResizeStart}>Fund Sleeve</SortableHeader>
        <SortableHeader sortKey="parent"            sort={sort} onSort={onSort} style={{ width: w('parent') }}                        onResizeStart={onResizeStart}>Parent</SortableHeader>
        <SortableHeader sortKey="spv"               sort={sort} onSort={onSort} style={{ width: w('spv') }}                           onResizeStart={onResizeStart}>SPV</SortableHeader>
        <SortableHeader sortKey="region"            sort={sort} onSort={onSort} style={{ width: w('region') }}                        onResizeStart={onResizeStart}>Region / Location</SortableHeader>
        <SortableHeader sortKey="investorType"      sort={sort} onSort={onSort} style={{ width: w('investorType') }}                  onResizeStart={onResizeStart}>Investor Type</SortableHeader>
        <SortableHeader sortKey="type"              sort={sort} onSort={onSort} style={{ width: w('type') }}                          onResizeStart={onResizeStart}>Institutional vs HNW</SortableHeader>
        <SortableHeader sortKey="agentCls"          sort={sort} onSort={onSort} style={{ width: w('agentCls') }}                      onResizeStart={onResizeStart}>Agent LP Classification</SortableHeader>
        <SortableHeader sortKey="cls"               sort={sort} onSort={onSort} style={{ width: w('cls') }}                           onResizeStart={onResizeStart}>UBS LP Classification</SortableHeader>
        <SortableHeader sortKey="included"          sort={sort} onSort={onSort} style={{ width: w('included'), textAlign: 'center' }} onResizeStart={onResizeStart}>Eligible</SortableHeader>
        <SortableHeader sortKey="ig"                sort={sort} onSort={onSort} style={{ width: w('ig') }}                            onResizeStart={onResizeStart}>Investment Grade</SortableHeader>
        <SortableHeader sortKey="sp"                sort={sort} onSort={onSort} style={{ width: w('sp') }}                            onResizeStart={onResizeStart}>S&amp;P</SortableHeader>
        <SortableHeader sortKey="mdy"               sort={sort} onSort={onSort} style={{ width: w('mdy') }}                           onResizeStart={onResizeStart}>Moody's</SortableHeader>
        <SortableHeader sortKey="fitch"             sort={sort} onSort={onSort} style={{ width: w('fitch') }}                         onResizeStart={onResizeStart}>Fitch</SortableHeader>
        <SortableHeader sortKey="lpSizeBil"         sort={sort} onSort={onSort} className="num" style={{ width: w('lpSizeBil') }}     onResizeStart={onResizeStart}>LP Size</SortableHeader>
        <SortableHeader sortKey="lpSizeCriteria"    sort={sort} onSort={onSort} style={{ width: w('lpSizeCriteria') }}                onResizeStart={onResizeStart}>Size Measure</SortableHeader>
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

export function parsePct(str: string | undefined | null): number | '' {
  if (!str || str === '—') return ''
  return parseFloat(String(str).replace('%', '')) || ''
}
export function parseMoneyM(str: string | undefined | null): number {
  if (!str) return 0
  const m = String(str).match(/\$?\s*([\d,.]+)\s*([MB])?/i)
  if (!m) return 0
  let v = parseFloat(m[1].replace(/,/g, '')) || 0
  if ((m[2] || '').toUpperCase() === 'B') v *= 1000
  if (!m[2] && (String(str).includes('$') || v >= 100_000)) v /= 1_000_000
  return v
}
const num = (v: number | '' | undefined): number => (typeof v === 'number' ? v : 0)

export function fmtFull(n: number): string {
  if (n === 0) return '$0'
  const abs = Math.abs(n)
  return `${n < 0 ? '–' : ''}$${Math.round(abs * 1_000_000).toLocaleString()}`
}

function fmtMoneyInput(value: string | undefined): string {
  const s = String(value ?? '').trim()
  if (!s) return ''
  const m = parseMoneyM(s)
  return m === 0 ? '$0' : fmtFull(m)
}

export function fmtBillionDisplay(value: string | undefined): string {
  const s = String(value ?? '').trim()
  if (!s) return '—'
  if (/[$MB]/i.test(s)) {
    const parsed = parseMoneyM(s)
    if (parsed > 0) return fmtFull(parsed)
  }
  const n = Number(s.replace(/[$,]/g, ''))
  return Number.isFinite(n)
    ? `$${Math.round(n * 1_000_000_000).toLocaleString('en-US')}`
    : s
}

export const YesNo = ({ val }: { val: boolean }) => (
  <span style={{
    fontWeight: 600, fontSize: 11, padding: '2px 7px', borderRadius: 10,
    background: val ? '#e6f4ea' : 'var(--tbl)',
    color: val ? 'var(--green)' : 'var(--muted)',
  }}>
    {val ? 'Yes' : 'No'}
  </span>
)

export const pctStr = (v: number | '' | undefined) => (typeof v === 'number' ? `${v}%` : '—')

export function calcRow(ov: Override, totalCommitM: number, totalUncalledM: number) {
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
  const agentEligUncl   = agClPct > 0 ? Math.min(uc, totalUncalledM * agClPct) : uc
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

export type SubmissionLP = Partial<LPRecord> & { _key: string; _isNew: boolean; _agentName: string }
export type Override = {
  name: string
  parent: string; spv: boolean; investorType: string; type: string; ig: boolean
  cls: string; agentCls: string
  region?: string; fundSleeve?: string
  sp: string; mdy: string; fitch: string
  lpSizeBil: string; lpSizeCriteria: string
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
  const [lpRatesLoaded, setLpRatesLoaded] = useState(false)
  const [facilityLPs, setFacilityLPs] = useState<LPRecord[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [wizardSteps, setWizardSteps] = useState<string[]>([])
  const [classCfg, setClassCfg] = useState<ClassificationConfig | null>(null)
  const [eligCfg, setEligCfg] = useState<EligibilityConfig | null>(null)

  const busaRates = useMemo(() => classCfg ? buildBusaRateFractions(classCfg) : {}, [classCfg])

  useEffect(() => {
    Promise.all([getWizardConfig(), getClassificationConfig(), getEligibilityConfig()])
      .then(([wizard, classification, eligibility]) => {
        setWizardSteps(wizard.WIZARD_STEPS)
        setClassCfg(classification)
        setEligCfg(eligibility)
      })
      .catch(e => setLoadError(String(e)))
  }, [])

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
        // Also index by LP Master name so buildOverride finds extracted data when raw names differ
        for (const mq of q) {
          if (mq.masterName && !map[mq.masterName.toLowerCase()]) {
            const byAgent = map[mq.agentName.toLowerCase()]
            if (byAgent) map[mq.masterName.toLowerCase()] = byAgent
          }
        }
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
    setLpRatesLoaded(false)
    if (activeSubmissionId != null && !submissionDetails) return
    api.lps.rates(submissionDetails?.periodMonth ?? undefined)
      .then(rates => {
        setLpRates(new Map(rates.map(r => [r.lpName.toLowerCase(), r])))
        setLpRatesLoaded(true)
      })
      .catch(e => {
        setLoadError(String(e))
        setLpRates(new Map())
        setLpRatesLoaded(false)
      })
  }, [activeSubmissionId, submissionDetails, submissionDetails?.periodMonth])

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
    const agentClsText = ext?.agentClass || lp.agentCls || ''
    if (!classCfg) {
      return {
        name: lp.name ?? lp._agentName ?? '',
        parent: lp.parent ?? '',
        spv: !!lp.spv,
        investorType: lp.investorType ?? '',
        type: lp.type ?? 'Institutional',
        ig: !!lp.ig,
        cls: '',
        agentCls: agentClsText,
        sp: toRating(ext?.sp, lp.sp),
        mdy: toRating(ext?.moodys, lp.mdy),
        fitch: toRating(ext?.fitch, lp.fitch),
        lpSizeBil: ext?.lpSizeBil || lp.aum || lp.nav || lp.pension || ext?.aum || ext?.nav || '',
        lpSizeCriteria: ext?.lpSizeCriteria || (lp.aum ? 'AUM' : lp.nav ? 'NAV' : lp.pension ? 'Assets' : ''),
        capCommit: ext?.commit || lp.capCommit || '',
        ucM: ext?.uncalled || lp.uc || '',
        ubsAdvRatePct: parsePct(lp.rate),
        agentRatePct,
        concLimitPct: parsePct(lp.ubsConc) || DEFAULT_CL_PCT,
        agentConcLimitPct: parsePct(ext?.agentConc || lp.agentConc),
        inc: false,
        notes: lp.notes ?? '',
        region: lp.region ?? '',
        fundSleeve: (lp as LPRecord).fundSleeve ?? ext?.fundSleeve ?? '',
      }
    }
    const isUbsCls = classCfg.UBS_CLS_OPTS.includes(lp.cls ?? '')
    const cls = isUbsCls
      ? (lp.cls as string)
      : (ubsClassFromAgentCls(classCfg, agentClsText) || ubsClassFromAgentRate(classCfg, agentRatePct))
    return {
      name:              lp.name ?? lp._agentName ?? '',
      parent:            lp.parent ?? '',
      spv:               !!lp.spv,
      investorType:      lp.investorType ?? '',
      type:              lp.type ?? 'Institutional',
      ig:                !!lp.ig,
      cls,
      agentCls:          agentClsText,
      sp:                toRating(ext?.sp,     lp.sp),
      mdy:               toRating(ext?.moodys, lp.mdy),
      fitch:             toRating(ext?.fitch,  lp.fitch),
      lpSizeBil:         ext?.lpSizeBil || lp.aum || lp.nav || lp.pension || ext?.aum || ext?.nav || '',
      lpSizeCriteria:    ext?.lpSizeCriteria || (lp.aum ? 'AUM' : lp.nav ? 'NAV' : lp.pension ? 'Assets' : ''),
      capCommit:         ext?.commit || lp.capCommit || '',
      ucM:               ext?.uncalled || lp.uc || '',
      ubsAdvRatePct:     rate ? rate.ubsAdvRatePct * 100
                              : (cls ? parsePct(classCfg.UBS_CLS_DEFAULT_RATE[cls]) : '') || parsePct(lp.rate),
      agentRatePct,
      concLimitPct:      rate ? rate.ubsConcLimitPct * 100
                              : parsePct(lp.ubsConc) || DEFAULT_CL_PCT,
      agentConcLimitPct: parsePct(ext?.agentConc || lp.agentConc),
      inc:               deriveInc(cls, lp._isNew, lp.inc),
      notes:             lp.notes ?? '',
      region:            lp.region ?? '',
      fundSleeve:        (lp as LPRecord).fundSleeve ?? ext?.fundSleeve ?? '',
    }
  }

  const [overrides, setOverrides] = useState<Record<string, Override>>({})

  type FlashCol = 'highQuality' | 'ubsIncluded' | 'ubsBBCalc'
  type FlashTracker = Record<string, Partial<Record<FlashCol, number>>>
  const [flashKeys, setFlashKeys] = useState<FlashTracker>({})

  type SaveStatus = 'saving' | 'saved' | 'error'
  const [saveState, setSaveState] = useState<Record<string, SaveStatus>>({})
  const savedTimers   = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  type ClassificationRow = LpClassificationRequest['rows'][number]
  const toRow = (key: string, ov: Override): ClassificationRow | null => {
    const lp   = submissionLPs.find(l => l._key === key)
    const name = ov.name || lp?.name || lp?._agentName || ''
    if (!name) return null
    return {
      name,
      originalName:      lp?.name || lp?._agentName || undefined,
      parent:            ov.parent || undefined,
      spv:               ov.spv,
      investorType:      ov.investorType || undefined,
      instVsHnw:         ov.type || undefined,
      type:              ov.type || undefined,
      region:            ov.region || undefined,
      ig:                ov.ig,
      cls:               ov.cls || undefined,
      agentCls:          ov.agentCls || undefined,
      sp:                ov.sp, mdy: ov.mdy, fitch: ov.fitch,
      aum:               ov.lpSizeCriteria === 'AUM' ? ov.lpSizeBil || undefined : undefined,
      nav:               ov.lpSizeCriteria === 'NAV' ? ov.lpSizeBil || undefined : undefined,
      pension:           ov.lpSizeCriteria === 'Assets' ? ov.lpSizeBil || undefined : undefined,
      capCommit:         ov.capCommit || undefined,
      uc:                ov.ucM || undefined,
      ubsAdvRatePct:     typeof ov.ubsAdvRatePct     === 'number' ? ov.ubsAdvRatePct     : undefined,
      agentRatePct:      typeof ov.agentRatePct      === 'number' ? ov.agentRatePct      : undefined,
      ubsConcLimitPct:   typeof ov.concLimitPct      === 'number' ? ov.concLimitPct      : undefined,
      agentConcLimitPct: typeof ov.agentConcLimitPct === 'number' ? ov.agentConcLimitPct : undefined,
      inc:               ov.inc,
      notes:             ov.notes ?? '',
    }
  }

  const saveRow = async (key: string, ov: Override, nextOverrides: Record<string, Override>) => {
    const facilityId = submissionDetails?.facilityId
    const row = toRow(key, ov)
    if (facilityId == null || !row) return
    if (!lpRatesLoaded || loadError) {
      toast('LP rates were not loaded from the database; save is disabled to avoid persisting UI defaults.')
      return
    }
    setSaveState(s => ({ ...s, [key]: 'saving' }))
    try {
      await api.lps.saveClassification({
        facilityId,
        effectiveDate: submissionDetails?.periodMonth ?? undefined,
        audit: true,
        rows: [row],
      })
      if (activeSubmissionId != null) {
        await api.submissions.saveShadowBbState(activeSubmissionId, nextOverrides)
      }
      setSaveState(s => ({ ...s, [key]: 'saved' }))
      clearTimeout(savedTimers.current[key])
      savedTimers.current[key] = setTimeout(() => {
        setSaveState(s => { const next = { ...s }; delete next[key]; return next })
      }, 2000)
    } catch (e) {
      setSaveState(s => ({ ...s, [key]: 'error' }))
      toast(`Save failed — ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }
  }

  useEffect(() => () => {
    Object.values(savedTimers.current).forEach(clearTimeout)
  }, [])

  const saveDraft = async (draft: Override) => {
    if (!selectedKey) return
    const key = selectedKey
    const old = overrides[key]
    const next = draft
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
    const nextOverrides = { ...overrides, [key]: next }
    setOverrides(nextOverrides)
    await saveRow(key, next, nextOverrides)
  }

  const ovToLP = (lp: SubmissionLP, ov: Override): LPRecord => ({
    ...(lp as LPRecord),
    name:        ov.name || lp.name || lp._agentName || '',
    parent:      ov.parent ?? '',
    spv:         ov.spv,
    investorType: ov.investorType ?? lp.investorType ?? '',
    type:        ov.type as LPRecord['type'],
    ig:          ov.ig,
    cls:         (ov.cls || 'Eligible') as LPRecord['cls'],
    clsTag:      lp.clsTag ?? '',
    agentCls:    ov.agentCls,
    region:      (ov.region || lp.region || '') as LPRecord['region'],
    fundSleeve:  ov.fundSleeve ?? lp.fundSleeve,
    sp:          ov.sp ?? '', mdy: ov.mdy ?? '', fitch: ov.fitch ?? '',
    aum:         ov.lpSizeCriteria === 'AUM' ? (ov.lpSizeBil || '') : (lp.aum ?? ''),
    nav:         ov.lpSizeCriteria === 'NAV' ? (ov.lpSizeBil || '') : (lp.nav ?? ''),
    pension:     lp.pension ?? '',
    pensionFunded: lp.pensionFunded ?? '',
    capCommit:   ov.capCommit ?? '',
    uc:          ov.ucM != null ? String(ov.ucM) : (lp.uc ?? ''),
    rate:        typeof ov.ubsAdvRatePct === 'number' ? `${ov.ubsAdvRatePct}%` : (lp.rate ?? ''),
    agentRate:   typeof ov.agentRatePct  === 'number' ? `${ov.agentRatePct}%`  : (lp.agentRate ?? ''),
    agentConc:   typeof ov.agentConcLimitPct === 'number' ? `${ov.agentConcLimitPct}%` : (lp.agentConc ?? ''),
    ubsConc:     typeof ov.concLimitPct === 'number' ? `${ov.concLimitPct}%` : (lp.ubsConc ?? ''),
    inc:         ov.inc,
    notes:       ov.notes ?? '',
    rcl:         lp.rcl ?? false,
    tf:          lp.tf ?? false,
    hq:          lp.hq ?? false,
    abb:         lp.abb ?? '', ubb: lp.ubb ?? '', delta: lp.delta ?? '', uec: lp.uec ?? '',
    pctCapCommit: lp.pctCapCommit ?? '', calledCap: lp.calledCap ?? '',
    pctUncalled: lp.pctUncalled ?? '', pctCalled: lp.pctCalled ?? '',
    agentExcessConc: lp.agentExcessConc, ubsExcessConc: lp.ubsExcessConc,
  })

  const lpToOv = (saved: LPRecord, prev: Override): Override => ({
    ...prev,
    name:              saved.name,
    parent:            saved.parent ?? '',
    spv:               saved.spv,
    investorType:      saved.investorType ?? '',
    type:              saved.type,
    ig:                saved.ig,
    cls:               saved.cls ?? '',
    agentCls:          saved.agentCls ?? '',
    region:            saved.region ?? '',
    fundSleeve:        saved.fundSleeve ?? '',
    sp:                saved.sp ?? '', mdy: saved.mdy ?? '', fitch: saved.fitch ?? '',
    lpSizeBil:         saved.aum || saved.nav || saved.pension || '',
    lpSizeCriteria:    saved.aum ? 'AUM' : saved.nav ? 'NAV' : saved.pension ? 'Assets' : prev.lpSizeCriteria || '',
    capCommit:         saved.capCommit ?? '',
    ucM:               saved.uc ?? prev.ucM,
    ubsAdvRatePct:     parsePct(saved.rate) !== '' ? parsePct(saved.rate) : prev.ubsAdvRatePct,
    agentRatePct:      parsePct(saved.agentRate) !== '' ? parsePct(saved.agentRate) : prev.agentRatePct,
    concLimitPct:      parsePct(saved.ubsConc) !== '' ? parsePct(saved.ubsConc) : prev.concLimitPct,
    agentConcLimitPct: parsePct(saved.agentConc) !== '' ? parsePct(saved.agentConc) : prev.agentConcLimitPct,
    inc:               saved.inc,
    notes:             saved.notes ?? '',
  })

  const savedOverridesApplied = useRef(false)

  useEffect(() => {
    if (savedOverridesApplied.current) return
    if (!classCfg || !eligCfg) return
    setOverrides(Object.fromEntries(submissionLPs.map(lp => [lp._key, buildOverride(lp)])))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionLPs, lpRates, classCfg, eligCfg])

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

  const newLPs       = submissionLPs.filter(lp => lp._isNew)
  const unclassified = submissionLPs.filter(lp => !overrides[lp._key]?.cls).length

  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false)
  const displayLPs = useMemo(() => {
    if (!unclassifiedOnly || unclassified === 0) return submissionLPs
    return submissionLPs
      .filter(lp => !overrides[lp._key]?.cls)
      .sort((a, b) => (a.name ?? a._agentName ?? '').localeCompare(b.name ?? b._agentName ?? ''))
  }, [submissionLPs, overrides, unclassifiedOnly, unclassified])

  const totalCommitM = useMemo(() =>
    Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.capCommit), 0)
  , [overrides])

  const totalUncalledM = useMemo(() =>
    Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.ucM), 0)
  , [overrides])

  const totalAgentBBCalc = useMemo(() =>
    Object.values(overrides).reduce((s, ov) => s + calcRow(ov, totalCommitM, totalUncalledM).agentBBCalc, 0)
  , [overrides, totalCommitM, totalUncalledM])

  const totalUbsBBCalc = useMemo(() =>
    Object.values(overrides).reduce((s, ov) => s + calcRow(ov, totalCommitM, totalUncalledM).ubsBBCalc, 0)
  , [overrides, totalCommitM, totalUncalledM])

  const rankByKey = useMemo(() => {
    const ranked = [...submissionLPs].sort((a, b) =>
      parseMoneyM(overrides[b._key]?.ucM) - parseMoneyM(overrides[a._key]?.ucM)
    )
    return Object.fromEntries(ranked.map((lp, i) => [lp._key, i + 1]))
  }, [submissionLPs, overrides])

  const sortColumns = useMemo(() => {
    const getOverride = (lp: SubmissionLP) => overrides[lp._key]
    const getComputed = (lp: SubmissionLP) => {
      const ov = getOverride(lp)
      return ov ? calcRow(ov, totalCommitM, totalUncalledM) : null
    }
    return [
      { key: 'rank', getValue: (lp: SubmissionLP) => rankByKey[lp._key] ?? '' },
      { key: 'name', getValue: (lp: SubmissionLP) => getOverride(lp)?.name || lp.name || lp._agentName || '' },
      { key: 'fundSleeve', getValue: (lp: SubmissionLP) => getOverride(lp)?.fundSleeve ?? '' },
      { key: 'parent', getValue: (lp: SubmissionLP) => getOverride(lp)?.parent ?? '' },
      { key: 'spv', getValue: (lp: SubmissionLP) => !!getOverride(lp)?.spv },
      { key: 'region', getValue: (lp: SubmissionLP) => getOverride(lp)?.region ?? lp.region ?? '' },
      { key: 'investorType', getValue: (lp: SubmissionLP) => getOverride(lp)?.investorType ?? lp.investorType ?? '' },
      { key: 'cls', getValue: (lp: SubmissionLP) => getOverride(lp)?.cls ?? '' },
      { key: 'type', getValue: (lp: SubmissionLP) => getOverride(lp)?.type ?? '' },
      { key: 'ig', getValue: (lp: SubmissionLP) => !!getOverride(lp)?.ig },
      { key: 'agentCls', getValue: (lp: SubmissionLP) => getOverride(lp)?.agentCls ?? '' },
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

  const { sort, sortedRows: sortedDisplayLPs, requestSort } = useSortableRows(displayLPs, sortColumns)
  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(sortedDisplayLPs)
  const { widths: bbWidths, onResizeStart: bbResizeStart, tableWidth: bbTableWidth } = useColumnResize('run-shadow-bb', SHADOW_BB_INITIAL_WIDTHS)

  // Deselect if the selected row leaves the current page or the BB result replaces the table.
  useEffect(() => {
    if (!selectedKey) return
    if (result || !pageItems.some(lp => lp._key === selectedKey)) setSelectedKey(null)
  }, [pageItems, selectedKey, result])

  useEffect(() => {
    if (selectedKey === null || sortedDisplayLPs.length === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      e.preventDefault()
      const idx = sortedDisplayLPs.findIndex(lp => lp._key === selectedKey)
      if (idx === -1) return
      const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1
      if (nextIdx < 0 || nextIdx >= sortedDisplayLPs.length) return
      setSelectedKey(sortedDisplayLPs[nextIdx]._key)
      const nextPage = Math.floor(nextIdx / pageSize) + 1
      if (nextPage !== page) setPage(nextPage)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [sortedDisplayLPs, selectedKey, page, pageSize, setPage])

  const run = async () => {
    if (!lpRatesLoaded || loadError) {
      toast('LP rates were not loaded from the database; Shadow BB run is disabled to avoid using UI defaults.')
      return
    }
    setRunning(true)
    setLoadError(null)
    if (unclassified > 0) toast(`${unclassified} unclassified LP${unclassified !== 1 ? 's' : ''} will be treated as Excluded`, 4000, 'warning')
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
      const agentConc = typeof ov.agentConcLimitPct === 'number' ? `${ov.agentConcLimitPct}%` : (lp.agentConc ?? '')
      const sizeAum = ov.lpSizeCriteria === 'AUM' ? ov.lpSizeBil : ''
      const sizeNav = ov.lpSizeCriteria === 'NAV' ? ov.lpSizeBil : ''
      const sizeAssets = ov.lpSizeCriteria === 'Assets' ? ov.lpSizeBil : ''
      return {
        ...lp,
        name: ov.name || lp.name || lp._agentName,
        parent: ov.parent, spv: ov.spv, investorType: ov.investorType, region: (ov.region || lp.region || '') as LPRecord['region'], type: ov.type as LPRecord['type'], ig: ov.ig,
        cls: ov.cls || 'Excluded', agentCls: ov.agentCls,
        sp: ov.sp ?? '', mdy: ov.mdy ?? '', fitch: ov.fitch ?? '',
        aum: sizeAum, nav: sizeNav, pension: sizeAssets, pensionFunded: '',
        capCommit: ov.capCommit, rate, agentRate, ucM, uc: `$${ucM.toFixed(1)}M`,
        agentConc, ubsConc: fmtM(concLimitM),
        agentExcessConc: fmtM(c.agentExcess), ubsExcessConc: fmtM(c.ubsExcess),
        abb: fmtM(c.agentBBCalc), ubb: fmtM(c.ubsBBCalc),
        concLimitM, inc: ov.inc ?? false, notes: ov.notes,
      }
    })

    const computed = computePortfolioBB(overriddenLPs as LPRecord[], bbParams, busaRates)
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
            investorType:    lp.investorType ?? null,
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
    { label: 'UBS Borrowing Base',    value: fmtFull(result.summary.totalUBB),        hi: true },
    { label: 'Agent Borrowing Base',  value: fmtFull(result.summary.totalABB)                   },
    { label: 'BB Delta',              value: fmtFull(result.summary.bbDelta),          neg: result.summary.bbDelta < 0 },
    { label: 'Included LPs',         value: result.summary.includedCount,                         right: true },
    { label: 'UBS Advance Rate',      value: fmtPct(result.summary.ear)                         },
    { label: 'Agent Advance Rate',    value: fmtPct(result.summary.agentEar)                    },
    { label: 'EAR Delta',             value: fmtPct(result.summary.earDelta),         neg: result.summary.earDelta < 0 },
    { label: 'Excluded LPs',         value: result.summary.excludedCount,                         right: true },
    { label: 'UBS Elig. Uncalled',   value: fmtFull(result.summary.totalUEC)                     },
    { label: 'Conc. Excess (total)', value: fmtFull(result.summary.totalConcExcess),  neg: result.summary.totalConcExcess > 0 },
    { label: 'Reclassified LPs',     value: result.summary.reclassCount,                          right: true },
  ] : []

  const selectedLp = submissionLPs.find(lp => lp._key === selectedKey) ?? null

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))' }}>
      {loadError && <div style={{ padding: '10px 16px', background: '#fff0f0', color: 'var(--danger)', fontSize: 12 }}>API error — {loadError}</div>}
      <StepBar steps={wizardSteps} current={4} />
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
                <Button variant="danger" size="sm" onClick={() => setAbortOpen(true)} disabled={running}>Abort Submission</Button>
                <Button size="sm" onClick={run} disabled={running || !lpRatesLoaded || loadError != null || unclassified > 0} title={unclassified > 0 ? `Resolve ${unclassified} unclassified LP${unclassified !== 1 ? 's' : ''} before running` : undefined}>{running ? 'Calculating…' : 'Run Shadow BB'}</Button>
              </div>
            }
          >
            {/* Spreadsheet-order table + fixed overlay card. Opening a row never changes table width. */}
            <div style={{ position: 'relative', padding: '4px 18px 0' }}>

              <div style={{ minWidth: 0 }}>
                <div className="data-table-wrap">
                  <table className="data-table dense" style={{ tableLayout: 'fixed', width: bbTableWidth, minWidth: bbTableWidth }}>
                    <ShadowBBTableHead sort={sort} onSort={requestSort} widths={bbWidths} onResizeStart={bbResizeStart} />
                    <tbody>
                      {pageItems.map(lp => {
                        const key      = lp._key
                        const ov       = overrides[key] ?? {} as Override
                        const missing  = !ov.cls
                        const selected = key === selectedKey
                        const c = calcRow(ov, totalCommitM, totalUncalledM)
                        const n = ov.name || lp.name || lp._agentName || '—'
                        return (
                          <tr key={key} className={selected ? 'data-table-row-selected' : undefined} onClick={() => setSelectedKey(key)}
                            style={{ cursor: 'pointer',
                              background: !selected && missing ? 'color-mix(in srgb, var(--danger) 6%, transparent)' : undefined }}>
                            <td>{rankByKey[key] ?? '—'}</td>
                            <td title={n}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                                <span style={{ fontWeight: selected ? 700 : 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                                {lp._isNew && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--red)', color: '#fff', borderRadius: 2, padding: '1px 4px', letterSpacing: '0.04em', flexShrink: 0 }}>NEW</span>}
                                {saveState[key] === 'saving' && <span style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>Saving…</span>}
                                {saveState[key] === 'saved'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>Saved</span>}
                                {saveState[key] === 'error'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--danger)', flexShrink: 0 }}>Error</span>}
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
                            <td className="num" title={ov.lpSizeBil || '—'}>{fmtBillionDisplay(ov.lpSizeBil)}</td>
                            <td>{ov.lpSizeCriteria || '—'}</td>
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
                            <td key={`ubb-${key}-${flashKeys[key]?.ubsBBCalc ?? 0}`} className={`num ${c.ubsBBCalc === 0 ? 'zero' : ''} ${flashKeys[key]?.ubsBBCalc ? 'cell-flash' : ''}`}>{fmtFull(c.ubsBBCalc)}</td>
                            <td className="num">{totalUbsBBCalc > 0 && c.ubsBBCalc > 0 ? fmtPct(c.ubsBBCalc / totalUbsBBCalc) : '—'}</td>
                            <td title={ov.notes || '—'}>{ov.notes || '—'}</td>
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

              {selectedLp && selectedKey && overrides[selectedKey] && (
                <DraggablePanel className="lp-detail-overlay" storageKey="run-shadow-bb-lp-record">
                  <LPRecordPanel
                    lp={ovToLP(selectedLp, overrides[selectedKey])}
                    open={true}
                    rank={rankByKey[selectedKey]}
                    running={running || !lpRatesLoaded || loadError != null}
                    canEdit={!running && lpRatesLoaded && loadError == null}
                    onClose={() => setSelectedKey(null)}
                    onSave={saved => saveDraft(lpToOv(saved, overrides[selectedKey]))}
                    totalAgentBB={totalAgentBBCalc}
                    totalUbsBB={totalUbsBBCalc}
                  />
                </DraggablePanel>
              )}
            </div>
          </Card>
        )}

        {result && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Tag variant="active" style={{ fontSize: 12, padding: '5px 10px' }}>✓ Calculation complete</Tag><Button onClick={() => { setTargetFacility(submissionDetails?.facilityName ?? activeSubmission ?? null); navigate('shadow-bb') }}>View BB Results</Button><Button variant="secondary" onClick={() => navigate('upload')}>Upload Another Submission</Button></div>}

        {result && (
          <Card title="Calculation Results" subtitle={`${submissionLPs.length} LP records processed`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 24px', padding: '4px 18px 18px' }}>
              {resultRows.map(r => (
                <div key={r.label} style={(r as { right?: boolean }).right ? { gridColumn: 4 } : undefined}><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{r.label}</div><div style={{ fontSize: 13, fontWeight: (r as { hi?: boolean }).hi ? 700 : 600, color: (r as { neg?: boolean }).neg ? 'var(--danger)' : (r as { hi?: boolean }).hi ? 'var(--navy)' : 'var(--text)' }}>{String(r.value)}</div></div>
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
// Layout and section structure match the LP Master and Shadow BB detail panels.
export function LPRecordCard({ lp, ov, rank, totalCommitM, totalUncalledM, onSave, onDeselect, running, saveStatus }: {
  lp: SubmissionLP
  ov: Override
  rank?: number
  totalCommitM: number
  totalUncalledM: number
  onSave: (draft: Override) => Promise<void>
  onDeselect?: () => void
  running: boolean
  saveStatus?: 'saving' | 'saved' | 'error'
}) {
  const [draft, setDraft] = useState<Override>(ov)
  const [saving, setSaving] = useState(false)
  const [classCfg, setClassCfg] = useState<ClassificationConfig | null>(null)
  const [eligCfg, setEligCfg] = useState<EligibilityConfig | null>(null)

  useEffect(() => {
    setDraft(ov)
  }, [ov])

  useEffect(() => {
    Promise.all([getClassificationConfig(), getEligibilityConfig()])
      .then(([classification, eligibility]) => {
        setClassCfg(classification)
        setEligCfg(eligibility)
      })
      .catch(() => {})
  }, [])

  const calc = useMemo(() => calcRow(draft, totalCommitM, totalUncalledM), [draft, totalCommitM, totalUncalledM])
  const name = draft.name || lp.name || lp._agentName || '—'
  const dirty = JSON.stringify(draft) !== JSON.stringify(ov)

  if (!classCfg || !eligCfg) {
    return <div style={{ padding: 16, color: 'var(--muted)', fontSize: 12 }}>Loading LP configuration...</div>
  }

  const inputSt: React.CSSProperties = { width: '100%', fontSize: 12, padding: '3px 6px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--card)' }
  const roSt:    React.CSSProperties = { ...inputSt, background: 'var(--tbl)', color: 'var(--muted)' }
  const COLS: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '8px 16px', padding: '12px 16px' }
  const notesMax = 250
  const agentRateScheduleValues = eligCfg.AGENT_TIERS.map(({ cls }) => cls)
  const agentClsOptions = draft.agentCls && !agentRateScheduleValues.includes(draft.agentCls)
    ? ['', draft.agentCls, ...agentRateScheduleValues]
    : ['', ...agentRateScheduleValues]

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
    <div key={key} style={typeof span === 'number' ? { gridColumn: `span ${span}` } : span ? { gridColumn: '1 / -1' } : { gridColumn: 'span 3' }}>{children}</div>
  )

  const ro = (label: string, value: React.ReactNode, span2: boolean | number = false, formula?: string, width?: number) =>
    wrap(span2, <>
      {flbl(label, true)}
      <input type="text" value={String(value ?? '—')} style={{ ...roSt, width: width ?? roSt.width }} readOnly />
      {formula && fcaption(formula)}
    </>, label)

  const change = (field: keyof Override, value: unknown) => {
    setDraft(prev => {
      const nextValue = field === 'notes' && typeof value === 'string' ? value.slice(0, notesMax) : value
      const next = { ...prev, [field]: nextValue } as Override
      if (field === 'cls') {
        next.ubsAdvRatePct = parsePct(classCfg.UBS_CLS_DEFAULT_RATE[value as string])
      }
      if (field === 'agentCls') {
        const tier = eligCfg.AGENT_TIERS.find(t => t.cls === value)
        if (tier) next.agentRatePct = tier.rate
      }
      return next
    })
  }

  const commit = async () => {
    setSaving(true)
    try {
      await onSave(draft)
      onDeselect?.()
    } finally {
      setSaving(false)
    }
  }

  const txt = (label: string, field: keyof Override, span2: boolean | number = false) =>
    wrap(span2, <>{flbl(label)}<input type="text" value={String(draft[field] ?? '')} disabled={running || saving} style={inputSt} onChange={e => change(field, e.target.value)} /></>, label)

  const amountTxt = (label: string, field: keyof Override, span2: boolean | number = false) =>
    wrap(span2, <>{flbl(label)}<input type="text" value={fmtMoneyInput(String(draft[field] ?? ''))} disabled={running || saving} style={inputSt} onChange={e => change(field, e.target.value)} /></>, label)

  const billionTxt = (label: string, field: keyof Override, span2: boolean | number = false) =>
    wrap(span2, <>{flbl(label)}<input type="text" value={fmtBillionDisplay(String(draft[field] ?? '')) === '—' ? '' : fmtBillionDisplay(String(draft[field] ?? ''))} disabled={running || saving} style={inputSt} onChange={e => change(field, e.target.value)} /></>, label)

  const sel = (label: string, field: keyof Override, opts: readonly string[], span2: boolean | number = false) =>
    wrap(span2, <>{flbl(label)}<select value={String(draft[field] ?? '')} disabled={running || saving} style={inputSt} onChange={e => change(field, e.target.value)}>{opts.map(o => <option key={o || '__empty'} value={o}>{o || '—'}</option>)}</select></>, label)

  const chk = (label: string, field: keyof Override, span: boolean | number = false, accent = false) =>
    wrap(span, <div style={accent ? { border: '1px dotted var(--green)', background: 'var(--green-lt)', borderRadius: 4, padding: '6px 8px' } : undefined}>{flbl(label)}<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer', minHeight: 24 }}><input type="checkbox" checked={!!draft[field]} disabled={running || saving} onChange={e => change(field, e.target.checked)} /> Yes</label></div>, label)

  const pctInput = (label: string, field: keyof Override, step = 5) =>
    wrap(false, <>{flbl(label)}
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <input type="number" value={draft[field] === '' || draft[field] == null ? '' : Number(draft[field])} disabled={running || saving}
        min={0} max={100} step={step} style={{ ...inputSt, textAlign: 'left' }}
        onChange={e => change(field, e.target.value === '' ? '' : parseFloat(e.target.value))} />
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>%</span>
    </div>
    </>, label)

  return (
    <div style={{ height: '100%', border: '1px solid var(--border)', borderRadius: 0, overflow: 'hidden', boxShadow: '-6px 0 24px rgba(0,0,0,.12)', display: 'flex', flexDirection: 'column', background: 'var(--card)' }}>
      <div className="lp-detail-hdr" style={{ background: 'var(--navy)', color: '#fff', padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
            <div className="lp-detail-name" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</div>
            {lp._isNew && <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(255,255,255,.2)', borderRadius: 3, padding: '2px 6px', flexShrink: 0 }}>NEW</span>}
          </div>
          {onDeselect && <button onClick={onDeselect} aria-label="Close" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1, opacity: .7, padding: 0, flexShrink: 0 }}>×</button>}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: .92 }}>
          {draft.cls && <Tag>{draft.cls}</Tag>}
          <span style={{ fontSize: 11, opacity: .8 }}>{pctStr(draft.ubsAdvRatePct)} UBS · {pctStr(draft.agentRatePct)} Agent</span>
          {saveStatus === 'saving' && <span style={{ fontSize: 10 }}>Saving...</span>}
          {saveStatus === 'saved'  && <span style={{ fontSize: 10, fontWeight: 700, color: '#9be8b6' }}>Saved</span>}
          {saveStatus === 'error'  && <span style={{ fontSize: 10, fontWeight: 700, color: '#ff9b9b' }}>Failed</span>}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={COLS}>
          {sec('Identification & Classification')}
          {ro('Rank', rank ?? '—', 1, 'Ordinal rank by uncalled capital', 64)}
          {txt('Investor Name', 'name', 5)}
          {chk('SPV?', 'spv', 1)}
          {txt('Parent', 'parent', 5)}
          {sel('Agent LP Classification', 'agentCls', agentClsOptions)}
          {sel('UBS LP Classification', 'cls', classCfg.UBS_CLS_OPTS)}
          {sel('Institutional vs HNW', 'type', ['', ...classCfg.TYPE_OPTS])}
          {chk('Investment Grade?', 'ig')}
          
          {sec('Credit Ratings')}
          {sel('S&P', 'sp', classCfg.SP_RATING_OPTS, 2)}
          {sel("Moody's", 'mdy', classCfg.MDY_RATING_OPTS, 2)}
          {sel('Fitch', 'fitch', classCfg.FITCH_RATING_OPTS, 2)}

          {sec('Capital Metrics')}
          {billionTxt('LP Size ($ Bil)', 'lpSizeBil')}
          {sel('LP Size Criteria', 'lpSizeCriteria', classCfg.LP_SIZE_CRITERIA_OPTS)}
          {amountTxt('Capital Commitment', 'capCommit')}
          {amountTxt('Uncalled Capital', 'ucM')}
          {ro('% of Capital Commitments', fmtPct(calc.cmtPct), false, 'LP commitment ÷ total fund commitments')}
          {ro('Called Capital',           fmtFull(calc.calledM),  false, 'Capital Commitments − Uncalled Capital')}
          {ro('% of Uncalled Capital', fmtPct(calc.pctUncalled), false, 'LP uncalled ÷ total fund uncalled')}
          {ro('% of LP Called',        fmtPct(calc.pctCalled),   false, 'Called Capital ÷ Capital Commitments')}

          {sec('Borrowing Base Calculation')}
          {pctInput('Agent Advance Rate', 'agentRatePct', 5)}
          {pctInput('UBS Advance Rate', 'ubsAdvRatePct', 5)}
          {pctInput('Agent Concentration Limit', 'agentConcLimitPct', 0.5)}
          {pctInput('UBS Concentration Limit', 'concLimitPct', 0.5)}
          {ro('Agent Excess Concentration', fmtFull(calc.agentExcess), false, 'Uncalled above Agent concentration limit')}
          {ro('UBS Excess Concentration', fmtFull(calc.ubsExcess), false, 'Uncalled above UBS concentration limit')}
          {ro('Agent Borrowing Base', fmtFull(calc.agentBBCalc), false, 'Uncalled Capital × Agent Advance Rate, capped by Agent concentration')}
          {ro('UBS Borrowing Base', fmtFull(calc.ubsBBCalc), false, 'Uncalled Capital × UBS Advance Rate, capped by UBS concentration')}
          {chk('Included in BB?', 'inc', true, true)}

          {sec('Additional Details')}
          {wrap(true, <>
            {flbl('Notes')}
            <textarea value={draft.notes ?? ''} disabled={running || saving} style={{ ...inputSt, height: 56, resize: 'vertical' }} onChange={e => change('notes', e.target.value)} maxLength={notesMax} />
            <div style={{ marginTop: 3, textAlign: 'right', fontSize: 10, color: 'var(--muted)' }}>{String(draft.notes ?? '').length}/{notesMax}</div>
          </>, 'notes')}
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#fff' }}>
        <Button variant="secondary" onClick={onDeselect} disabled={saving}>Cancel</Button>
        <Button onClick={commit} disabled={running || saving || !dirty}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  )
}
