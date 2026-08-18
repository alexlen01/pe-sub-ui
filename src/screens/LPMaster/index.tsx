import { useState, useMemo, useEffect, useCallback } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { SortableHeader, useSortableRows } from '../../hooks/useTableSort'
import { useColumnResize } from '../../hooks/useColumnResize'
import { formatRegion } from '../../config/regionReference'
import { useApp }  from '../../context/AppContext'
import Button      from '../../components/ui/Button'
import Card        from '../../components/ui/Card'
import Modal       from '../../components/ui/Modal'
import Tag         from '../../components/ui/Tag'
import InfoTip     from '../../components/ui/InfoTip'
import DraggablePanel  from '../../components/ui/DraggablePanel'
import LPRecordPanel   from '../../components/ui/LPRecordPanel'
import { getClassificationConfig, type ClassificationConfig } from '../../services/configService'
import { formatFullDate, formatUsdNoDecimals, getFacilities, parseMoneyToNumber } from '../../services/facilityService'
import { api, type LpClassificationRequest } from '../../services/api'
import { exportLpRecords } from '../../services/lpExportService'
import { getLPs, getLPsForFacility } from '../../services/lpService'
import type { FacilityRow } from '../../services/facilityService'
import type { LPRecord } from '../../services/lpService'
import { formatPercentageFraction } from '../../utils/percentage'
import { lpSizeFormat } from '../../utils/lpSize'

function formatMoneyText(value: unknown): string {
  const s = String(value ?? '').trim()
  if (!s || s === '—' || /^N\/A$/i.test(s)) return s
  const sign = s.trim().startsWith('–') || s.trim().startsWith('-') ? '–' : ''
  const m = s.match(/([\d,.]+)\s*([KMBT]?)/i)
  if (!m) return s
  const n = Number(m[1].replace(/,/g, ''))
  if (!Number.isFinite(n)) return s
  const unit = (m[2] || '').toUpperCase()
  const dollars =
    unit === 'T' ? n * 1_000_000_000_000 :
    unit === 'B' ? n * 1_000_000_000 :
    unit === 'M' ? n * 1_000_000 :
    unit === 'K' ? n * 1_000 :
    s.includes('$') || n >= 100_000 ? n : n * 1_000_000
  return `${sign}$${Math.round(dollars).toLocaleString('en-US')}`
}

function tableMoney(value: unknown): string {
  const s = String(value ?? '').trim()
  return s ? formatMoneyText(s) : '—'
}

/** Percent-scaled (90.0) value for the classification payload's *Pct fields, from the
 *  percent-or-dollars limit strings ("7.5%"). Dollar-denominated limits carry no percent. */
function pctNumber(value: unknown): number | undefined {
  const s = String(value ?? '').trim()
  if (!s || s === '—') return undefined
  const n = parseFloat(s.replace('%', ''))
  return Number.isFinite(n) ? n : undefined
}

/** Same payload scale, from an LPRecord advance rate already held as a fraction (0.9 → 90). */
function pctFromFraction(value: number | null | undefined): number | undefined {
  return value == null || !Number.isFinite(value) ? undefined : value * 100
}

function lpClassificationRow(LPRecord: LPRecord, originalName?: string): LpClassificationRequest['rows'][number] {
  return {
    id:                         LPRecord.id,
    investorName:               LPRecord.investorName,
    originalName,
    parent:                     LPRecord.parent ?? '',
    spv:                        LPRecord.spv,
    investorType:               LPRecord.investorType ?? '',
    institutionalOrHnw:         LPRecord.institutionalOrHnw,
    regionLocation:             LPRecord.regionLocation ?? '',
    investmentGrade:            LPRecord.investmentGrade,
    ubsLpCategory:              LPRecord.ubsLpCategory,
    agentLpCategory:            LPRecord.agentLpCategory ?? '',
    agentLpCategorySource:      LPRecord.agentLpCategorySource,
    spRating:                   LPRecord.spRating ?? '',
    moodysRating:               LPRecord.moodysRating ?? '',
    fitchRating:                LPRecord.fitchRating ?? '',
    aum:                        LPRecord.aum ?? '',
    nav:                        LPRecord.nav ?? '',
    pensionAssets:              LPRecord.pensionAssets ?? '',
    fundingRatio:               LPRecord.fundingRatio ?? undefined,
    capitalCommitment:          LPRecord.capitalCommitment ?? '',
    uncalledCapital:            LPRecord.uncalledCapital ?? '',
    ubsAdvanceRatePct:          pctFromFraction(LPRecord.ubsAdvanceRate),
    agentAdvanceRatePct:        pctFromFraction(LPRecord.agentAdvanceRate),
    ubsConcentrationLimitPct:   pctNumber(LPRecord.ubsConcentrationLimit),
    agentConcentrationLimitPct: pctNumber(LPRecord.agentConcentrationLimit),
    included:                   LPRecord.included,
    notes:                      LPRecord.notes ?? '',
  }
}

// Status colour mapping for the facility table's status dot
const STATUS_COLOR: Record<string, string> = {
  'Active':        'var(--green)',
  'In Progress':   'var(--red)',
  'Needs Review':  'var(--amber)',
  'Not Started':   'var(--muted)',
  'Pending':       '#e65100',
  'Review':        '#c2185b',
  'Inactive':      '#9e9e9e',
}

// The blue the Last BB Run column is accented in — already this cell's colour on the "◆ BB" badge,
// and dark enough to stay legible at the dense type scale (--sky is a hairline above 3:1 on white).
const LAST_RUN_BLUE = '#2e5f91'

// Default facility-table column widths. Each is sized to hold its own header label on a single
// line *including* the sort indicator the header always reserves (~31px of padding + gap +
// glyph at the dense 11px type scale), so no header ever wraps or ellipsis-truncates at the
// default layout. The summed width is the table's minimum, so a narrow viewport scrolls
// horizontally rather than squeezing the columns.
// Keys must match the sort keys below: SortableHeader hands its *sortKey* to onResizeStart, so a
// width keyed differently would be resized under a name no column ever reads back.
const FAC_COL_WIDTHS = {
  facName:             260, 
  facAgentBank:        150, 
  facLps:              78, 
  facAccount:          100,
  facLoanAmount:       120, 
  facUbsParticipation: 168,
  facMaturity:         120,
  facCollateral:       120, 
  facStatus:           132, 
  facLastRun:          150,
}

// ── Facility detail / edit overlay ────────────────────────────────────────────
// Mirrors the Prototype's facility detail (shared Modal, Identity + Agent Bank
// Summary sections), but the editable fields are always live — no view-only step.
// Date fields are kept in ISO (YYYY-MM-DD) so the native date inputs can bind
// directly without intermediate display-string conversion resetting the year field.
const toISODate = (display: string) => {
  const d = new Date(display)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

const moneyForFacilityEdit = (display: string) => {
  const cleaned = display === '—' ? '' : display
  const n = parseMoneyToNumber(cleaned)
  return n == null ? cleaned : formatUsdNoDecimals(n)
}

type FacilityForm = { name: string; agentBank: string; accountNumber: string; loanAmount: string; ubsParticipation: string; ubsParticipationRate: string; maturityDate: string; collateralDate: string }
type TextKey = 'name' | 'agentBank' | 'accountNumber' | 'loanAmount' | 'ubsParticipation' | 'ubsParticipationRate'
type DraftFieldKey = 'ubsParticipation' | 'ubsParticipationRate'

function parseRateInput(raw: unknown): number | null {
  const n = parseFloat(String(raw ?? '').replace('%', '').trim())
  if (!Number.isFinite(n)) return null
  return n > 1 ? n / 100 : n
}

function rateInputDisplay(value: number | null): string {
  return value == null ? '' : pctDisplay(value)
}

function participationRateFor(participation: number | null, facilitySize: number | null): string {
  return participation != null && facilitySize != null && facilitySize > 0
    ? rateInputDisplay(participation / facilitySize)
    : ''
}

function defaultParticipationFor(facilitySize: number | null): { amount: string; rate: string } | null {
  return facilitySize != null && facilitySize > 0
    ? { amount: formatUsdNoDecimals(facilitySize), rate: rateInputDisplay(1) }
    : null
}

function participationSupport(form: FacilityForm, facility: FacilityRow) {
  const facilitySize = parseMoneyToNumber(form.loanAmount) ?? parseMoneyToNumber(facility.facilitySize)
  const enteredRate = parseRateInput(form.ubsParticipationRate)
  const enteredParticipation = parseMoneyToNumber(form.ubsParticipation)
  const ubsParticipation = enteredParticipation ?? (facilitySize && enteredRate != null ? facilitySize * enteredRate : null)
  const supportedBb = parseMoneyToNumber(facility.ubsBB)
  const caps = [
    { label: 'Total facility size', value: facilitySize },
    { label: 'Latest UBS Shadow BB support', value: supportedBb },
  ].filter((c): c is { label: string; value: number } => c.value != null && c.value > 0)
  const suggested = caps.length > 0 ? Math.min(...caps.map(c => c.value)) : null
  return {
    facilitySize,
    ubsParticipation,
    participationRate: facilitySize && ubsParticipation ? ubsParticipation / facilitySize : enteredRate,
    suggested,
    limitingFactor: suggested == null ? null : caps.find(c => c.value === suggested)?.label ?? null,
  }
}

function pctDisplay(value: number | null): string {
  return value == null ? '—' : formatPercentageFraction(value)
}

function FacilityDetailOverlay({ facility, open, onClose, onSave, onDeactivate }: {
  facility: FacilityRow | null
  open: boolean
  onClose: () => void
  onSave: (f: FacilityRow) => void
  onDeactivate: (f: FacilityRow, status: 'Inactive' | 'Not Started') => void
}) {
  const [form, setForm] = useState<FacilityForm>({
    name: '', agentBank: '', accountNumber: '', loanAmount: '', ubsParticipation: '', ubsParticipationRate: '', maturityDate: '', collateralDate: '',
  })
  const [draftFields, setDraftFields] = useState<Record<DraftFieldKey, boolean>>({ ubsParticipation: false, ubsParticipationRate: false })

  useEffect(() => {
    if (!facility) return
    const clean = (v?: string | null) => (!v || v === '—' ? '' : v)
    const loanAmount = moneyForFacilityEdit(facility.loanAmount)
    const ubsParticipation = moneyForFacilityEdit(facility.ubsParticipation)
    const facilitySize = parseMoneyToNumber(loanAmount) ?? parseMoneyToNumber(facility.facilitySize)
    const participation = parseMoneyToNumber(ubsParticipation)
    const savedRate = clean(facility.ubsParticipationRate)
    const shouldDraftParticipation = !ubsParticipation && !savedRate
    const defaultParticipation = shouldDraftParticipation ? defaultParticipationFor(facilitySize) : null
    setForm({
      name:             clean(facility.name),
      agentBank:        clean(facility.agentBank),
      accountNumber:    clean(facility.accountNumber),
      loanAmount,
      ubsParticipation: defaultParticipation?.amount ?? ubsParticipation,
      ubsParticipationRate: savedRate || participationRateFor(participation, facilitySize) || defaultParticipation?.rate || '',
      maturityDate:     toISODate(clean(facility.maturityDate)),
      collateralDate:   toISODate(clean(facility.collateralDate)),
    })
    setDraftFields({
      ubsParticipation: defaultParticipation != null,
      ubsParticipationRate: defaultParticipation != null,
    })
  }, [facility?.id])

  if (!open || !facility) return null

  // A facility may only be deactivated while it holds no LP records. There is no delete —
  // a facility that is no longer in use is made Inactive and keeps its history.
  const hasLPs    = (facility.lps ?? 0) > 0
  const isInactive = facility.status === 'Inactive'
  const nameValid  = form.name.trim().length > 0 && form.agentBank.trim().length > 0
  const support = participationSupport(form, facility)
  const applySuggestedParticipation = () => {
    if (support.suggested == null) return
    setDraftFields({ ubsParticipation: false, ubsParticipationRate: false })
    setForm(p => ({
      ...p,
      ubsParticipation: formatUsdNoDecimals(support.suggested),
      ubsParticipationRate: participationRateFor(support.suggested, support.facilitySize),
    }))
  }

  const set = (k: TextKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (k === 'ubsParticipation' || k === 'ubsParticipationRate') {
      setDraftFields({ ubsParticipation: false, ubsParticipationRate: false })
    }
    setForm(p => {
      const next: FacilityForm = { ...p, [k]: value }
      const facilitySize = parseMoneyToNumber(k === 'loanAmount' ? value : next.loanAmount) ?? parseMoneyToNumber(facility.facilitySize)

      if (k === 'ubsParticipation') {
        next.ubsParticipationRate = participationRateFor(parseMoneyToNumber(value), facilitySize)
      } else if (k === 'ubsParticipationRate') {
        const rate = parseRateInput(value)
        if (rate != null && facilitySize != null && facilitySize > 0) {
          next.ubsParticipation = formatUsdNoDecimals(rate * facilitySize)
        }
      } else if (k === 'loanAmount') {
        const participation = parseMoneyToNumber(next.ubsParticipation)
        const rate = parseRateInput(next.ubsParticipationRate)
        if (draftFields.ubsParticipation && draftFields.ubsParticipationRate && facilitySize != null && facilitySize > 0) {
          next.ubsParticipation = formatUsdNoDecimals(facilitySize)
          next.ubsParticipationRate = rateInputDisplay(1)
        } else if (participation != null) {
          next.ubsParticipationRate = participationRateFor(participation, facilitySize)
        } else if (rate != null && facilitySize != null && facilitySize > 0) {
          next.ubsParticipation = formatUsdNoDecimals(rate * facilitySize)
        }
      }

      return next
    })
  }
  const stepParticipationRate = (deltaPct: number) => {
    setDraftFields({ ubsParticipation: false, ubsParticipationRate: false })
    setForm(p => {
      const facilitySize = parseMoneyToNumber(p.loanAmount) ?? parseMoneyToNumber(facility.facilitySize)
      const current = parseRateInput(p.ubsParticipationRate) ?? support.participationRate ?? 0
      const nextRate = Math.max(0, Math.min(1, current + deltaPct / 100))
      return {
        ...p,
        ubsParticipationRate: rateInputDisplay(nextRate),
        ubsParticipation: facilitySize != null && facilitySize > 0
          ? formatUsdNoDecimals(nextRate * facilitySize)
          : p.ubsParticipation,
      }
    })
  }
  const handleSave = () => onSave({ ...facility, ...form })

  const labelSt: React.CSSProperties = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 4, display: 'block' }
  const viewSt:  React.CSSProperties = { fontSize: 13, color: 'var(--navy)', minHeight: 26, display: 'flex', alignItems: 'center' }
  const draftInputSt: React.CSSProperties = { background: '#fff8e1', boxShadow: 'inset 0 0 0 1px rgba(198, 92, 0, .28)' }
  const draftBadge = (key: DraftFieldKey) => draftFields[key] ? (
    <span title="Draft estimated value" aria-label="Draft estimated value" style={{ marginLeft: 6, color: 'var(--amber)', fontSize: 11, fontWeight: 700 }}>●</span>
  ) : null

  // Read-only field cell (functions, not components, to avoid input focus loss)
  const ro = (label: string, value: React.ReactNode, span?: boolean) => (
    <div key={label} style={span ? { gridColumn: '1 / -1' } : undefined}>
      <div style={labelSt}>{label}</div>
      <div style={viewSt}>{value ?? '—'}</div>
    </div>
  )
  const ed = (label: string, key: TextKey, span?: boolean) => (
    <div key={label} className="form-group" style={span ? { marginBottom: 0, gridColumn: '1 / -1' } : { marginBottom: 0 }}>
      <label style={labelSt}>{label}{key === 'ubsParticipation' ? draftBadge(key) : null}</label>
      <input type="text" style={{ width: '100%', ...(key === 'ubsParticipation' && draftFields.ubsParticipation ? draftInputSt : {}) }} value={form[key]} onChange={set(key)} aria-label={label} />
    </div>
  )
  const participationRateEd = () => (
    <div key="UBS Participation Rate" className="form-group" style={{ marginBottom: 0 }}>
      <label style={labelSt}>UBS Participation Rate{draftBadge('ubsParticipationRate')}</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 24px', alignItems: 'stretch', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', background: draftFields.ubsParticipationRate ? '#fff8e1' : 'var(--card)', ...(draftFields.ubsParticipationRate ? { boxShadow: 'inset 0 0 0 1px rgba(198, 92, 0, .28)' } : {}) }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <input
            type="text"
            inputMode="decimal"
            style={{ width: '100%', border: 0, borderRadius: 0, paddingRight: 4, background: 'transparent' }}
            value={form.ubsParticipationRate.replace('%', '')}
            onChange={set('ubsParticipationRate')}
            aria-label="UBS Participation Rate"
          />
          <span style={{ padding: '0 8px 0 2px', color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>%</span>
        </div>
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', borderLeft: '1px solid var(--border)' }}>
          <button type="button" onClick={() => stepParticipationRate(1)} aria-label="Increase UBS Participation Rate" style={{ border: 0, borderBottom: '1px solid var(--border)', background: 'var(--tbl)', color: 'var(--navy)', fontSize: 9, lineHeight: 1, cursor: 'pointer', padding: 0 }}>▲</button>
          <button type="button" onClick={() => stepParticipationRate(-1)} aria-label="Decrease UBS Participation Rate" style={{ border: 0, background: 'var(--tbl)', color: 'var(--navy)', fontSize: 9, lineHeight: 1, cursor: 'pointer', padding: 0 }}>▼</button>
        </div>
      </div>
    </div>
  )
  const sec = (t: string) => (
    <div key={t} style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy)', marginTop: 6, padding: '4px 10px', background: 'var(--tbl)', borderRadius: 4, borderLeft: '3px solid var(--navy)' }}>{t}</div>
  )

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {isInactive ? (
          <Button variant="secondary" onClick={() => onDeactivate(facility, 'Not Started')}>Reactivate</Button>
        ) : (
          <Button variant="secondary" onClick={() => onDeactivate(facility, 'Inactive')} disabled={hasLPs}
                  title={hasLPs ? 'Remove all LP records before deactivating' : undefined}>Deactivate</Button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={!nameValid}>Save Changes</Button>
      </div>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={facility.name} width={620} footer={footer}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        {facility.agentBank} · {facility.lps?.toLocaleString()} LPs
        {hasLPs && <span style={{ marginLeft: 8, color: 'var(--amber)' }}>· deactivate disabled while LP records exist</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
        {sec('Identity')}
        {ed('Borrower', 'name', true)}
        {ed('Agent Bank', 'agentBank')}
        {ro('# LPs', facility.lps?.toLocaleString())}

        {sec('Agent Bank Summary')}
        {ed('Account Number', 'accountNumber')}
        {ed('Loan Amount', 'loanAmount')}
        {ed('UBS Participation', 'ubsParticipation')}
        {participationRateEd()}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={labelSt}>Suggested UBS Participation</label>
          <div style={{ ...viewSt, justifyContent: 'space-between', gap: 8 }}>
            <span>
              {support.suggested == null ? '—' : formatUsdNoDecimals(support.suggested)}
              {support.limitingFactor && (
                <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>
                  limited by {support.limitingFactor}
                </span>
              )}
            </span>
            <Button size="sm" variant="secondary" disabled={support.suggested == null} onClick={applySuggestedParticipation}>Apply</Button>
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={labelSt}>Maturity Date</label>
          <input type="date" style={{ width: '100%' }} value={form.maturityDate} onChange={e => setForm(p => ({ ...p, maturityDate: e.target.value }))} aria-label="Maturity Date" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={labelSt}>Collateral Date</label>
          <input type="date" style={{ width: '100%' }} value={form.collateralDate} onChange={e => setForm(p => ({ ...p, collateralDate: e.target.value }))} aria-label="Collateral Date" />
        </div>
        {ro('Facility Status', <Tag>{facility.status}</Tag>)}

      </div>
    </Modal>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function LPMaster() {
  const { toast, navigate, lpData, setLpData, currentUser, setActiveFacilityId, setTargetFacility } = useApp()
  const canEdit = currentUser?.role === 'Analyst' || currentUser?.role === 'Account/Transaction Manager'

  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  const [classCfg,   setClassCfg]   = useState<ClassificationConfig | null>(null)
  // Bank-wide LP Master row count, for the entry button's label. Null until it resolves, so the
  // button reads "View Master LP Records →" rather than flashing a placeholder count.
  const [lpMasterCount, setLpMasterCount] = useState<number | null>(null)
  useEffect(() => {
    getFacilities().then(setFacilities).catch(() => {})
  }, [])
  useEffect(() => {
    api.lpMaster.count().then(r => setLpMasterCount(r.count)).catch(() => {})
  }, [])
  useEffect(() => {
    getClassificationConfig().then(setClassCfg).catch(() => {})
  }, [])

  // view: 'grid' = facility picker, 'list' = LP table
  const [view,       setView]       = useState<'grid' | 'list'>('grid')
  const [facFilter,  setFacFilter]  = useState<FacilityRow | null>(null)
  const [facSearch,  setFacSearch]  = useState('')
  const [search,     setSearch]     = useState('')
  const [clsFilter,  setClsFilter]  = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [incFilter,  setIncFilter]  = useState('')
  const [selected,   setSelected]   = useState<LPRecord | null>(null)
  const [editingFacility, setEditingFacility] = useState<FacilityRow | null>(null)
  const [rerunning, setRerunning] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Live: pull the facility's LP records fresh on open so newly-committed LPs always show,
  // independent of whatever facility the shared context last loaded.
  const openFacility = (fac: FacilityRow) => {
    setFacFilter(fac)
    setSearch('')
    setClsFilter('')
    setTypeFilter('')
    setIncFilter('')
    setView('list')
    if (fac.id != null) {
      setActiveFacilityId(fac.id)
      getLPsForFacility(fac.id).then(setLpData).catch(() => {})
    }
  }

  const openAll = () => {
    setFacFilter(null)
    setSearch('')
    setClsFilter('')
    setTypeFilter('')
    setIncFilter('')
    setView('list')
    getLPs().then(setLpData).catch(() => {})
  }

  const backToGrid = () => {
    setView('grid')
    setFacFilter(null)
  }

  // Export is the whole lp_records table, never the filtered page — it is a copy of the store, so
  // it refetches rather than dumping whatever the current facility view happens to hold.
  const handleExportLpRecords = async () => {
    setExporting(true)
    try {
      const all = await getLPs()
      exportLpRecords(all, facilityById)
      toast(`Exported ${all.length.toLocaleString()} LP records to Excel.`)
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'Could not export LP records — API unavailable.')
    } finally {
      setExporting(false)
    }
  }

  const visibleFacilities = useMemo(() => {
    const q = facSearch.toLowerCase()
    return q ? facilities.filter(f => f.name.toLowerCase().includes(q) || f.agentBank.toLowerCase().includes(q)) : facilities
  }, [facilities, facSearch])

  // Facility table: sorted on the underlying values, not the display strings — dates sort
  // chronologically off their ISO form rather than alphabetically off "Jun 1, 2026".
  const facSortColumns = useMemo(() => [
    { key: 'facName',        getValue: (f: FacilityRow) => f.name },
    { key: 'facAgentBank',   getValue: (f: FacilityRow) => f.agentBank },
    { key: 'facLps',         getValue: (f: FacilityRow) => f.lps ?? null },
    { key: 'facAccount',     getValue: (f: FacilityRow) => f.accountNumber },
    { key: 'facLoanAmount',  getValue: (f: FacilityRow) => f.loanAmount },
    { key: 'facUbsParticipation', getValue: (f: FacilityRow) => parseMoneyToNumber(f.ubsParticipation) },
    { key: 'facMaturity',    getValue: (f: FacilityRow) => toISODate(f.maturityDate) },
    { key: 'facCollateral',  getValue: (f: FacilityRow) => toISODate(f.collateralDate) },
    { key: 'facStatus',      getValue: (f: FacilityRow) => f.status },
    { key: 'facLastRun',     getValue: (f: FacilityRow) => f.lastRunAt ?? null },
  ], [])
  const { sort: facSort, sortedRows: facSortedRows, requestSort: requestFacSort } =
    useSortableRows(visibleFacilities, facSortColumns, { key: 'facName', direction: 'asc' })
  const facPage = usePagination(facSortedRows)
  // Versioned key: useColumnResize merges stored widths over these defaults, so a returning user
  // would otherwise keep the retired edit and UBS Participation Rate columns — and the old
  // UBS Participation width — forever.
  const { widths: facWidths, onResizeStart: onFacResizeStart, tableWidth: facTableWidth } =
    useColumnResize('lp-master-facilities-v3', FAC_COL_WIDTHS)
  const facVisibleWidth = facTableWidth

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return lpData.filter(LPRecord => {
      const matchQ    = !q || (LPRecord.investorName ?? '').toLowerCase().includes(q) || (LPRecord.parent ?? '').toLowerCase().includes(q)
      const matchCls  = !clsFilter  || LPRecord.ubsLpCategory === clsFilter
      const matchType = !typeFilter || (LPRecord.investorType ?? '') === typeFilter
      const matchInc  = !incFilter  || (incFilter === 'Y' ? LPRecord.included : !LPRecord.included)
      return matchQ && matchCls && matchType && matchInc
    })
  }, [lpData, search, clsFilter, typeFilter, incFilter])
  const clsLegendItems = useMemo(() => {
    if (!classCfg) return []
    return classCfg.CLS_OPTS.filter(Boolean).map(cls => ({
      label: `${cls} - ${classCfg.BUSA_RATE_MAP[cls] ?? ''}`.trim(),
      desc: classCfg.CLS_CRITERIA[cls] ?? '',
    }))
  }, [classCfg])
  // "All Facilities" mixes records from every facility, so each row names its own facility.
  // The API sends only facilityId on an LP record; the name comes from the loaded facility list.
  const facilityById = useMemo(() => {
    const byId = new Map<number, FacilityRow>()
    facilities.forEach(f => { if (f.id != null) byId.set(f.id, f) })
    return byId
  }, [facilities])
  const facilityLabel = useCallback((LPRecord: LPRecord) => (
    LPRecord.facilityId != null ? facilityById.get(LPRecord.facilityId)?.name ?? '—' : '—'
  ), [facilityById])
  const sortColumns = useMemo(() => [
    { key: 'rank',         getValue: (LPRecord: LPRecord) => LPRecord.lpRank ?? null },
    { key: 'facility',     getValue: (LPRecord: LPRecord) => facilityLabel(LPRecord) },
    { key: 'name',         getValue: (LPRecord: LPRecord) => LPRecord.investorName },
    { key: 'parent',       getValue: (LPRecord: LPRecord) => LPRecord.parent ?? '' },
    { key: 'spv',          getValue: (LPRecord: LPRecord) => LPRecord.spv ? 'Yes' : 'No' },
    { key: 'region',       getValue: (LPRecord: LPRecord) => formatRegion(LPRecord.regionLocation) },
    { key: 'investorType', getValue: (LPRecord: LPRecord) => LPRecord.investorType ?? '' },
    { key: 'instHnw',      getValue: (LPRecord: LPRecord) => LPRecord.institutionalOrHnw === 'HNW' ? 'HNW' : 'Institutional' },
    { key: 'agentLpCategory',     getValue: (LPRecord: LPRecord) => LPRecord.agentLpCategory ?? '' },
    { key: 'cls',          getValue: (LPRecord: LPRecord) => `${LPRecord.ubsLpCategory ?? ''}\u0000${LPRecord.investorName ?? ''}` },
    { key: 'inc',          getValue: (LPRecord: LPRecord) => LPRecord.included ? 'Yes' : 'No' },
    { key: 'ig',           getValue: (LPRecord: LPRecord) => LPRecord.investmentGrade ? 'Yes' : 'No' },
    { key: 'sp',           getValue: (LPRecord: LPRecord) => LPRecord.spRating ?? '' },
    { key: 'mdy',          getValue: (LPRecord: LPRecord) => LPRecord.moodysRating ?? '' },
    { key: 'fitch',        getValue: (LPRecord: LPRecord) => LPRecord.fitchRating ?? '' },
    { key: 'lpSize',       getValue: (LPRecord: LPRecord) => LPRecord.aum || LPRecord.nav || LPRecord.pensionAssets || '' },
    { key: 'sizeMeasure',  getValue: (LPRecord: LPRecord) => LPRecord.aum ? 'AUM' : LPRecord.nav ? 'NAV' : LPRecord.pensionAssets ? 'Assets' : '' },
    { key: 'capitalCommitment',    getValue: (LPRecord: LPRecord) => LPRecord.capitalCommitment ?? '' },
    { key: 'pctOfFundCommitments', getValue: (LPRecord: LPRecord) => LPRecord.pctOfFundCommitments ?? '' },
    { key: 'calledCapital',    getValue: (LPRecord: LPRecord) => LPRecord.calledCapital ?? '' },
    { key: 'uc',           getValue: (LPRecord: LPRecord) => LPRecord.uncalledCapital ?? '' },
    { key: 'pctOfFundUncalled',  getValue: (LPRecord: LPRecord) => LPRecord.pctOfFundUncalled ?? '' },
    { key: 'pctLpCalled',    getValue: (LPRecord: LPRecord) => LPRecord.pctLpCalled ?? '' },
    { key: 'agentAdvanceRate',    getValue: (LPRecord: LPRecord) => LPRecord.agentAdvanceRate ?? '' },
    { key: 'rate',         getValue: (LPRecord: LPRecord) => LPRecord.ubsAdvanceRate ?? '' },
    { key: 'agentConcentrationLimit', getValue: (LPRecord: LPRecord) => LPRecord.agentConcentrationLimit ?? '' },
    { key: 'ubsConcentrationLimit',   getValue: (LPRecord: LPRecord) => LPRecord.ubsConcentrationLimit ?? '' },
    { key: 'agentExcess',  getValue: (LPRecord: LPRecord) => LPRecord.agentExcessConcentration ?? '' },
    { key: 'ubsExcess',    getValue: (LPRecord: LPRecord) => LPRecord.ubsExcessConcentration ?? '' },
    { key: 'abb',          getValue: (LPRecord: LPRecord) => LPRecord.agentBorrowingBase ?? '' },
    { key: 'ubb',          getValue: (LPRecord: LPRecord) => LPRecord.ubsBorrowingBase ?? '' },
    { key: 'notes',        getValue: (LPRecord: LPRecord) => LPRecord.notes ?? '' },
  ], [facilityLabel])
  const { sort, setSort, sortedRows, requestSort } = useSortableRows(filtered, sortColumns, { key: 'name', direction: 'asc' })
  useEffect(() => {
    setSort({ key: facFilter ? 'rank' : 'name', direction: 'asc' })
  }, [facFilter, setSort])
  const { page, setPage, totalPages, total, pageItems, from, to, pageSize, setPageSize } = usePagination(sortedRows)
  // Keys are the column's sortKey — `SortableHeader` reports resizes under that name, so a width
  // parked under any other key can never be dragged. Every width is also floored at its own header
  // label's rendered width (11px bold Segoe UI in `.data-table.dense`) plus the 18px side padding
  // and the 13px sort indicator, so no label is ever ellipsis-truncated at the default sizing.
  const { widths, onResizeStart, tableWidth } = useColumnResize('lp-master-v2', {
    rank: 64, 
    facility: 180,
    name: 170, 
    parent: 160, 
    spv: 54,
    region: 125, 
    investorType: 130, 
    instHnw: 142, 
    agentLpCategory: 151, 
    cls: 144,
    inc: 71, 
    ig: 126, 
    sp: 70, 
    mdy: 78, 
    fitch: 70,
    lpSize: 84, 
    sizeMeasure: 101, 
    capitalCommitment: 146, 
    pctOfFundCommitments: 133,
    calledCapital: 104, 
    uc: 117, 
    pctOfFundUncalled: 144, 
    pctLpCalled: 107,
    agentAdvanceRate: 139, 
    rate: 128, 
    agentConcentrationLimit: 171, 
    ubsConcentrationLimit: 160,
    agentExcess: 177, 
    ubsExcess: 167, 
    abb: 149, 
    ubb: 139, 
    notes: 150
  })
  // Rank and Facility are mutually exclusive: Rank only under a selected facility, Facility only
  // under "All Facilities". Whichever is hidden must come off the summed table width.
  const visibleTableWidth = typeof tableWidth !== 'number'
    ? tableWidth
    : tableWidth - (facFilter ? widths.facility : widths.rank)
  const handleSave = async (updated: LPRecord) => {
    const originalId = selected?.id
    const originalName = selected?.investorName
    setLpData(lpData.map(LPRecord => {
      if (originalId != null && LPRecord.id != null) {
        return LPRecord.id === originalId ? updated : LPRecord
      }
      return LPRecord.investorName === originalName ? updated : LPRecord
    }))
    setSelected(updated)
    if (facFilter?.id != null) {
      try {
        await api.lpRecords.saveClassification({
          facilityId: facFilter.id,
          audit: true,
          rows: [lpClassificationRow(updated, originalName)],
        })
      } catch (e) {
        toast(e instanceof Error && e.message ? e.message : 'Could not save LP record — API unavailable.')
        return
      }
    }
    toast(`LP record updated — ${updated.investorName}.`)
  }

  // Persist every editable facility field (Identity + Agent Bank Summary) via PATCH, then reflect
  // the saved values locally. Rows are reconciled by id (the name is itself editable now).
  const handleFacilitySave = async (updated: FacilityRow) => {
    const loanAmount = parseMoneyToNumber(updated.loanAmount)
    const enteredRate = parseRateInput(updated.ubsParticipationRate)
    const ubsParticipation = parseMoneyToNumber(updated.ubsParticipation) ?? (loanAmount && enteredRate != null ? loanAmount * enteredRate : null)
    const ubsParticipationRate = loanAmount && ubsParticipation
      ? rateInputDisplay(ubsParticipation / loanAmount)
      : '—'
    if (updated.id != null) {
      try {
        await api.facilities.update(updated.id, {
          name:             updated.name.trim(),
          agentBank:        updated.agentBank.trim(),
          accountNumber:    updated.accountNumber === '—' ? null : updated.accountNumber,
          loanAmount,
          ubsParticipation,
          maturityDate:     toISODate(updated.maturityDate) || null,
          collateralDate:   toISODate(updated.collateralDate) || null,
        })
      } catch (e) {
        toast(e instanceof Error && e.message ? e.message : 'Could not save facility — API unavailable.')
        return
      }
    }
    setFacilities(prev => prev.map(f => (f.id === updated.id ? {
      ...f,
      ...updated,
      loanAmount: formatUsdNoDecimals(loanAmount),
      ubsParticipation: formatUsdNoDecimals(ubsParticipation),
      ubsParticipationRate,
    } : f)))
    setEditingFacility(null)
    toast(`Facility updated — ${updated.name}.`)
  }

  // Deactivate (→ Inactive) or reactivate (→ Not Started) a facility with no LP records.
  const handleFacilityDeactivate = async (target: FacilityRow, status: 'Inactive' | 'Not Started') => {
    if (target.id != null) {
      try {
        await api.facilities.setStatus(target.id, status)
      } catch (e) {
        toast(e instanceof Error && e.message ? e.message : 'Could not update facility status — API unavailable.')
        return
      }
    }
    setFacilities(prev => prev.map(f => (f.id === target.id ? { ...f, status } : f)))
    setEditingFacility(null)
    toast(status === 'Inactive' ? `Facility deactivated — ${target.name}.` : `Facility reactivated — ${target.name}.`)
  }

  // Hard-delete an erroneously ingested LP record (correction path for rows that slipped
  // past extraction review). Re-fetch the list so all server-managed record data stays current.
  const handleDelete = async (target: LPRecord) => {
    if (target.id == null) return
    try {
      await api.lpRecords.remove(target.id)
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'Could not delete LP record — API unavailable.')
      return
    }
    setSelected(null)
    try {
      const refreshed = facFilter?.id != null ? await getLPsForFacility(facFilter.id) : await getLPs()
      setLpData(refreshed)
    } catch {
      setLpData(lpData.filter(LPRecord => LPRecord.id !== target.id))
    }
    toast(`LP record deleted — ${target.investorName}.`)
  }

  const handleRerunShadowBB = async () => {
    if (!facFilter?.id || facFilter.status === 'Inactive') return
    setRerunning(true)
    try {
      const { snapshot, submission } = await api.bb.rerunFromLpMaster(facFilter.id)
      const refreshedLPs = await getLPsForFacility(facFilter.id)
      setLpData(refreshedLPs)
      if (selected) {
        const refreshedSelected = selected.id != null
          ? refreshedLPs.find(lp => lp.id === selected.id) ?? null
          : refreshedLPs.find(lp => lp.investorName === selected.investorName) ?? null
        setSelected(refreshedSelected)
      }
      const refreshedFacilities = await getFacilities()
      setFacilities(refreshedFacilities)
      setTargetFacility(facFilter.name)
      const summary = snapshot.result.summary
      toast(
        `Shadow BB re-run complete — UBS BB ${formatUsdNoDecimals(summary.totalUBB * 1_000_000)}.${submission ? ' Submitted for Manager approval.' : ''}`,
        3600,
        'success',
      )
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'Could not re-run Shadow BB — API unavailable.')
    } finally {
      setRerunning(false)
    }
  }

  const explainInactiveRerun = () => {
    toast('Re-run Shadow BB is unavailable because this facility is inactive.')
  }

  // ── Facility grid view ────────────────────────────────────────────────────
  if (view === 'grid') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))', padding: '16px 24px 24px', overflow: 'hidden' }}>
        <Card style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} bodyStyle={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="filter-bar" style={{ padding: '8px 18px' }}>
            <input
              type="text"
              placeholder="Search facilities or agent bank…"
              style={{ width: 300 }}
              value={facSearch}
              onChange={e => setFacSearch(e.target.value)}
              autoFocus
            />
            <Button variant="secondary" size="sm" onClick={openAll}>
              View All {facilities.reduce((s, f) => s + (f.lps ?? 0), 0).toLocaleString()} LPs →
            </Button>
            {/* The bank-wide curated store, distinct from the per-facility records above it: these
                are the profiles matching applies to an upload, not the output of one. */}
            <Button variant="secondary" size="sm" onClick={() => navigate('lp-master-records')}>
              View Master {lpMasterCount != null ? lpMasterCount.toLocaleString() : ''} LP Records →
            </Button>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
              {visibleFacilities.length} of {facilities.length} facilities
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <div className="data-table-wrap">
              {/* Fills the card: the summed column widths are only the floor, and any space left
                  over on a wider viewport is shared out across the columns instead of trailing
                  off as blank card. Below the floor the wrapper scrolls sideways. */}
              <table className="data-table dense" style={{ tableLayout: 'fixed', minWidth: facVisibleWidth, width: '100%' }}>
                <thead>
                  <tr>
                    <SortableHeader sortKey="facName"       sort={facSort} onSort={requestFacSort} style={{ width: facWidths.facName }}          onResizeStart={onFacResizeStart}>Facility</SortableHeader>
                    <SortableHeader sortKey="facAgentBank"  sort={facSort} onSort={requestFacSort} style={{ width: facWidths.facAgentBank }}     onResizeStart={onFacResizeStart}>Agent Bank</SortableHeader>
                    <SortableHeader sortKey="facLps"        sort={facSort} onSort={requestFacSort} className="num" style={{ width: facWidths.facLps }} onResizeStart={onFacResizeStart}># LPs</SortableHeader>
                    <SortableHeader sortKey="facAccount"    sort={facSort} onSort={requestFacSort} style={{ width: facWidths.facAccount }}       onResizeStart={onFacResizeStart}>Account #</SortableHeader>
                    <SortableHeader sortKey="facLoanAmount" sort={facSort} onSort={requestFacSort} className="num" style={{ width: facWidths.facLoanAmount }} onResizeStart={onFacResizeStart}>Loan Amount</SortableHeader>
                    <SortableHeader sortKey="facUbsParticipation" sort={facSort} onSort={requestFacSort} className="num" style={{ width: facWidths.facUbsParticipation }} onResizeStart={onFacResizeStart}>UBS Participation</SortableHeader>
                    <SortableHeader sortKey="facMaturity"   sort={facSort} onSort={requestFacSort} style={{ width: facWidths.facMaturity }}      onResizeStart={onFacResizeStart}>Maturity Date</SortableHeader>
                    <SortableHeader sortKey="facCollateral" sort={facSort} onSort={requestFacSort} style={{ width: facWidths.facCollateral }}    onResizeStart={onFacResizeStart}>Collateral Date</SortableHeader>
                    <SortableHeader sortKey="facStatus"     sort={facSort} onSort={requestFacSort} style={{ width: facWidths.facStatus }}        onResizeStart={onFacResizeStart}>Facility Status</SortableHeader>
                    <SortableHeader sortKey="facLastRun"    sort={facSort} onSort={requestFacSort} style={{ width: facWidths.facLastRun }}       onResizeStart={onFacResizeStart}>Last BB Run</SortableHeader>
                  </tr>
                </thead>
                <tbody>
                  {facPage.pageItems.map(f => {
                    const color = STATUS_COLOR[f.status] ?? 'var(--muted)'
                    return (
                      // The row itself opens the facility detail overlay — it carries what the
                      // retired edit icon used to. The name cell keeps the drill-down into the
                      // facility's LP records; viewers have no overlay, so their row still drills.
                      <tr key={f.id ?? f.name} onClick={() => (canEdit ? setEditingFacility(f) : openFacility(f))} style={{ cursor: 'pointer' }}>
                        <td
                          className="drill-cell folder-tab-wrap"
                          title={`Open LP records — ${f.name}`}
                          onClick={e => { e.stopPropagation(); openFacility(f) }}
                        ><span className="folder-tab">{f.name}</span></td>
                        <td title={f.agentBank}>{f.agentBank}</td>
                        <td className="num">{f.lps?.toLocaleString() ?? '—'}</td>
                        <td>{f.accountNumber}</td>
                        <td className="num">{f.loanAmount}</td>
                        <td className="num">{f.ubsParticipation}</td>
                        <td>{f.maturityDate}</td>
                        <td>{f.collateralDate}</td>
                        <td><span style={{ fontWeight: 600, color }}>● {f.status}</span></td>
                        {/* An explicit run date, with the relative form ("2d ago") kept on hover. A
                            facility can carry BB figures without a run timestamp — mark those rather
                            than showing a bare dash that reads as "never run". */}
                        <td title={f.lastRunAt ? `Last run ${f.lastRun}` : undefined}>
                          {f.lastRunAt
                            // Accented like a KPI tile's value — the run date is what the row is read for.
                            // The dash stays plain: there is no value to accent when nothing has run.
                            ? <span style={{ fontWeight: 700, color: LAST_RUN_BLUE }}>{formatFullDate(f.lastRunAt)}</span>
                            : f.hasShadowBB
                              ? <span title="Existing Shadow BB — no run date recorded" style={{ padding: '2px 5px', borderRadius: 8, background: '#e8f1fb', color: LAST_RUN_BLUE, fontSize: 9, fontWeight: 700, letterSpacing: '.03em' }}>◆ BB</span>
                              : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {visibleFacilities.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '60px 0', fontSize: 13 }}>
                No facilities match "{facSearch}"
              </div>
            )}
          </div>
          <div className="tbl-footer">
            <span>Showing {facPage.from}–{facPage.to} of {facPage.total}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {facPage.total > 15 && (
                <select
                  value={facPage.pageSize}
                  onChange={e => facPage.setPageSize(Number(e.target.value))}
                  style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}
                >
                  {PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}
                </select>
              )}
              {facPage.totalPages > 1 && (
                <>
                  <Button variant="secondary" size="sm" disabled={facPage.page === 1} onClick={() => facPage.setPage(facPage.page - 1)}>&#x2039; Prev</Button>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Page {facPage.page} of {facPage.totalPages}</span>
                  <Button size="sm" disabled={facPage.page === facPage.totalPages} onClick={() => facPage.setPage(facPage.page + 1)}>Next &#x203A;</Button>
                </>
              )}
            </div>
          </div>
        </Card>

        <FacilityDetailOverlay
          facility={editingFacility}
          open={!!editingFacility}
          onClose={() => setEditingFacility(null)}
          onSave={handleFacilitySave}
          onDeactivate={handleFacilityDeactivate}
        />
      </div>
    )
  }

  // ── LP list view ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))', padding: '16px 24px 24px', overflow: 'hidden' }}>

      <Card style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} bodyStyle={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="filter-bar" style={{ padding: '8px 18px' }}>
          <button
            onClick={backToGrid}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12, fontWeight: 600, padding: '0 4px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            &#x2190; Facilities
          </button>
          <span style={{ color: 'var(--border)' }}>|</span>
          {/* The facility you drilled into keeps wearing the tab you clicked, held in its
              highlighted state — the folder is open. "All Facilities" is no one folder, so it
              stays plain text. */}
          {facFilter ? (
            <span className="folder-tab-wrap folder-tab-wrap-inline folder-tab-wrap-open">
              <span className="folder-tab folder-tab-open" title={facFilter.name}>{facFilter.name}</span>
            </span>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>All Facilities</span>
          )}
          {facFilter && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {facFilter.agentBank}</span>
          )}
          <span style={{ color: 'var(--border)' }}>|</span>
          <input
            type="text"
            placeholder="Search LP name, parent…"
            style={{ width: 240 }}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          <select style={{ width: 160 }} value={clsFilter} onChange={e => { setClsFilter(e.target.value); setPage(1) }}>
            {(classCfg?.CLS_OPTS ?? []).map(o => <option key={o} value={o}>{o || 'Classification: All'}</option>)}
          </select>
          <InfoTip title="LP Category" items={clsLegendItems} align="left" width={330} />
          <select style={{ width: 170 }} value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}>
            <option value="">Investor Type: All</option>
            {(classCfg?.INVESTOR_TYPE_OPTS ?? []).filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select style={{ width: 130 }} value={incFilter} onChange={e => { setIncFilter(e.target.value); setPage(1) }}>
            <option value="">Included: All</option>
            <option value="Y">Included (Y)</option>
            <option value="N">Excluded from BB</option>
          </select>
          {facFilter && (
            <span
              onClick={facFilter.status === 'Inactive' ? explainInactiveRerun : undefined}
              style={{ display: 'inline-flex', cursor: facFilter.status === 'Inactive' ? 'not-allowed' : undefined }}
              title={facFilter.status === 'Inactive' ? 'Re-run is unavailable while the facility is inactive' : undefined}
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRerunShadowBB}
                disabled={rerunning || lpData.length === 0 || facFilter.status === 'Inactive'}
                style={facFilter.status === 'Inactive' ? { pointerEvents: 'none' } : undefined}
              >
                {rerunning ? 'Re-running...' : 'Re-run Shadow BB'}
              </Button>
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportLpRecords}
            disabled={exporting}
            title="Downloads every LP record, ignoring the filters above"
          >
            {exporting ? 'Exporting…' : <>&#x2193; Export</>}
          </Button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
            {filtered.length} of {lpData.length} LPs
          </span>
        </div>

        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ height: '100%', minWidth: 0, overflowY: 'auto' }}>
            <div className="data-table-wrap">
        <table className="data-table dense" style={{ tableLayout: 'fixed', minWidth: visibleTableWidth, width: visibleTableWidth }}>
          <thead>
            <tr>
              {facFilter && (
                <SortableHeader sortKey="rank" sort={sort} onSort={requestSort} className="num" style={{ width: widths.rank }} onResizeStart={onResizeStart}>Rank</SortableHeader>
              )}
              {!facFilter && (
                <SortableHeader sortKey="facility" sort={sort} onSort={requestSort} style={{ width: widths.facility }} onResizeStart={onResizeStart}>Facility</SortableHeader>
              )}
              <SortableHeader sortKey="name"           sort={sort} onSort={requestSort} style={{ width: widths.name }}                          onResizeStart={onResizeStart}>Investor Name</SortableHeader>
              <SortableHeader sortKey="parent"         sort={sort} onSort={requestSort} style={{ width: widths.parent }}                        onResizeStart={onResizeStart}>Parent</SortableHeader>
              <SortableHeader sortKey="spv"            sort={sort} onSort={requestSort} style={{ width: widths.spv }}                           onResizeStart={onResizeStart}>SPV</SortableHeader>
              <SortableHeader sortKey="region"         sort={sort} onSort={requestSort} style={{ width: widths.region }}                        onResizeStart={onResizeStart}>Region / Location</SortableHeader>
              <SortableHeader sortKey="investorType"   sort={sort} onSort={requestSort} style={{ width: widths.investorType }}                  onResizeStart={onResizeStart}>Investor Type</SortableHeader>
              <SortableHeader sortKey="instHnw"        sort={sort} onSort={requestSort} style={{ width: widths.instHnw }}                       onResizeStart={onResizeStart}>Institutional vs HNW</SortableHeader>
              <SortableHeader sortKey="agentLpCategory"       sort={sort} onSort={requestSort} style={{ width: widths.agentLpCategory }}                      onResizeStart={onResizeStart}>Agent LP Classification</SortableHeader>
              <SortableHeader sortKey="cls"            sort={sort} onSort={requestSort} style={{ width: widths.cls }}                           onResizeStart={onResizeStart}>UBS LP Classification</SortableHeader>
              <SortableHeader sortKey="inc"            sort={sort} onSort={requestSort} style={{ width: widths.inc, textAlign: 'center' }}      onResizeStart={onResizeStart}>Eligible</SortableHeader>
              <SortableHeader sortKey="ig"             sort={sort} onSort={requestSort} style={{ width: widths.ig }}                            onResizeStart={onResizeStart}>Investment Grade</SortableHeader>
              <SortableHeader sortKey="sp"             sort={sort} onSort={requestSort} style={{ width: widths.sp }}                            onResizeStart={onResizeStart}>S&amp;P</SortableHeader>
              <SortableHeader sortKey="mdy"            sort={sort} onSort={requestSort} style={{ width: widths.mdy }}                           onResizeStart={onResizeStart}>Moody's</SortableHeader>
              <SortableHeader sortKey="fitch"          sort={sort} onSort={requestSort} style={{ width: widths.fitch }}                         onResizeStart={onResizeStart}>Fitch</SortableHeader>
              <SortableHeader sortKey="lpSize"         sort={sort} onSort={requestSort} className="num" style={{ width: widths.lpSize }}        onResizeStart={onResizeStart}>LP Size</SortableHeader>
              <SortableHeader sortKey="sizeMeasure"    sort={sort} onSort={requestSort} style={{ width: widths.sizeMeasure }}                   onResizeStart={onResizeStart}>Size Measure</SortableHeader>
              <SortableHeader sortKey="capitalCommitment"      sort={sort} onSort={requestSort} className="num" style={{ width: widths.capitalCommitment }}     onResizeStart={onResizeStart}>Capital Commitments</SortableHeader>
              <SortableHeader sortKey="pctOfFundCommitments"   sort={sort} onSort={requestSort} className="num" style={{ width: widths.pctOfFundCommitments }}  onResizeStart={onResizeStart}>% of Commitments</SortableHeader>
              <SortableHeader sortKey="calledCapital"      sort={sort} onSort={requestSort} className="num" style={{ width: widths.calledCapital }}     onResizeStart={onResizeStart}>Called Capital</SortableHeader>
              <SortableHeader sortKey="uc"             sort={sort} onSort={requestSort} className="num" style={{ width: widths.uc }}            onResizeStart={onResizeStart}>Uncalled Capital</SortableHeader>
              <SortableHeader sortKey="pctOfFundUncalled"    sort={sort} onSort={requestSort} className="num" style={{ width: widths.pctOfFundUncalled }}   onResizeStart={onResizeStart}>% of Uncalled Capital</SortableHeader>
              <SortableHeader sortKey="pctLpCalled"      sort={sort} onSort={requestSort} className="num" style={{ width: widths.pctLpCalled }}     onResizeStart={onResizeStart}>% of LP Called</SortableHeader>
              <SortableHeader sortKey="agentAdvanceRate"      sort={sort} onSort={requestSort} className="num" style={{ width: widths.agentAdvanceRate }}     onResizeStart={onResizeStart}>Agent Advance Rate</SortableHeader>
              <SortableHeader sortKey="rate"           sort={sort} onSort={requestSort} className="num" style={{ width: widths.rate }}          onResizeStart={onResizeStart}>UBS Advance Rate</SortableHeader>
              <SortableHeader sortKey="agentConcentrationLimit" sort={sort} onSort={requestSort} className="num" style={{ width: widths.agentConcentrationLimit }} onResizeStart={onResizeStart}>Agent Concentration Limit</SortableHeader>
              <SortableHeader sortKey="ubsConcentrationLimit"   sort={sort} onSort={requestSort} className="num" style={{ width: widths.ubsConcentrationLimit }}   onResizeStart={onResizeStart}>UBS Concentration Limit</SortableHeader>
              <SortableHeader sortKey="agentExcess"    sort={sort} onSort={requestSort} className="num" style={{ width: widths.agentExcess }}   onResizeStart={onResizeStart}>Agent Excess Concentration</SortableHeader>
              <SortableHeader sortKey="ubsExcess"      sort={sort} onSort={requestSort} className="num" style={{ width: widths.ubsExcess }}     onResizeStart={onResizeStart}>UBS Excess Concentration</SortableHeader>
              <SortableHeader sortKey="abb"            sort={sort} onSort={requestSort} className="num" style={{ width: widths.abb }}           onResizeStart={onResizeStart}>Agent Borrowing Base</SortableHeader>
              <SortableHeader sortKey="ubb"            sort={sort} onSort={requestSort} className="num" style={{ width: widths.ubb }}           onResizeStart={onResizeStart}>UBS Borrowing Base</SortableHeader>
              <SortableHeader sortKey="notes"          sort={sort} onSort={requestSort} style={{ width: widths.notes }}                         onResizeStart={onResizeStart}>Notes</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((LPRecord, i) => {
              const sizeMeasure = LPRecord.aum ? 'AUM' : LPRecord.nav ? 'NAV' : LPRecord.pensionAssets ? 'Assets' : '—'
              const lpSizeVal   = LPRecord.aum || LPRecord.nav || LPRecord.pensionAssets || '—'
              const instHnw     = (LPRecord.institutionalOrHnw === 'HNW' ? 'HNW' : LPRecord.institutionalOrHnw ? 'Institutional' : '—')
              const rowKey = LPRecord.id != null
                ? `lp-${LPRecord.id}`
                : [
                    LPRecord.investorName ?? 'LPRecord',
                    LPRecord.parent ?? '',
                    LPRecord.regionLocation ?? '',
                    LPRecord.ubsLpCategory ?? '',
                    i,
                  ].join('|')
              return (
              <tr key={rowKey} className={selected === LPRecord ? 'data-table-row-selected' : undefined} onClick={() => setSelected(LPRecord)} style={{ cursor: 'pointer' }}>
                {facFilter && <td className="num">{LPRecord.lpRank ?? '—'}</td>}
                {!facFilter && (() => {
                  // Same folder tab as the facility picker, and it does the same thing: opens that
                  // facility's records. A row whose facility is missing from the list keeps a plain
                  // dash — a tab has to be openable.
                  const fac = LPRecord.facilityId != null ? facilityById.get(LPRecord.facilityId) : undefined
                  return fac
                    ? <td className="drill-cell folder-tab-wrap" title={`Open LP records — ${fac.name}`}
                          onClick={e => { e.stopPropagation(); openFacility(fac) }}>
                        <span className="folder-tab">{fac.name}</span>
                      </td>
                    : <td title={facilityLabel(LPRecord)} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{facilityLabel(LPRecord)}</td>
                })()}
                <td title={LPRecord.investorName} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong>{LPRecord.investorName}</strong>
                  {LPRecord.reclassified && <span className="rcl-badge" title="Reclassified" aria-label="Reclassified">R</span>}
                  {LPRecord.transferee  && <span className="tf-badge">T</span>}
                </td>
                <td title={LPRecord.parent} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--muted)' }}>{LPRecord.parent || '—'}</td>
                <td>{LPRecord.spv ? 'Yes' : 'No'}</td>
                <td>{formatRegion(LPRecord.regionLocation) || '—'}</td>
                <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{LPRecord.investorType || '—'}</td>
                <td>{instHnw}</td>
                <td title={LPRecord.agentLpCategory || '—'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{LPRecord.agentLpCategory || '—'}</td>
                <td><Tag>{LPRecord.ubsLpCategory}</Tag></td>
                <td style={{ textAlign: 'center' }}><span style={{ fontWeight: 600, fontSize: 11, padding: '2px 7px', borderRadius: 10, background: LPRecord.included ? '#e6f4ea' : 'var(--tbl)', color: LPRecord.included ? 'var(--green)' : 'var(--muted)' }}>{LPRecord.included ? 'Yes' : 'No'}</span></td>
                <td>{LPRecord.investmentGrade ? 'Yes' : 'No'}</td>
                <td>{LPRecord.spRating || '—'}</td>
                <td>{LPRecord.moodysRating || '—'}</td>
                <td>{LPRecord.fitchRating || '—'}</td>
                <td className="num">{lpSizeFormat(lpSizeVal)}</td>
                <td>{sizeMeasure}</td>
                <td className="num">{tableMoney(LPRecord.capitalCommitment)}</td>
                <td className="num">{formatPercentageFraction(LPRecord.pctOfFundCommitments ?? NaN)}</td>
                <td className="num">{tableMoney(LPRecord.calledCapital)}</td>
                <td className="num">{tableMoney(LPRecord.uncalledCapital)}</td>
                <td className="num">{formatPercentageFraction(LPRecord.pctOfFundUncalled ?? NaN)}</td>
                <td className="num">{formatPercentageFraction(LPRecord.pctLpCalled ?? NaN)}</td>
                <td className="num">{formatPercentageFraction(LPRecord.agentAdvanceRate ?? NaN)}</td>
                <td className="num">{formatPercentageFraction(LPRecord.ubsAdvanceRate ?? NaN)}</td>
                <td className="num">{LPRecord.agentConcentrationLimit || '—'}</td>
                <td className="num">{LPRecord.ubsConcentrationLimit || '—'}</td>
                <td className="num">{tableMoney(LPRecord.agentExcessConcentration)}</td>
                <td className="num">{tableMoney(LPRecord.ubsExcessConcentration)}</td>
                <td className={`num ${!LPRecord.agentBorrowingBase || LPRecord.agentBorrowingBase === '$0' ? 'zero' : ''}`}>{tableMoney(LPRecord.agentBorrowingBase)}</td>
                <td className={`num ${LPRecord.ubsBorrowingBase === '$0' ? 'zero' : ''}`}>{tableMoney(LPRecord.ubsBorrowingBase)}</td>
                <td title={LPRecord.notes || '—'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{LPRecord.notes || '—'}</td>
              </tr>
              )
            })}
          </tbody>
        </table>
            </div>
        <div className="tbl-footer">
          <span>Showing {from}–{to} of {filtered.length}</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {total > 15 && (
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}
            >
              {PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>
            )}
            {totalPages > 1 && (
              <>
                <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>&#x2039; Prev</Button>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Page {page} of {totalPages}</span>
                <Button size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next &#x203A;</Button>
              </>
            )}
          </div>
        </div>
      </div>

        </div>
      </Card>

      {selected && (
        <DraggablePanel className="LPRecord-detail-overlay" storageKey="lp-master-detail">
          <LPRecordPanel
            LPRecord={selected}
            open={!!selected}
            onClose={() => setSelected(null)}
            onSave={handleSave}
            onDelete={canEdit ? handleDelete : undefined}
            canEdit={canEdit}
            showRank={Boolean(facFilter)}
            totalUncalledM={lpData.reduce((sum, row) => sum + ((parseMoneyToNumber(row.uncalledCapital) ?? 0) / 1_000_000), 0)}
          />
        </DraggablePanel>
      )}

    </div>
  )
}
