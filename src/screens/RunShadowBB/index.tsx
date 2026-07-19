import { useState, useMemo, useEffect, useRef } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { SortableHeader, useSortableRows, type SortSpec } from '../../hooks/useTableSort'
import { useColumnResize, type ColWidths } from '../../hooks/useColumnResize'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import OwnershipBanner, { useCanEditSubmission } from '../../components/ui/OwnershipBanner'
import StepBar from '../../components/ui/StepBar'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Tag from '../../components/ui/Tag'
import Modal from '../../components/ui/Modal'
import DraggablePanel from '../../components/ui/DraggablePanel'
import RegionTypeahead from '../../components/ui/RegionTypeahead'
import { formatRegion } from '../../config/regionReference'
import { lpSizeFormat } from '../../utils/lpSize'
import {
  busaClassificationOptions,
  clsConcLimitPctForCls,
  resolveBbCriteria,
  ubsClassFromAgentCls,
  ubsClassFromAgentRate,
} from '../../services/configService'
import { useConfigCache } from '../../store/configStore'
import { fmtM, fmtPct } from '../../services/bbCalculationService'
import { getMatchQueue } from '../../services/matchingService'
import { api } from '../../services/api'
import type { LPRecord } from '../../services/lpService'
import type { Submission, AgentExtractedRow, LpRate, CommitLpRow, LpClassificationRequest } from '../../services/api'
import type { BBBreach, BBResult } from '../../types/bb'
import { formatPercentageText, formatPercentageValue } from '../../utils/percentage'

const DEFAULT_CL_PCT = 7.5
export const SHADOW_BB_TABLE_WIDTH = 3993

export const SHADOW_BB_INITIAL_WIDTHS: ColWidths = {
  name: 220, parent: 160, spv: 54,
  region: 140, investorType: 140, instVsHnw: 152, agentCls: 196, cls: 204,
  included: 72, ig: 114, sp: 76, mdy: 84, fitch: 76,
  lpSizeBil: 184, lpSizeCriteria: 107, capCommit: 138, cmtPct: 157,
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
        <SortableHeader sortKey="name"              sort={sort} onSort={onSort} style={{ width: w('name') }}                          onResizeStart={onResizeStart}>Investor Name</SortableHeader>
        <SortableHeader sortKey="parent"            sort={sort} onSort={onSort} style={{ width: w('parent') }}                        onResizeStart={onResizeStart}>Parent</SortableHeader>
        <SortableHeader sortKey="spv"               sort={sort} onSort={onSort} style={{ width: w('spv') }}                           onResizeStart={onResizeStart}>SPV</SortableHeader>
        <SortableHeader sortKey="region"            sort={sort} onSort={onSort} style={{ width: w('region') }}                        onResizeStart={onResizeStart}>Region / Location</SortableHeader>
        <SortableHeader sortKey="investorType"      sort={sort} onSort={onSort} style={{ width: w('investorType') }}                  onResizeStart={onResizeStart}>Investor Type</SortableHeader>
        <SortableHeader sortKey="instVsHnw"         sort={sort} onSort={onSort} style={{ width: w('instVsHnw') }}                     onResizeStart={onResizeStart}>Institutional vs HNW</SortableHeader>
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
  const n = parseFloat(String(str).replace('%', ''))
  return Number.isFinite(n) ? n : ''
}

export function isRunShadowBbDisabled(
  running: boolean,
  lpRatesLoaded: boolean,
  hasLoadError: boolean,
  canEdit: boolean,
): boolean {
  return running || !lpRatesLoaded || hasLoadError || !canEdit
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

function deriveAgentLpClassification(input: {
  investorType?: string
  sp?: string
  mdy?: string
  fitch?: string
  notes?: string
  spv?: boolean
}): string {
  const type = String(input.investorType ?? '').trim().toLowerCase()
  const notes = String(input.notes ?? '').trim().toLowerCase()
  if (input.spv || /\b(sanction|bad actor|kyc|erisa|side letter|non[-\s]?cooperative|ineligible|excluded|gp sleeve|sponsor affiliate|affiliate)\b/.test(`${type} ${notes}`)) {
    return 'Ineligible Investor'
  }
  if (hasInvestmentGradeRating(input.sp, input.mdy, input.fitch)) return 'Rated Included'
  if (/(family office|hnw|high net worth)/.test(type)) return 'Ineligible Investor'
  if (/(institutional|endowment|foundation|insurance|sovereign|pension|corporate|healthcare|fund of funds|fof|investment consultant|hedge fund)/.test(type)) {
    return 'Non-Rated Included'
  }
  return ''
}

function hasInvestmentGradeRating(sp?: string, mdy?: string, fitch?: string): boolean {
  const spIg = new Set(['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-'])
  const mdyIg = new Set(['AAA', 'AA1', 'AA2', 'AA3', 'A1', 'A2', 'A3', 'BAA1', 'BAA2', 'BAA3'])
  const norm = (value?: string) => String(value ?? '').trim().toUpperCase()
  return spIg.has(norm(sp)) || spIg.has(norm(fitch)) || mdyIg.has(norm(mdy))
}

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

export const pctStr = (v: number | '' | undefined) => (typeof v === 'number' ? formatPercentageValue(v) : '—')

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
  parent: string; spv: boolean; investorType: string; instVsHnw: string; ig: boolean
  cls: string; agentCls: string; agentClsSource?: string
  region?: string; fundSleeve?: string
  sp: string; mdy: string; fitch: string
  lpSizeBil: string; lpSizeCriteria: string
  capCommit: string; ucM: string
  ubsAdvRatePct: number | ''; agentRatePct: number | ''
  concLimitPct: number | ''; agentConcLimitPct: number | ''
  inc: boolean; notes: string
}

// Counts LPs whose UBS LP Classification was auto-populated on this screen:
// "derived" when the stored record carried no valid UBS class (agent-map /
// investor-profile / agent-rate fallback chain), "upgraded" when LP Master
// data lifted a stored class to a higher tier (upgradeClsFromLpMasterData).
export function countAutoPopulatedCls(
  lps: Array<{ _key: string; cls?: string }>,
  overrides: Record<string, { cls?: string } | undefined>,
  ubsClsOpts: string[],
): { derived: number; upgraded: number } {
  let derived = 0, upgraded = 0
  for (const lp of lps) {
    const kind = getAutoPopulatedClsKind(lp, overrides[lp._key], ubsClsOpts)
    if (kind === 'upgraded') upgraded++
    else if (kind === 'derived') derived++
  }
  return { derived, upgraded }
}

export function getAutoPopulatedClsKind(
  lp: { cls?: string },
  override: { cls?: string } | undefined,
  ubsClsOpts: string[],
): 'derived' | 'upgraded' | '' {
  const cls = override?.cls
  if (!cls) return ''
  const stored = lp.cls ?? ''
  if (cls === stored) return ''
  return stored && ubsClsOpts.includes(stored) ? 'upgraded' : 'derived'
}

// Builds the concentration-alert view model from the server run response's breach list
// (evaluated against the Concentration Limits config on every run). Breaches demand
// resolution before the BB certificate goes to the agent; warnings only need monitoring.
export function buildBreachAlerts(breaches: BBBreach[]) {
  const hardBreaches = breaches.filter(b => b.severity === 'breach')
  const warnings     = breaches.filter(b => b.severity === 'warning')
  return {
    hardBreaches,
    warnings,
    breachHeader: hardBreaches.length > 0
      ? `⚠ ${hardBreaches.length} concentration ${hardBreaches.length === 1 ? 'breach' : 'breaches'} — must resolve before submitting BB certificate to agent`
      : null,
    warningHeader: warnings.length > 0
      ? `⚠ ${warnings.length} concentration ${warnings.length === 1 ? 'warning' : 'warnings'} — approaching limit, monitor closely`
      : null,
    primaryButtonLabel: hardBreaches.length > 0 ? 'Review Breaches in BB Results' : 'View BB Results',
  }
}

export default function RunShadowBB() {
  const { toast, navigate, activeSubmission, activeSubmissionId, abortSubmission, setTargetFacility } = useApp()
  const { can } = useAuth()
  const [matchQueue, setMatchQueue] = useState<Awaited<ReturnType<typeof getMatchQueue>>>([])
  const [running, setRunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [result, setResult] = useState<BBResult | null>(null)
  // Concentration breaches from the server run response — the engine checks them against the
  // Concentration Limits config on every run, so this is the authoritative list, not the local mirror.
  const [runBreaches, setRunBreaches] = useState<BBBreach[]>([])
  const [summaryHidden, setSummaryHidden] = useState(false)
  const [abortOpen, setAbortOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submissionDetails, setSubmissionDetails] = useState<Submission | null>(null)
  // A non-owner analyst is read-only until they take the submission over (concurrency guard).
  const canEdit = useCanEditSubmission(submissionDetails)
  const reloadSubmission = () => {
    if (activeSubmissionId != null) api.submissions.get(activeSubmissionId).then(setSubmissionDetails).catch(() => {})
  }
  // Announce read-only once when landing on a submission owned by someone else, so the state is
  // obvious even if the banner is scrolled off. Re-announces if ownership changes (e.g. taken back).
  const readOnlyToasted = useRef(false)
  useEffect(() => {
    if (submissionDetails && !canEdit && !readOnlyToasted.current) {
      readOnlyToasted.current = true
      toast(`Read-only — this submission is owned by ${submissionDetails.ownerName ?? 'another analyst'}. Take it over to edit.`, 4500, 'warning')
    }
    if (canEdit) readOnlyToasted.current = false
  }, [submissionDetails, canEdit, toast])
  const [extractedMap, setExtractedMap] = useState<Record<string, AgentExtractedRow>>({})
  const [lpRates, setLpRates] = useState<Map<string, LpRate>>(new Map())
  const [lpRatesLoaded, setLpRatesLoaded] = useState(false)
  const [facilityLPs, setFacilityLPs] = useState<LPRecord[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const configCache = useConfigCache()
  const wizardSteps = configCache.wizard?.WIZARD_STEPS ?? []
  const classCfg = configCache.classification
  const eligCfg = configCache.eligibility

  useEffect(() => {
    if (configCache.status === 'failed' && configCache.error) setLoadError(configCache.error)
  }, [configCache.error, configCache.status])

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
    api.lpRecords.list({ facilityId })
      .then(setFacilityLPs)
      .catch(() => {})
  }, [submissionDetails?.facilityId])

  useEffect(() => {
    setLpRatesLoaded(false)
    if (activeSubmissionId != null && !submissionDetails) return
    api.lpRecords.rates(submissionDetails?.periodMonth ?? undefined)
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
    return facilityLPs.map((LPRecord, index) => ({
      ...LPRecord,
      _key: LPRecord.id != null ? `LPRecord-${LPRecord.id}` : `LPRecord-${index}-${LPRecord.name ?? ''}`,
      _isNew: false,
      _agentName: LPRecord.name,
    }))
  }, [facilityLPs])

  const buildOverride = (LPRecord: SubmissionLP): Override => {
    const ext  = extractedMap[(LPRecord._agentName || LPRecord.name || '').toLowerCase()]
    const rate = lpRates.get((LPRecord.name || '').toLowerCase())
               ?? lpRates.get((LPRecord._agentName || '').toLowerCase())
    const toRating = (extracted: string | undefined, master: string | undefined) => {
      const v = extracted || master || ''
      return v !== 'NR' ? v : ''
    }
    const investorTypeText = ext?.investorType || LPRecord.investorType || ''
    const spText = toRating(ext?.sp, LPRecord.sp)
    const mdyText = toRating(ext?.moodys, LPRecord.mdy)
    const fitchText = toRating(ext?.fitch, LPRecord.fitch)
    const rawAgentClsText = ext?.agentClass || LPRecord.agentCls || ''
    const derivedAgentClsText = rawAgentClsText ? '' : deriveAgentLpClassification({
      investorType: investorTypeText,
      sp: spText,
      mdy: mdyText,
      fitch: fitchText,
      notes: LPRecord.notes ?? '',
      spv: !!LPRecord.spv,
    })
    const agentClsText = rawAgentClsText || derivedAgentClsText
    const agentMappedUbsCls = classCfg ? ubsClassFromAgentCls(classCfg, agentClsText) : ''
    const agentRateFromCls = eligCfg?.AGENT_TIERS.find(t => t.cls === agentClsText)?.rate ?? ''
    const agentConcFromCls = clsConcLimitPctForCls(eligCfg, agentMappedUbsCls)
    const extractedAgentRatePct = parsePct(ext?.agentRate || LPRecord.agentRate)
    const extractedAgentConcPct = parsePct(ext?.agentConc || LPRecord.agentConc)
    const agentRatePct = extractedAgentRatePct !== '' ? extractedAgentRatePct : agentRateFromCls
    const agentConcLimitPct = extractedAgentConcPct !== '' ? extractedAgentConcPct : agentConcFromCls
    const agentClsSource = ext?.agentClass
      ? (ext.agentClsSource || 'EXTRACTED')
      : LPRecord.agentCls
        ? (LPRecord.agentClsSource || 'EXTRACTED')
        : derivedAgentClsText
          ? 'DERIVED'
          : undefined
    if (!classCfg) {
      return {
        name: LPRecord.name ?? LPRecord._agentName ?? '',
        parent: LPRecord.parent ?? '',
        spv: !!LPRecord.spv,
        investorType: investorTypeText,
        instVsHnw: LPRecord.instVsHnw ?? 'Institutional',
        ig: !!LPRecord.ig,
        cls: '',
        agentCls: agentClsText,
        agentClsSource,
        sp: spText,
        mdy: mdyText,
        fitch: fitchText,
        lpSizeBil: ext?.lpSizeBil || LPRecord.aum || LPRecord.nav || LPRecord.pension || ext?.aum || ext?.nav || '',
        lpSizeCriteria: ext?.lpSizeCriteria || (LPRecord.aum ? 'AUM' : LPRecord.nav ? 'NAV' : LPRecord.pension ? 'Assets' : ''),
        capCommit: ext?.commit || LPRecord.capCommit || '',
        ucM: ext?.uncalled || LPRecord.uc || '',
        ubsAdvRatePct: parsePct(LPRecord.rate),
        agentRatePct,
        concLimitPct: parsePct(LPRecord.ubsConc) || DEFAULT_CL_PCT,
        agentConcLimitPct,
        inc: false,
        notes: LPRecord.notes ?? '',
        region: LPRecord.region ?? '',
        fundSleeve: (LPRecord as LPRecord).fundSleeve ?? ext?.fundSleeve ?? '',
      }
    }
    const isUbsCls = Object.prototype.hasOwnProperty.call(classCfg.BUSA_RATE_MAP, LPRecord.cls ?? '')
    const baseCls = isUbsCls
      ? (LPRecord.cls as string)
      : (
          ubsClassFromAgentCls(classCfg, agentClsText)
          || ubsClassFromAgentRate(classCfg, agentRatePct)
        )
    // LP Master upgrade rules: an investment-grade agency rating lifts the LP to
    // Rated, and a qualifying AUM to Unrated >2bn / Unrated 1–2bn — but only when
    // that strictly improves the BUSA rate. Excluded LPs are never upgraded.
    const cls = baseCls
    // Borrowing Base Criteria matrix is the sole source of the suggested UBS advance rate /
    // concentration limit — funded-split and rating-band aware (mirrors the API's BbCriteriaResolver).
    // No legacy flat-map fallback: a class the matrix does not carry keeps the LP's stored value.
    // Funded fraction = called ÷ commitment, with called = commitment − uncalled.
    const commitFundedM = parseMoneyM(ext?.commit || LPRecord.capCommit)
    const uncalledFundedM = parseMoneyM(ext?.uncalled || LPRecord.uc)
    const pctFunded = commitFundedM > 0 ? Math.max(0, commitFundedM - uncalledFundedM) / commitFundedM : 0
    const criteria = cls
      ? resolveBbCriteria(eligCfg?.BB_CRITERIA_MATRIX, cls, { sp: spText, mdy: mdyText, fitch: fitchText }, pctFunded)
      : null
    const clsDefaultRatePct = criteria ? criteria.advanceRatePct : ''
    const clsDefaultConcPct = criteria ? criteria.concLimitPct : ''
    return {
      name:              LPRecord.name ?? LPRecord._agentName ?? '',
      parent:            LPRecord.parent ?? '',
      spv:               !!LPRecord.spv,
      investorType:      investorTypeText,
      instVsHnw:         LPRecord.instVsHnw ?? 'Institutional',
      ig:                !!LPRecord.ig,
      cls,
      agentCls:          agentClsText,
      agentClsSource,
      sp:                spText,
      mdy:               mdyText,
      fitch:             fitchText,
      lpSizeBil:         ext?.lpSizeBil || LPRecord.aum || LPRecord.nav || LPRecord.pension || ext?.aum || ext?.nav || '',
      lpSizeCriteria:    ext?.lpSizeCriteria || (LPRecord.aum ? 'AUM' : LPRecord.nav ? 'NAV' : LPRecord.pension ? 'Assets' : ''),
      capCommit:         ext?.commit || LPRecord.capCommit || '',
      ucM:               ext?.uncalled || LPRecord.uc || '',
      // UBS classification drives UBS rate/limit from Configuration.
      ubsAdvRatePct:     clsDefaultRatePct !== ''
                              ? clsDefaultRatePct
                              : (rate ? rate.ubsAdvRatePct * 100 : parsePct(LPRecord.rate)),
      agentRatePct,
      concLimitPct:      clsDefaultConcPct !== ''
                              ? clsDefaultConcPct
                              : (rate ? rate.ubsConcLimitPct * 100 : parsePct(LPRecord.ubsConc) || DEFAULT_CL_PCT),
      agentConcLimitPct,
      inc:               deriveInc(cls, LPRecord._isNew, LPRecord.inc),
      notes:             LPRecord.notes ?? '',
      region:            LPRecord.region ?? '',
      fundSleeve:        (LPRecord as LPRecord).fundSleeve ?? ext?.fundSleeve ?? '',
    }
  }

  const [overrides, setOverrides] = useState<Record<string, Override>>({})

  type FlashCol = 'highQuality' | 'ubsIncluded' | 'ubsBBCalc'
  type FlashTracker = Record<string, Partial<Record<FlashCol, number>>>
  const [flashKeys, setFlashKeys] = useState<FlashTracker>({})

  type SaveStatus = 'saving' | 'saved' | 'error'
  const [saveState, setSaveState] = useState<Record<string, SaveStatus>>({})
  const savedTimers   = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Keys of LP records the user has edited and saved on this screen. A manual
  // save makes the row user-owned, so its auto-mapped highlight is cleared and
  // it drops out of the auto-populated count regardless of whether the saved
  // value still differs from the stored classification.
  const [manuallyAdjusted, setManuallyAdjusted] = useState<Set<string>>(new Set())

  type ClassificationRow = LpClassificationRequest['rows'][number]
  const toRow = (key: string, ov: Override): ClassificationRow | null => {
    const LPRecord   = submissionLPs.find(l => l._key === key)
    const name = ov.name || LPRecord?.name || LPRecord?._agentName || ''
    if (!name) return null
    return {
      id:                LPRecord?.id,
      name,
      originalName:      LPRecord?.name || LPRecord?._agentName || undefined,
      parent:            ov.parent || undefined,
      spv:               ov.spv,
      fundSleeve:        ov.fundSleeve || undefined,
      investorType:      ov.investorType || undefined,
      instVsHnw:         ov.instVsHnw || undefined,
      region:            ov.region || undefined,
      ig:                ov.ig,
      cls:               ov.cls || undefined,
      agentCls:          ov.agentCls || undefined,
      agentClsSource:    ov.agentClsSource || undefined,
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
      await api.lpRecords.saveClassification({
        facilityId,
        effectiveDate: submissionDetails?.periodMonth ?? undefined,
        audit: true,
        rows: [row],
      })
      if (activeSubmissionId != null) {
        // Pass the loaded version; the server rejects a stale write (409) and returns the fresh
        // submission (new version) which we keep so subsequent saves stay current.
        const updated = await api.submissions.saveShadowBbState(activeSubmissionId, nextOverrides, submissionDetails?.version)
        setSubmissionDetails(updated)
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
    // Read-only guard: a non-owner may not persist edits. Friendly message instead of a raw 403.
    if (!canEdit) {
      toast('Read-only — this submission is owned by another analyst. Take it over to edit.', 3600, 'warning')
      return
    }
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
    // Save succeeded (saveRow throws on failure): the user has manually adjusted
    // this row, so un-highlight it and decrement the auto-mapped count.
    setManuallyAdjusted(prev => prev.has(key) ? prev : new Set(prev).add(key))
  }

  const savedOverridesApplied = useRef(false)

  useEffect(() => {
    if (savedOverridesApplied.current) return
    if (!classCfg || !eligCfg) return
    setOverrides(Object.fromEntries(submissionLPs.map(LPRecord => [LPRecord._key, buildOverride(LPRecord)])))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionLPs, lpRates, classCfg, eligCfg])

  useEffect(() => {
    if (savedOverridesApplied.current) return
    if (submissionLPs.length === 0) return
    const saved = submissionDetails?.shadowBbOverrides
    if (!saved || Object.keys(saved).length === 0) return
    const currentKeys = new Set(submissionLPs.map(LPRecord => LPRecord._key))
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
    const totalLPs  = submissionLPs.length || matchQueue.length
    const acceptedCount = matchQueue.filter(mq => mq.decision === 'Accepted').length
    const rejectedCount = matchQueue.filter(mq => mq.decision === 'Rejected').length
    const noMatchCount  = matchQueue.filter(mq => mq.isNew || !mq.masterName).length
    const uncalledM = Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.ucM), 0)
    const commitM   = Object.values(overrides).reduce((s, ov) => s + parseMoneyM(ov.capCommit), 0)
    const totalUncalled   = uncalledM > 0 ? `$${Math.round(uncalledM * 1_000_000).toLocaleString()}` : '—'
    const totalCommitment = commitM   > 0 ? `$${Math.round(commitM   * 1_000_000).toLocaleString()}` : '—'
    return [
      { label: 'Facility',          value: String(facilityName) },
      { label: 'As of Date',        value: asOfDate },
      { label: 'Agent Bank',        value: String(agentBank) },
      { label: 'LP Records in Submission', value: String(totalLPs) },
      { label: 'Match Decisions',          value: `${acceptedCount} accepted / ${rejectedCount} rejected / ${noMatchCount} no match` },
      { label: 'Total Commitment',  value: totalCommitment },
      { label: 'Total Uncalled',    value: totalUncalled },
    ]
  }, [submissionDetails, activeSubmission, matchQueue, overrides, submissionLPs.length])

  const newLPs       = submissionLPs.filter(LPRecord => LPRecord._isNew)
  const unclassified = submissionLPs.filter(LPRecord => !overrides[LPRecord._key]?.cls).length
  const currentUbsClsOptions = useMemo(
    () => classCfg ? busaClassificationOptions(classCfg).filter(Boolean) : [],
    [classCfg],
  )

  const autoPopulated = useMemo(
    () => countAutoPopulatedCls(
      submissionLPs.filter(LPRecord => !manuallyAdjusted.has(LPRecord._key)),
      overrides,
      currentUbsClsOptions,
    ),
    [submissionLPs, overrides, currentUbsClsOptions, manuallyAdjusted],
  )
  const ubsAutoFilledCount = autoPopulated.derived + autoPopulated.upgraded
  const agentAutoFilledCount = useMemo(
    () => submissionLPs.filter(LPRecord =>
      !manuallyAdjusted.has(LPRecord._key)
      && overrides[LPRecord._key]?.agentClsSource === 'DERIVED'
    ).length,
    [submissionLPs, overrides, manuallyAdjusted],
  )
  const autoFilledCount = ubsAutoFilledCount + agentAutoFilledCount
  const ubsClsSortOrder = useMemo(
    () => Object.fromEntries(currentUbsClsOptions.map((cls, index) => [cls, index])),
    [currentUbsClsOptions],
  )

  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false)
  const displayLPs = useMemo(() => {
    if (!unclassifiedOnly || unclassified === 0) return submissionLPs
    return submissionLPs
      .filter(LPRecord => !overrides[LPRecord._key]?.cls)
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

  const sortColumns = useMemo(() => {
    const getOverride = (LPRecord: SubmissionLP) => overrides[LPRecord._key]
    const getComputed = (LPRecord: SubmissionLP) => {
      const ov = getOverride(LPRecord)
      return ov ? calcRow(ov, totalCommitM, totalUncalledM) : null
    }
    return [
      { key: 'name', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.name || LPRecord.name || LPRecord._agentName || '' },
      { key: 'fundSleeve', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.fundSleeve ?? '' },
      { key: 'parent', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.parent ?? '' },
      { key: 'spv', getValue: (LPRecord: SubmissionLP) => !!getOverride(LPRecord)?.spv },
      { key: 'region', getValue: (LPRecord: SubmissionLP) => formatRegion(getOverride(LPRecord)?.region ?? LPRecord.region ?? '') },
      { key: 'investorType', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.investorType ?? LPRecord.investorType ?? '' },
      { key: 'cls', getValue: (LPRecord: SubmissionLP) => ubsClsSortOrder[getOverride(LPRecord)?.cls ?? ''] ?? Number.MAX_SAFE_INTEGER },
      { key: 'instVsHnw', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.instVsHnw ?? '' },
      { key: 'ig', getValue: (LPRecord: SubmissionLP) => !!getOverride(LPRecord)?.ig },
      { key: 'agentCls', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.agentCls ?? '' },
      { key: 'sp', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.sp ?? '' },
      { key: 'mdy', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.mdy ?? '' },
      { key: 'fitch', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.fitch ?? '' },
      { key: 'lpSizeBil', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.lpSizeBil ?? '' },
      { key: 'lpSizeCriteria', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.lpSizeCriteria ?? '' },
      { key: 'capCommit', getValue: (LPRecord: SubmissionLP) => parseMoneyM(getOverride(LPRecord)?.capCommit) },
      { key: 'ucM', getValue: (LPRecord: SubmissionLP) => parseMoneyM(getOverride(LPRecord)?.ucM) },
      { key: 'ubsAdvRatePct', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.ubsAdvRatePct ?? '' },
      { key: 'agentRatePct', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.agentRatePct ?? '' },
      { key: 'concLimitPct', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.concLimitPct ?? '' },
      { key: 'agentConcLimitPct', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.agentConcLimitPct ?? '' },
      { key: 'cmtPct', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.cmtPct ?? '' },
      { key: 'calledM', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.calledM ?? '' },
      { key: 'pctUncalled', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.pctUncalled ?? '' },
      { key: 'pctCalled', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.pctCalled ?? '' },
      { key: 'agentExcess', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.agentExcess ?? '' },
      { key: 'ubsExcess', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.ubsExcess ?? '' },
      { key: 'agentBBCalc', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.agentBBCalc ?? '' },
      { key: 'pctAgentBB', getValue: (LPRecord: SubmissionLP) => totalAgentBBCalc > 0 ? (getComputed(LPRecord)?.agentBBCalc ?? 0) / totalAgentBBCalc : 0 },
      { key: 'ubsBBCalc', getValue: (LPRecord: SubmissionLP) => getComputed(LPRecord)?.ubsBBCalc ?? '' },
      { key: 'pctUbsBB', getValue: (LPRecord: SubmissionLP) => totalUbsBBCalc > 0 ? (getComputed(LPRecord)?.ubsBBCalc ?? 0) / totalUbsBBCalc : 0 },
      { key: 'included', getValue: (LPRecord: SubmissionLP) => !!getComputed(LPRecord)?.included },
      { key: 'notes', getValue: (LPRecord: SubmissionLP) => getOverride(LPRecord)?.notes ?? '' },
    ]
  }, [overrides, totalCommitM, totalUncalledM, totalAgentBBCalc, totalUbsBBCalc, ubsClsSortOrder])

  const { sort, sortedRows: sortedDisplayLPs, requestSort } = useSortableRows(displayLPs, sortColumns)
  const { page, setPage, totalPages, total, pageItems, from, to, pageSize, setPageSize } = usePagination(sortedDisplayLPs)
  const { widths: bbWidths, onResizeStart: bbResizeStart, tableWidth: bbTableWidth } = useColumnResize('run-shadow-bb', SHADOW_BB_INITIAL_WIDTHS)

  // Deselect if the selected row leaves the current page or the BB result replaces the table.
  useEffect(() => {
    if (!selectedKey) return
    if (result || !pageItems.some(LPRecord => LPRecord._key === selectedKey)) setSelectedKey(null)
  }, [pageItems, selectedKey, result])

  useEffect(() => {
    if (selectedKey === null || sortedDisplayLPs.length === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      e.preventDefault()
      const idx = sortedDisplayLPs.findIndex(LPRecord => LPRecord._key === selectedKey)
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
    setRunBreaches([])
    if (unclassified > 0) toast(`${unclassified} unclassified LPRecord${unclassified !== 1 ? 's' : ''} will be treated as Excluded`, 4000, 'warning')
    toast('Shadow BB calculation started…')

    const overriddenLPs = submissionLPs.map(LPRecord => {
      const ov         = overrides[LPRecord._key] ?? buildOverride(LPRecord)
      const ucM        = parseMoneyM(ov.ucM)
      const concLimitM = typeof ov.concLimitPct === 'number'
        ? (ov.concLimitPct / 100) * totalUncalledM
        : (DEFAULT_CL_PCT / 100) * totalUncalledM
      const rate      = typeof ov.ubsAdvRatePct === 'number' ? formatPercentageValue(ov.ubsAdvRatePct) : formatPercentageText(LPRecord.rate, '0%')
      const agentRate = typeof ov.agentRatePct  === 'number' ? formatPercentageValue(ov.agentRatePct) : formatPercentageText(LPRecord.agentRate, '')
      const agentConc = typeof ov.agentConcLimitPct === 'number' ? formatPercentageValue(ov.agentConcLimitPct) : formatPercentageText(LPRecord.agentConc, '')
      const ubsConc   = typeof ov.concLimitPct === 'number'
        ? formatPercentageValue(ov.concLimitPct)
        : formatPercentageText(LPRecord.ubsConc, formatPercentageValue(DEFAULT_CL_PCT))
      const sizeAum = ov.lpSizeCriteria === 'AUM' ? ov.lpSizeBil : ''
      const sizeNav = ov.lpSizeCriteria === 'NAV' ? ov.lpSizeBil : ''
      const sizeAssets = ov.lpSizeCriteria === 'Assets' ? ov.lpSizeBil : ''
      return {
        ...LPRecord,
        name: ov.name || LPRecord.name || LPRecord._agentName,
        parent: ov.parent, spv: ov.spv, fundSleeve: ov.fundSleeve, investorType: ov.investorType, region: (ov.region || LPRecord.region || '') as LPRecord['region'], instVsHnw: ov.instVsHnw as LPRecord['instVsHnw'], ig: ov.ig,
        cls: ov.cls || 'Excluded', agentCls: ov.agentCls,
        agentClsSource: ov.agentClsSource,
        sp: ov.sp ?? '', mdy: ov.mdy ?? '', fitch: ov.fitch ?? '',
        aum: sizeAum, nav: sizeNav, pension: sizeAssets, pensionFunded: '',
        capCommit: ov.capCommit, rate, agentRate, ucM, uc: `$${ucM.toFixed(1)}M`,
        agentConc, ubsConc,
        concLimitM, inc: ov.inc ?? false, notes: ov.notes,
      }
    })

    // The server engine is authoritative: the run POSTs inputs only and renders the
    // response — no BB figure is computed client-side.
    let runResult: BBResult | null = null
    {
      const facilityId = submissionDetails?.facilityId
      if (facilityId == null) {
        setLoadError('No facility linked to this submission — cannot run Shadow BB.')
        setRunning(false)
        return
      }
      {
        try {
          const commitRows: CommitLpRow[] = overriddenLPs.map(LPRecord => ({
            name:            LPRecord.name ?? '',
            parent:          LPRecord.parent ?? null,
            spv:             LPRecord.spv ?? false,
            hq:              LPRecord.hq ?? true,
            fundSleeve:      LPRecord.fundSleeve ?? null,
            investorType:    LPRecord.investorType ?? null,
            instVsHnw:       LPRecord.instVsHnw ?? 'Institutional',
            region:          LPRecord.region ?? '',
            ig:              LPRecord.ig ?? false,
            cls:             LPRecord.cls ?? 'Excluded',
            agentCls:        LPRecord.agentCls || null,
            agentClsSource:  LPRecord.agentClsSource || null,
            sp:              LPRecord.sp ?? '',
            mdy:             LPRecord.mdy ?? '',
            fitch:           LPRecord.fitch ?? '',
            aum:             LPRecord.aum || null,
            nav:             LPRecord.nav || null,
            pension:         LPRecord.pension || null,
            pensionFunded:   LPRecord.pensionFunded || null,
            capCommit:       LPRecord.capCommit || null,
            pctCapCommit:    LPRecord.pctCapCommit || null,
            calledCap:       LPRecord.calledCap || null,
            uc:              LPRecord.uc || null,
            pctUncalled:     LPRecord.pctUncalled || null,
            pctCalled:       LPRecord.pctCalled || null,
            agentConc:       LPRecord.agentConc || null,
            ubsConc:         LPRecord.ubsConc || null,
            // Resolved UBS advance rate (matrix default or manual override) so it round-trips to
            // LP Master; `rate` is formatted above from the same criteria.
            ubsRate:         LPRecord.rate || null,
            agentRate:       LPRecord.agentRate || null,
            inc:             LPRecord.inc ?? false,
            rcl:             LPRecord.rcl ?? false,
            tf:              LPRecord.tf ?? false,
            notes:           LPRecord.notes || null,
          }))
          const snap = await api.bb.run(facilityId, commitRows)
          runResult = snap?.result ?? null
          setRunBreaches(runResult?.breaches ?? [])
        } catch (e) {
          setLoadError(String(e))
          setRunning(false)
          return
        }
      }
    }

    // Running only computes and snapshots — the submission stays In Progress so the analyst can
    // iterate. Submitting for independent review is a deliberate, separate step (submitForReview).
    setResult(runResult)
    setSubmitted(false)
    setRunning(false)
    const summary = runResult?.summary
    toast(summary
      ? `Shadow BB complete — ${overriddenLPs.length} LPs · UBS BB ${fmtM(summary.totalUBB)} · Delta ${fmtM(summary.bbDelta)}`
      : `Shadow BB complete — ${overriddenLPs.length} LPs.`)
  }

  // Maker step: hand the completed run to independent (Manager) review. Distinct from Run so the
  // analyst can re-run and refine before committing to review.
  const submitForReview = async () => {
    if (activeSubmissionId == null) return
    setSubmitting(true)
    try {
      const updated = await api.submissions.complete(activeSubmissionId, submissionDetails?.version)
      setSubmissionDetails(updated)
      setSubmitted(true)
      toast('Submitted for independent review — awaiting Manager approval.', 3600, 'success')
      setTargetFacility(submissionDetails?.facilityName ?? activeSubmission ?? null)
      navigate('shadow-bb')
    } catch (e) {
      toast(`Submit for review failed: ${String(e)}`)
    } finally {
      setSubmitting(false)
    }
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
    { label: 'UBS Elig. Uncalled',   value: fmtFull(result.summary.totalUEC ?? 0)                },
    { label: 'Conc. Excess (total)', value: fmtFull(result.summary.totalConcExcess ?? 0), neg: (result.summary.totalConcExcess ?? 0) > 0 },
    { label: 'Reclassified LPs',     value: result.summary.reclassCount ?? 0,                     right: true },
  ] : []

  const selectedLp = submissionLPs.find(LPRecord => LPRecord._key === selectedKey) ?? null

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))' }}>
      {loadError && <div style={{ padding: '10px 16px', background: '#fff0f0', color: 'var(--danger)', fontSize: 12 }}>API error — {loadError}</div>}
      {/* Changes Requested: the manager rejected the last submission. reviewNote (on a submission
          back at step 5) is the signal — the analyst revises here and re-submits for review. */}
      {submissionDetails?.reviewNote && submissionDetails.status === 'Review' && (
        <div style={{ padding: '10px 16px', background: '#fff8e6', borderBottom: '1px solid var(--amber)', fontSize: 12, color: 'var(--text)' }}>
          <strong style={{ color: '#8a6d00' }}>Changes requested by review</strong>
          {submissionDetails.reviewedBy ? ` (${submissionDetails.reviewedBy})` : ''}: {submissionDetails.reviewNote}
          {' '}— revise below and re-run, then Submit for Review again.
        </div>
      )}
      <OwnershipBanner submission={submissionDetails} onTakenOver={reloadSubmission} />
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
                <Button variant="danger" size="sm" onClick={() => setAbortOpen(true)} disabled={running || !canEdit} title={!canEdit ? 'Read-only — take over the submission to edit it.' : undefined}>Abort Submission</Button>
                <Button size="sm" onClick={run} disabled={isRunShadowBbDisabled(running, lpRatesLoaded, loadError != null, canEdit)} title={!canEdit ? 'Read-only — take over the submission to edit it.' : unclassified > 0 ? `${unclassified} unclassified LPRecord${unclassified !== 1 ? 's' : ''} will be treated as Excluded` : undefined}>{running ? 'Calculating…' : 'Run Shadow BB'}</Button>
              </div>
            }
          >
            {autoFilledCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '8px 18px 0', padding: '10px 14px', background: 'var(--amber-lt)', border: '1px solid rgba(180,83,9,.35)', borderRadius: 6, fontSize: 12, color: 'var(--amber)' }}>
                <span style={{ fontWeight: 700, color: 'var(--navy)', flexShrink: 0 }}>LP Categories</span>
                <span>
                  {agentAutoFilledCount > 0 ? `${agentAutoFilledCount} Agent ${agentAutoFilledCount === 1 ? 'category was' : 'categories were'} filled from Agent BB data. ` : ''}
                  {ubsAutoFilledCount > 0 ? `${ubsAutoFilledCount} UBS ${ubsAutoFilledCount === 1 ? 'category was' : 'categories were'} filled from Agent classification/rate or LP Master data. ` : ''}
                  Advance rates and concentration limits follow the selected categories only when those fields are blank.
                </span>
              </div>
            )}

            {/* Spreadsheet-order table + fixed overlay card. Opening a row never changes table width. */}
            <div style={{ position: 'relative', padding: '4px 18px 0' }}>

              <div style={{ minWidth: 0 }}>
                <div className="data-table-wrap">
                  <table className="data-table dense" style={{ tableLayout: 'fixed', width: bbTableWidth, minWidth: bbTableWidth }}>
                    <ShadowBBTableHead sort={sort} onSort={requestSort} widths={bbWidths} onResizeStart={bbResizeStart} />
                    <tbody>
                      {pageItems.map(LPRecord => {
                        const key      = LPRecord._key
                        const ov       = overrides[key] ?? {} as Override
                        const missing  = !ov.cls
                        const selected = key === selectedKey
                        // A manual edit+save makes the whole row user-owned: clear its
                        // auto-mapped highlight (UBS class/rate/conc + agent category cells).
                        const adjusted = manuallyAdjusted.has(key)
                        const autoClsKind = adjusted ? '' : getAutoPopulatedClsKind(LPRecord, ov, currentUbsClsOptions)
                        const autoClsTitle = autoClsKind === 'upgraded'
                          ? 'Auto-upgraded from LP Master data'
                          : autoClsKind === 'derived'
                            ? 'Auto-filled from Agent LP Category or Agent Advance Rate'
                            : ''
                        const agentClsAuto = !adjusted && ov.agentClsSource === 'DERIVED'
                        const c = calcRow(ov, totalCommitM, totalUncalledM)
                        const n = ov.name || LPRecord.name || LPRecord._agentName || '—'
                        return (
                          <tr key={key} className={selected ? 'data-table-row-selected' : undefined} onClick={() => setSelectedKey(key)}
                            style={{ cursor: 'pointer',
                              background: !selected && missing ? 'color-mix(in srgb, var(--danger) 6%, transparent)' : undefined }}>
                            <td title={n}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                                <span style={{ fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                                {LPRecord.tf && <span className="tf-badge">T</span>}
                                {LPRecord._isNew && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--red)', color: '#fff', borderRadius: 2, padding: '1px 4px', letterSpacing: '0.04em', flexShrink: 0 }}>NEW</span>}
                                {saveState[key] === 'saving' && <span style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>Saving…</span>}
                                {saveState[key] === 'saved'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>Saved</span>}
                                {saveState[key] === 'error'  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--danger)', flexShrink: 0 }}>Error</span>}
                              </div>
                            </td>
                            <td title={ov.parent || '—'}>{ov.parent || '—'}</td>
                            <td>{ov.spv ? 'Yes' : 'No'}</td>
                            <td>{formatRegion(ov.region || LPRecord.region) || '—'}</td>
                            <td title={ov.investorType || LPRecord.investorType || '—'}>{ov.investorType || LPRecord.investorType || '—'}</td>
                            <td>{ov.instVsHnw || '—'}</td>
                            <td className={agentClsAuto ? 'auto-mapped-cell' : undefined} title={agentClsAuto ? `${ov.agentCls || '—'} - Auto-filled from Agent BB data` : (ov.agentCls || '—')}>
                              <span className="auto-mapped-value"><span className="auto-mapped-text">{ov.agentCls || '—'}</span>{agentClsAuto && <span className="auto-mapped-badge">Auto</span>}</span>
                            </td>
                            <td className={autoClsKind ? 'auto-mapped-cell' : undefined} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: ov.cls ? undefined : 'var(--danger)' }} title={autoClsTitle ? `${ov.cls || 'Unclassified'} - ${autoClsTitle}` : (ov.cls || 'Unclassified')}>
                              <span className="auto-mapped-value"><span className="auto-mapped-text"><Tag>{ov.cls || 'Unclassified'}</Tag></span>{autoClsKind && <span className="auto-mapped-badge">Auto</span>}</span>
                            </td>
                            <td style={{ textAlign: 'center' }}><YesNo val={c.included} /></td>
                            <td>{ov.ig ? 'Yes' : 'No'}</td>
                            <td>{ov.sp || '—'}</td>
                            <td>{ov.mdy || '—'}</td>
                            <td>{ov.fitch || '—'}</td>
                            <td className="num" title={ov.lpSizeBil || '—'}>{lpSizeFormat(ov.lpSizeBil)}</td>
                            <td>{ov.lpSizeCriteria || '—'}</td>
                            <td className="num">{ov.capCommit ? fmtFull(parseMoneyM(ov.capCommit)) : '—'}</td>
                            <td className="num">{fmtPct(c.cmtPct)}</td>
                            <td className="num">{fmtFull(c.calledM)}</td>
                            <td className="num">{ov.ucM ? fmtFull(parseMoneyM(ov.ucM)) : '—'}</td>
                            <td className="num">{fmtPct(c.pctUncalled)}</td>
                            <td className="num">{fmtPct(c.pctCalled)}</td>
                            <td className="num">{pctStr(ov.agentRatePct)}</td>
                            <td className={`num ${autoClsKind ? 'auto-mapped-cell' : ''}`} title={autoClsTitle ? `${pctStr(ov.ubsAdvRatePct)} - Auto-populated from UBS LP Classification schedule` : undefined}>{pctStr(ov.ubsAdvRatePct)}</td>
                            <td className="num">{pctStr(ov.agentConcLimitPct)}</td>
                            <td className={`num ${autoClsKind ? 'auto-mapped-cell' : ''}`} title={autoClsTitle ? `${pctStr(ov.concLimitPct)} - Auto-populated from facility concentration defaults` : undefined}>{pctStr(ov.concLimitPct)}</td>
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
                    {total > 15 && <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}>{PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}</select>}
                    {totalPages > 1 && (<><Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>‹ Prev</Button><span style={{ fontSize: 11, color: 'var(--muted)' }}>Page {page} of {totalPages}</span><Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next ›</Button></>)}
                  </div>
                </div>
              </div>

              {selectedLp && selectedKey && overrides[selectedKey] && (
                <DraggablePanel className="LPRecord-detail-overlay" storageKey="run-shadow-bb-LPRecord-record">
                  <LPRecordCard
                    LPRecord={selectedLp}
                    ov={overrides[selectedKey]}
                    totalCommitM={totalCommitM}
                    totalUncalledM={totalUncalledM}
                    running={running || !lpRatesLoaded || loadError != null || !canEdit}
                    onDeselect={() => setSelectedKey(null)}
                    onSave={saveDraft}
                    saveStatus={saveState[selectedKey]}
                  />
                </DraggablePanel>
              )}
            </div>
          </Card>
        )}

        {result && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Tag variant="active" style={{ fontSize: 12, padding: '5px 10px' }}>✓ Calculation complete</Tag>{can('runShadowBB') && <Button onClick={submitForReview} disabled={submitting || submitted || !canEdit} title={!canEdit ? 'Read-only — take over the submission to submit it.' : 'Submit this Shadow BB for independent Manager review'}>{submitting ? 'Submitting…' : submitted ? '✓ Submitted for Review' : 'Submit for Review'}</Button>}<Button variant="secondary" onClick={() => { setTargetFacility(submissionDetails?.facilityName ?? activeSubmission ?? null); navigate('shadow-bb') }}>{buildBreachAlerts(runBreaches).primaryButtonLabel}</Button><Button variant="secondary" onClick={() => navigate('upload')}>Upload Another Submission</Button></div>}

        {result && (
          <Card title="Calculation Results" subtitle={`${submissionLPs.length} LP records processed`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 24px', padding: '4px 18px 18px' }}>
              {resultRows.map(r => (
                <div key={r.label} style={(r as { right?: boolean }).right ? { gridColumn: 4 } : undefined}><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{r.label}</div><div style={{ fontSize: 13, fontWeight: (r as { hi?: boolean }).hi ? 700 : 600, color: (r as { neg?: boolean }).neg ? 'var(--danger)' : (r as { hi?: boolean }).hi ? 'var(--navy)' : 'var(--text)' }}>{String(r.value)}</div></div>
              ))}
            </div>

            {runBreaches.length > 0 && (() => {
              const { hardBreaches, warnings, breachHeader, warningHeader } = buildBreachAlerts(runBreaches)
              const breachLine = (b: BBBreach, color: string) => (
                <div key={`${b.type}-${b.message}`} style={{ fontSize: 11, color: 'var(--text)', marginBottom: 2 }}>
                  {b.message} — at <strong style={{ color }}>{fmtPct(b.value)}</strong> (limit: {fmtPct(b.limit)})
                </div>
              )
              return (
                <div style={{ margin: '0 18px 14px' }}>
                  {hardBreaches.length > 0 && (
                    <div style={{ padding: '10px 12px', background: 'var(--red-lt)', borderRadius: 4, border: '1px solid var(--red)', marginBottom: warnings.length > 0 ? 8 : 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>
                        {breachHeader}
                      </div>
                      {hardBreaches.map(b => breachLine(b, 'var(--red)'))}
                    </div>
                  )}
                  {warnings.length > 0 && (
                    <div style={{ padding: '10px 12px', background: 'var(--amber-lt)', borderRadius: 4, border: '1px solid var(--amber)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', marginBottom: 8 }}>
                        {warningHeader}
                      </div>
                      {warnings.map(b => breachLine(b, 'var(--amber)'))}
                    </div>
                  )}
                </div>
              )
            })()}
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
export function LPRecordCard({ LPRecord, ov, totalCommitM, totalUncalledM, onSave, onDeselect, running, saveStatus }: {
  LPRecord: SubmissionLP
  ov: Override
  totalCommitM: number
  totalUncalledM: number
  onSave: (draft: Override) => Promise<void>
  onDeselect?: () => void
  running: boolean
  saveStatus?: 'saving' | 'saved' | 'error'
}) {
  const [draft, setDraft] = useState<Override>(ov)
  const [saving, setSaving] = useState(false)
  const configCache = useConfigCache()
  const classCfg = configCache.classification
  const eligCfg = configCache.eligibility

  useEffect(() => {
    setDraft(ov)
  }, [ov])

  const calc = useMemo(() => calcRow(draft, totalCommitM, totalUncalledM), [draft, totalCommitM, totalUncalledM])
  const name = draft.name || LPRecord.name || LPRecord._agentName || '—'
  const dirty = JSON.stringify(draft) !== JSON.stringify(ov)

  if (!classCfg || !eligCfg) {
    return <div style={{ padding: 16, color: 'var(--muted)', fontSize: 12 }}>Loading LPRecord configuration...</div>
  }

  const inputSt: React.CSSProperties = { width: '100%', fontSize: 12, padding: '3px 6px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--card)' }
  const roSt:    React.CSSProperties = { ...inputSt, background: 'var(--tbl)', color: 'var(--muted)' }
  const COLS: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '8px 16px', padding: '12px 16px' }
  const notesMax = 250
  const agentRateScheduleValues = eligCfg.AGENT_TIERS.map(({ cls }) => cls)
  const agentClsOptions = draft.agentCls && !agentRateScheduleValues.includes(draft.agentCls)
    ? ['', draft.agentCls, ...agentRateScheduleValues]
    : ['', ...agentRateScheduleValues]
  // LP-Master-upgraded LPs carry legacy tier labels (Rated / Unrated >2bn / …) that
  const ubsClsOptions = busaClassificationOptions(classCfg)

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
        // Reseed the UBS rate/limit from the criteria matrix (funded-split + rating band), matching
        // the initial buildOverride seeding; fall back to the flat schedules off the matrix.
        const commitM = parseMoneyM(next.capCommit)
        const ucM = parseMoneyM(next.ucM)
        const pctFunded = commitM > 0 ? Math.max(0, commitM - ucM) / commitM : 0
        const criteria = resolveBbCriteria(
          eligCfg?.BB_CRITERIA_MATRIX, value as string,
          { sp: next.sp, mdy: next.mdy, fitch: next.fitch }, pctFunded)
        if (criteria) {
          next.ubsAdvRatePct = criteria.advanceRatePct
          next.concLimitPct = criteria.concLimitPct
        }
        // No legacy flat-map fallback: a class outside the matrix leaves the stored rate/limit as-is.
      }
      if (field === 'agentCls') {
        next.agentClsSource = 'USER_EDITED'
        const tier = eligCfg.AGENT_TIERS.find(t => t.cls === value)
        if (tier && next.agentRatePct === '') next.agentRatePct = tier.rate
        const mappedUbsCls = ubsClassFromAgentCls(classCfg, value as string)
        const agentConcDefault = clsConcLimitPctForCls(eligCfg, mappedUbsCls)
        if (agentConcDefault !== '' && next.agentConcLimitPct === '') next.agentConcLimitPct = agentConcDefault
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

  const regionField = (label: string, field: keyof Override, span2: boolean | number = false) =>
    wrap(span2, <>{flbl(label)}<RegionTypeahead value={String(draft[field] ?? '')} disabled={running || saving} onChange={v => change(field, v)} style={inputSt} /></>, label)

  const amountTxt = (label: string, field: keyof Override, span2: boolean | number = false) =>
    wrap(span2, <>{flbl(label)}<input type="text" value={fmtMoneyInput(String(draft[field] ?? ''))} disabled={running || saving} style={inputSt} onChange={e => change(field, e.target.value)} /></>, label)

  const sel = (label: string, field: keyof Override, opts: readonly string[], span2: boolean | number = false) =>
    wrap(span2, <>{flbl(label)}<select value={String(draft[field] ?? '')} disabled={running || saving} style={inputSt} onChange={e => change(field, e.target.value)}>{opts.map(o => <option key={o || '__empty'} value={o}>{o || '—'}</option>)}</select></>, label)

  const chk = (label: string, field: keyof Override, span: boolean | number = false, accent = false) =>
    wrap(span, <div style={accent ? { border: '1px dotted var(--green)', background: 'var(--green-lt)', borderRadius: 4, padding: '6px 8px' } : undefined}>{flbl(label)}<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer', minHeight: 24 }}><input type="checkbox" checked={!!draft[field]} disabled={running || saving} onChange={e => change(field, e.target.checked)} /> Yes</label></div>, label)

  const pctInput = (label: string, field: keyof Override, step = 5) =>
    wrap(false, <>{flbl(label)}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 24px', alignItems: 'stretch', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', background: running || saving ? 'var(--tbl)' : 'var(--card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <input type="text" inputMode="decimal" value={draft[field] === '' || draft[field] == null ? '' : Number(draft[field])} disabled={running || saving}
          style={{ ...inputSt, width: '100%', border: 0, borderRadius: 0, paddingRight: 4, background: 'transparent', textAlign: 'left' }}
          onChange={e => {
            const value = e.target.value.trim()
            if (value === '') change(field, '')
            else {
              const parsed = Number.parseFloat(value)
              if (Number.isFinite(parsed)) change(field, Math.min(100, Math.max(0, parsed)))
            }
          }} aria-label={label} />
        <span style={{ padding: '0 8px 0 2px', color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>%</span>
      </div>
      <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', borderLeft: '1px solid var(--border)' }}>
        <button type="button" disabled={running || saving} onClick={() => change(field, Math.min(100, (typeof draft[field] === 'number' ? Number(draft[field]) : 0) + step))} aria-label={`Increase ${label}`} style={{ border: 0, borderBottom: '1px solid var(--border)', background: 'var(--tbl)', color: 'var(--navy)', fontSize: 9, lineHeight: 1, cursor: running || saving ? 'default' : 'pointer', padding: 0 }}>▲</button>
        <button type="button" disabled={running || saving} onClick={() => change(field, Math.max(0, (typeof draft[field] === 'number' ? Number(draft[field]) : 0) - step))} aria-label={`Decrease ${label}`} style={{ border: 0, background: 'var(--tbl)', color: 'var(--navy)', fontSize: 9, lineHeight: 1, cursor: running || saving ? 'default' : 'pointer', padding: 0 }}>▼</button>
      </div>
    </div>
    </>, label)

  return (
    <div style={{ height: '100%', border: '1px solid var(--border)', borderRadius: 0, overflow: 'hidden', boxShadow: '-6px 0 24px rgba(0,0,0,.12)', display: 'flex', flexDirection: 'column', background: 'var(--card)' }}>
      <div className="LPRecord-detail-hdr" style={{ background: 'var(--navy)', color: '#fff', padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
            <div className="LPRecord-detail-name" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</div>
            {LPRecord._isNew && <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(255,255,255,.2)', borderRadius: 3, padding: '2px 6px', flexShrink: 0 }}>NEW</span>}
          </div>
          {onDeselect && <button onClick={onDeselect} aria-label="Close" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1, opacity: .7, padding: 0, flexShrink: 0 }}>×</button>}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: .92 }}>
          {draft.cls && <Tag>{draft.cls}</Tag>}
          <span style={{ fontSize: 11, opacity: .8 }}>{pctStr(draft.ubsAdvRatePct)} UBS · {pctStr(draft.agentRatePct)} Agent</span>
          {LPRecord.tf && <span className="tf-badge">Transferee</span>}
          {saveStatus === 'saving' && <span style={{ fontSize: 10 }}>Saving...</span>}
          {saveStatus === 'saved'  && <span style={{ fontSize: 10, fontWeight: 700, color: '#9be8b6' }}>Saved</span>}
          {saveStatus === 'error'  && <span style={{ fontSize: 10, fontWeight: 700, color: '#ff9b9b' }}>Failed</span>}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={COLS}>
          {sec('Identification & Classification')}
          {txt('Investor Name', 'name', 6)}
          {chk('SPV?', 'spv', 1)}
          {txt('Parent', 'parent', 5)}
          {txt('Fund Sleeve', 'fundSleeve', 3)}
          {regionField('Region / Location', 'region', 3)}
          {/* INVESTOR_TYPE_OPTS already leads with an empty sentinel; TYPE_OPTS does not, so only it needs the '' prepend. */}
          {sel('Investor Type', 'investorType', classCfg.INVESTOR_TYPE_OPTS, 3)}
          {sel('Institutional vs HNW', 'instVsHnw', ['', ...classCfg.TYPE_OPTS], 3)}
          {sel('Agent LP Classification', 'agentCls', agentClsOptions)}
          {sel('UBS LP Classification', 'cls', ubsClsOptions)}
          {chk('Investment Grade?', 'ig')}
          
          {sec('Credit Ratings')}
          {sel('S&P', 'sp', classCfg.SP_RATING_OPTS, 2)}
          {sel("Moody's", 'mdy', classCfg.MDY_RATING_OPTS, 2)}
          {sel('Fitch', 'fitch', classCfg.FITCH_RATING_OPTS, 2)}

          {sec('Capital Metrics')}
          {txt('LP Size ($ Bil)', 'lpSizeBil')}
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
