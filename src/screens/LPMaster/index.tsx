import { useState, useMemo, useEffect } from 'react'
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
import { formatUsdNoDecimals, getFacilities, parseMoneyToNumber } from '../../services/facilityService'
import { api, type LpClassificationRequest } from '../../services/api'
import { getLPs, getLPsForFacility } from '../../services/lpService'
import type { FacilityRow } from '../../services/facilityService'
import type { LPRecord } from '../../services/lpService'

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

function pctNumber(value: unknown): number | undefined {
  const s = String(value ?? '').trim()
  if (!s || s === '—') return undefined
  const n = parseFloat(s.replace('%', ''))
  return Number.isFinite(n) ? n : undefined
}

function lpClassificationRow(LPRecord: LPRecord, originalName?: string): LpClassificationRequest['rows'][number] {
  return {
    name:              LPRecord.name,
    originalName,
    parent:            LPRecord.parent ?? '',
    spv:               LPRecord.spv,
    fundSleeve:        LPRecord.fundSleeve ?? '',
    investorType:      LPRecord.investorType ?? '',
    instVsHnw:         LPRecord.instVsHnw,
    region:            LPRecord.region ?? '',
    ig:                LPRecord.ig,
    cls:               LPRecord.cls,
    agentCls:          LPRecord.agentCls ?? '',
    sp:                LPRecord.sp ?? '',
    mdy:               LPRecord.mdy ?? '',
    fitch:             LPRecord.fitch ?? '',
    aum:               LPRecord.aum ?? '',
    nav:               LPRecord.nav ?? '',
    pension:           LPRecord.pension ?? '',
    pensionFunded:     LPRecord.pensionFunded ?? '',
    capCommit:         LPRecord.capCommit ?? '',
    uc:                LPRecord.uc ?? '',
    ubsAdvRatePct:     pctNumber(LPRecord.rate),
    agentRatePct:      pctNumber(LPRecord.agentRate),
    ubsConcLimitPct:   pctNumber(LPRecord.ubsConc),
    agentConcLimitPct: pctNumber(LPRecord.agentConc),
    inc:               LPRecord.inc,
    notes:             LPRecord.notes ?? '',
  }
}

// Status colour mapping for facility cards
const STATUS_COLOR: Record<string, string> = {
  'Active':        'var(--green)',
  'In Progress':   'var(--red)',
  'Needs Review':  'var(--amber)',
  'Not Started':   'var(--muted)',
  'Pending':       '#e65100',
  'Review':        '#c2185b',
  'Inactive':      '#9e9e9e',
}

// ── Facility grid card ────────────────────────────────────────────────────────
function FacilityCard({ facility, onClick, onEdit, canEdit }: { facility: FacilityRow; onClick: () => void; onEdit: (f: FacilityRow) => void; canEdit: boolean }) {
  const color = STATUS_COLOR[facility.status] ?? 'var(--muted)'
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
        borderLeft: `4px solid ${color}`,
        position: 'relative',
        padding: '14px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
        transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.10)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}
    >
      <div style={{ paddingRight: canEdit ? 24 : 0, minWidth: 0 }}>
        <div title={facility.name} style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {facility.name}
        </div>
        {canEdit && (
          <button
            onClick={e => { e.stopPropagation(); onEdit(facility) }}
            title="Edit facility details"
            style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, lineHeight: 1, padding: 2 }}
          >&#9998;</button>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{facility.agentBank}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>
          {facility.lps?.toLocaleString() ?? '—'}
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>LPs</span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color }}>● {facility.status}</span>
      </div>
    </div>
  )
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
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`
}

function FacilityDetailOverlay({ facility, open, onClose, onSave, onDeactivate, onDelete }: {
  facility: FacilityRow | null
  open: boolean
  onClose: () => void
  onSave: (f: FacilityRow) => void
  onDeactivate: (f: FacilityRow, status: 'Inactive' | 'Not Started') => void
  onDelete: (f: FacilityRow) => void
}) {
  const [form, setForm] = useState<FacilityForm>({
    name: '', agentBank: '', accountNumber: '', loanAmount: '', ubsParticipation: '', ubsParticipationRate: '', maturityDate: '', collateralDate: '',
  })
  const [draftFields, setDraftFields] = useState<Record<DraftFieldKey, boolean>>({ ubsParticipation: false, ubsParticipationRate: false })
  const [confirmDelete, setConfirmDelete] = useState(false)

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
    setConfirmDelete(false)
  }, [facility?.id])

  if (!open || !facility) return null

  // A facility may only be deactivated or deleted while it holds no LP records.
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

  const footer = confirmDelete ? (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
      <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>Delete "{facility.name}" permanently? This cannot be undone.</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
        <Button variant="danger" onClick={() => onDelete(facility)}>Confirm Delete</Button>
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {isInactive ? (
          <Button variant="secondary" onClick={() => onDeactivate(facility, 'Not Started')}>Reactivate</Button>
        ) : (
          <Button variant="secondary" onClick={() => onDeactivate(facility, 'Inactive')} disabled={hasLPs}
                  title={hasLPs ? 'Remove all LP records before deactivating' : undefined}>Deactivate</Button>
        )}
        <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={hasLPs}
                title={hasLPs ? 'Remove all LP records before deleting' : undefined}>Delete</Button>
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
        {hasLPs && <span style={{ marginLeft: 8, color: 'var(--amber)' }}>· deactivate / delete disabled while LP records exist</span>}
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
        {ro('Facility Status Date', facility.facilityStatusDate)}

      </div>
    </Modal>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function LPMaster() {
  const { toast, lpData, setLpData, currentUser, setActiveFacilityId, setTargetFacility } = useApp()
  const canEdit = currentUser?.role === 'Analyst' || currentUser?.role === 'Account/Transaction Manager'

  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  const [classCfg,   setClassCfg]   = useState<ClassificationConfig | null>(null)
  useEffect(() => {
    getFacilities().then(setFacilities).catch(() => {})
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

  const visibleFacilities = useMemo(() => {
    const q = facSearch.toLowerCase()
    return q ? facilities.filter(f => f.name.toLowerCase().includes(q) || f.agentBank.toLowerCase().includes(q)) : facilities
  }, [facilities, facSearch])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return lpData.filter(LPRecord => {
      const matchQ    = !q || (LPRecord.name ?? '').toLowerCase().includes(q) || (LPRecord.parent ?? '').toLowerCase().includes(q)
      const matchCls  = !clsFilter  || LPRecord.cls === clsFilter
      const matchType = !typeFilter || (LPRecord.investorType ?? '') === typeFilter
      const matchInc  = !incFilter  || (incFilter === 'Y' ? LPRecord.inc : !LPRecord.inc)
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
  const sortColumns = useMemo(() => [
    { key: 'rank',         getValue: (LPRecord: LPRecord) => LPRecord.rank ?? null },
    { key: 'name',         getValue: (LPRecord: LPRecord) => LPRecord.name },
    { key: 'fundSleeve',   getValue: (LPRecord: LPRecord) => LPRecord.fundSleeve ?? '' },
    { key: 'parent',       getValue: (LPRecord: LPRecord) => LPRecord.parent ?? '' },
    { key: 'spv',          getValue: (LPRecord: LPRecord) => LPRecord.spv ? 'Yes' : 'No' },
    { key: 'region',       getValue: (LPRecord: LPRecord) => formatRegion(LPRecord.region) },
    { key: 'investorType', getValue: (LPRecord: LPRecord) => LPRecord.investorType ?? '' },
    { key: 'instHnw',      getValue: (LPRecord: LPRecord) => LPRecord.instVsHnw === 'HNW' ? 'HNW' : 'Institutional' },
    { key: 'agentCls',     getValue: (LPRecord: LPRecord) => LPRecord.agentCls ?? '' },
    { key: 'cls',          getValue: (LPRecord: LPRecord) => `${LPRecord.cls ?? ''}\u0000${LPRecord.name ?? ''}` },
    { key: 'inc',          getValue: (LPRecord: LPRecord) => LPRecord.inc ? 'Yes' : 'No' },
    { key: 'ig',           getValue: (LPRecord: LPRecord) => LPRecord.ig ? 'Yes' : 'No' },
    { key: 'sp',           getValue: (LPRecord: LPRecord) => LPRecord.sp ?? '' },
    { key: 'mdy',          getValue: (LPRecord: LPRecord) => LPRecord.mdy ?? '' },
    { key: 'fitch',        getValue: (LPRecord: LPRecord) => LPRecord.fitch ?? '' },
    { key: 'lpSize',       getValue: (LPRecord: LPRecord) => LPRecord.aum || LPRecord.nav || LPRecord.pension || '' },
    { key: 'sizeMeasure',  getValue: (LPRecord: LPRecord) => LPRecord.aum ? 'AUM' : LPRecord.nav ? 'NAV' : LPRecord.pension ? 'Assets' : '' },
    { key: 'capCommit',    getValue: (LPRecord: LPRecord) => LPRecord.capCommit ?? '' },
    { key: 'pctCapCommit', getValue: (LPRecord: LPRecord) => LPRecord.pctCapCommit ?? '' },
    { key: 'calledCap',    getValue: (LPRecord: LPRecord) => LPRecord.calledCap ?? '' },
    { key: 'uc',           getValue: (LPRecord: LPRecord) => LPRecord.uc ?? '' },
    { key: 'pctUncalled',  getValue: (LPRecord: LPRecord) => LPRecord.pctUncalled ?? '' },
    { key: 'pctCalled',    getValue: (LPRecord: LPRecord) => LPRecord.pctCalled ?? '' },
    { key: 'agentRate',    getValue: (LPRecord: LPRecord) => LPRecord.agentRate ?? '' },
    { key: 'rate',         getValue: (LPRecord: LPRecord) => LPRecord.rate ?? '' },
    { key: 'agentConc',    getValue: (LPRecord: LPRecord) => LPRecord.agentConc ?? '' },
    { key: 'ubsConc',      getValue: (LPRecord: LPRecord) => LPRecord.ubsConc ?? '' },
    { key: 'agentExcess',  getValue: (LPRecord: LPRecord) => LPRecord.agentExcessConc ?? '' },
    { key: 'ubsExcess',    getValue: (LPRecord: LPRecord) => LPRecord.ubsExcessConc ?? '' },
    { key: 'abb',          getValue: (LPRecord: LPRecord) => LPRecord.abb ?? '' },
    { key: 'ubb',          getValue: (LPRecord: LPRecord) => LPRecord.ubb ?? '' },
    { key: 'notes',        getValue: (LPRecord: LPRecord) => LPRecord.notes ?? '' },
  ], [])
  const { sort, sortedRows, requestSort } = useSortableRows(filtered, sortColumns, { key: 'cls', direction: 'asc' })
  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(sortedRows)
  const { widths, onResizeStart, tableWidth } = useColumnResize('lp-master', {
    rank: 64,
    name: 220, fundSleeve: 140, parent: 160, spv: 54,
    region: 140, investorType: 140, instHnw: 122, agentCls: 166, cls: 174,
    inc: 72, ig: 114, sp: 76, mdy: 84, fitch: 76,
    lpSize: 144, sizeMeasure: 117, capCommit: 138, pctCapCommit: 132,
    calledCap: 116, uc: 126, pctUncalled: 128, pctCalled: 104,
    agentRate: 120, rate: 114, agentConc: 158, ubsConc: 144,
    agentExcess: 174, ubsExcess: 154, abb: 133, ubb: 123, notes: 180,
  })
  const handleSave = async (updated: LPRecord) => {
    const originalName = selected?.name
    setLpData(lpData.map(LPRecord => LPRecord.name === originalName ? updated : LPRecord))
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
    toast(`LP record updated — ${updated.name}.`)
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

  // Permanently delete a facility (only reachable when it has no LP records).
  const handleFacilityDelete = async (target: FacilityRow) => {
    if (target.id != null) {
      try {
        await api.facilities.remove(target.id)
      } catch (e) {
        toast(e instanceof Error && e.message ? e.message : 'Could not delete facility — API unavailable.')
        return
      }
    }
    setFacilities(prev => prev.filter(f => f.id !== target.id))
    setEditingFacility(null)
    toast(`Facility deleted — ${target.name}.`)
  }

  const handleRerunShadowBB = async () => {
    if (!facFilter?.id) return
    setRerunning(true)
    try {
      const snapshot = await api.bb.run(facFilter.id)
      const refreshedLPs = await getLPsForFacility(facFilter.id)
      setLpData(refreshedLPs)
      if (selected) {
        const refreshedSelected = refreshedLPs.find(lp => lp.name === selected.name) ?? null
        setSelected(refreshedSelected)
      }
      const refreshedFacilities = await getFacilities()
      setFacilities(refreshedFacilities)
      setTargetFacility(facFilter.name)
      const summary = snapshot.result.summary
      toast(`Shadow BB re-run complete — UBS BB ${formatUsdNoDecimals(summary.totalUBB * 1_000_000)}.`)
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'Could not re-run Shadow BB — API unavailable.')
    } finally {
      setRerunning(false)
    }
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
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
              {visibleFacilities.length} of {facilities.length} facilities
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {visibleFacilities.map(f => (
                <FacilityCard key={f.name} facility={f} canEdit={canEdit} onClick={() => openFacility(f)} onEdit={setEditingFacility} />
              ))}
            </div>
            {visibleFacilities.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '60px 0', fontSize: 13 }}>
                No facilities match "{facSearch}"
              </div>
            )}
          </div>
        </Card>

        <FacilityDetailOverlay
          facility={editingFacility}
          open={!!editingFacility}
          onClose={() => setEditingFacility(null)}
          onSave={handleFacilitySave}
          onDeactivate={handleFacilityDeactivate}
          onDelete={handleFacilityDelete}
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
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>
            {facFilter ? facFilter.name : 'All Facilities'}
          </span>
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
            <Button variant="secondary" size="sm" onClick={handleRerunShadowBB} disabled={rerunning || lpData.length === 0}>
              {rerunning ? 'Re-running...' : 'Re-run Shadow BB'}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => toast('LPRecord master exported to Excel.')}>&#x2193; Export</Button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
            {filtered.length} of {lpData.length} LPs
          </span>
        </div>

        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ height: '100%', minWidth: 0, overflowY: 'auto' }}>
            <div className="data-table-wrap">
        <table className="data-table dense" style={{ tableLayout: 'fixed', minWidth: tableWidth, width: tableWidth }}>
          <thead>
            <tr>
              <SortableHeader sortKey="rank"           sort={sort} onSort={requestSort} className="num" style={{ width: widths.rank }} onResizeStart={onResizeStart}>Rank</SortableHeader>
              <SortableHeader sortKey="name"           sort={sort} onSort={requestSort} style={{ width: widths.name }}                          onResizeStart={onResizeStart}>Investor Name</SortableHeader>
              <SortableHeader sortKey="fundSleeve"     sort={sort} onSort={requestSort} style={{ width: widths.fundSleeve }}                    onResizeStart={onResizeStart}>Fund Sleeve</SortableHeader>
              <SortableHeader sortKey="parent"         sort={sort} onSort={requestSort} style={{ width: widths.parent }}                        onResizeStart={onResizeStart}>Parent</SortableHeader>
              <SortableHeader sortKey="spv"            sort={sort} onSort={requestSort} style={{ width: widths.spv }}                           onResizeStart={onResizeStart}>SPV</SortableHeader>
              <SortableHeader sortKey="region"         sort={sort} onSort={requestSort} style={{ width: widths.region }}                        onResizeStart={onResizeStart}>Region / Location</SortableHeader>
              <SortableHeader sortKey="investorType"   sort={sort} onSort={requestSort} style={{ width: widths.investorType }}                  onResizeStart={onResizeStart}>Investor Type</SortableHeader>
              <SortableHeader sortKey="instHnw"        sort={sort} onSort={requestSort} style={{ width: widths.instHnw }}                       onResizeStart={onResizeStart}>Institutional vs HNW</SortableHeader>
              <SortableHeader sortKey="agentCls"       sort={sort} onSort={requestSort} style={{ width: widths.agentCls }}                      onResizeStart={onResizeStart}>Agent LP Classification</SortableHeader>
              <SortableHeader sortKey="cls"            sort={sort} onSort={requestSort} style={{ width: widths.cls }}                           onResizeStart={onResizeStart}>UBS LP Classification</SortableHeader>
              <SortableHeader sortKey="inc"            sort={sort} onSort={requestSort} style={{ width: widths.inc, textAlign: 'center' }}      onResizeStart={onResizeStart}>Eligible</SortableHeader>
              <SortableHeader sortKey="ig"             sort={sort} onSort={requestSort} style={{ width: widths.ig }}                            onResizeStart={onResizeStart}>Investment Grade</SortableHeader>
              <SortableHeader sortKey="sp"             sort={sort} onSort={requestSort} style={{ width: widths.sp }}                            onResizeStart={onResizeStart}>S&amp;P</SortableHeader>
              <SortableHeader sortKey="mdy"            sort={sort} onSort={requestSort} style={{ width: widths.mdy }}                           onResizeStart={onResizeStart}>Moody's</SortableHeader>
              <SortableHeader sortKey="fitch"          sort={sort} onSort={requestSort} style={{ width: widths.fitch }}                         onResizeStart={onResizeStart}>Fitch</SortableHeader>
              <SortableHeader sortKey="lpSize"         sort={sort} onSort={requestSort} className="num" style={{ width: widths.lpSize }}        onResizeStart={onResizeStart}>LP Size</SortableHeader>
              <SortableHeader sortKey="sizeMeasure"    sort={sort} onSort={requestSort} style={{ width: widths.sizeMeasure }}                   onResizeStart={onResizeStart}>Size Measure</SortableHeader>
              <SortableHeader sortKey="capCommit"      sort={sort} onSort={requestSort} className="num" style={{ width: widths.capCommit }}     onResizeStart={onResizeStart}>Capital Commitments</SortableHeader>
              <SortableHeader sortKey="pctCapCommit"   sort={sort} onSort={requestSort} className="num" style={{ width: widths.pctCapCommit }}  onResizeStart={onResizeStart}>% of Commitments</SortableHeader>
              <SortableHeader sortKey="calledCap"      sort={sort} onSort={requestSort} className="num" style={{ width: widths.calledCap }}     onResizeStart={onResizeStart}>Called Capital</SortableHeader>
              <SortableHeader sortKey="uc"             sort={sort} onSort={requestSort} className="num" style={{ width: widths.uc }}            onResizeStart={onResizeStart}>Uncalled Capital</SortableHeader>
              <SortableHeader sortKey="pctUncalled"    sort={sort} onSort={requestSort} className="num" style={{ width: widths.pctUncalled }}   onResizeStart={onResizeStart}>% of Uncalled Capital</SortableHeader>
              <SortableHeader sortKey="pctCalled"      sort={sort} onSort={requestSort} className="num" style={{ width: widths.pctCalled }}     onResizeStart={onResizeStart}>% of LP Called</SortableHeader>
              <SortableHeader sortKey="agentRate"      sort={sort} onSort={requestSort} className="num" style={{ width: widths.agentRate }}     onResizeStart={onResizeStart}>Agent Advance Rate</SortableHeader>
              <SortableHeader sortKey="rate"           sort={sort} onSort={requestSort} className="num" style={{ width: widths.rate }}          onResizeStart={onResizeStart}>UBS Advance Rate</SortableHeader>
              <SortableHeader sortKey="agentConc"      sort={sort} onSort={requestSort} className="num" style={{ width: widths.agentConc }}     onResizeStart={onResizeStart}>Agent Concentration Limit</SortableHeader>
              <SortableHeader sortKey="ubsConc"        sort={sort} onSort={requestSort} className="num" style={{ width: widths.ubsConc }}       onResizeStart={onResizeStart}>UBS Concentration Limit</SortableHeader>
              <SortableHeader sortKey="agentExcess"    sort={sort} onSort={requestSort} className="num" style={{ width: widths.agentExcess }}   onResizeStart={onResizeStart}>Agent Excess Concentration</SortableHeader>
              <SortableHeader sortKey="ubsExcess"      sort={sort} onSort={requestSort} className="num" style={{ width: widths.ubsExcess }}     onResizeStart={onResizeStart}>UBS Excess Concentration</SortableHeader>
              <SortableHeader sortKey="abb"            sort={sort} onSort={requestSort} className="num" style={{ width: widths.abb }}           onResizeStart={onResizeStart}>Agent Borrowing Base</SortableHeader>
              <SortableHeader sortKey="ubb"            sort={sort} onSort={requestSort} className="num" style={{ width: widths.ubb }}           onResizeStart={onResizeStart}>UBS Borrowing Base</SortableHeader>
              <SortableHeader sortKey="notes"          sort={sort} onSort={requestSort} style={{ width: widths.notes }}                         onResizeStart={onResizeStart}>Notes</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((LPRecord, i) => {
              const sizeMeasure = LPRecord.aum ? 'AUM' : LPRecord.nav ? 'NAV' : LPRecord.pension ? 'Assets' : '—'
              const lpSizeVal   = LPRecord.aum || LPRecord.nav || LPRecord.pension || '—'
              const instHnw     = (LPRecord.instVsHnw === 'HNW' ? 'HNW' : LPRecord.instVsHnw ? 'Institutional' : '—')
              return (
              <tr key={LPRecord.name ?? `LPRecord-${i}`} className={selected?.name === LPRecord.name ? 'data-table-row-selected' : undefined} onClick={() => setSelected(LPRecord)} style={{ cursor: 'pointer' }}>
                <td className="num">{LPRecord.rank ?? '—'}</td>
                <td title={LPRecord.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong>{LPRecord.name}</strong>
                  {LPRecord.rcl && <span className="rcl-badge">R</span>}
                  {LPRecord.tf  && <span className="tf-badge">T</span>}
                </td>
                <td title={LPRecord.fundSleeve || '—'}>{LPRecord.fundSleeve || '—'}</td>
                <td title={LPRecord.parent} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--muted)' }}>{LPRecord.parent || '—'}</td>
                <td>{LPRecord.spv ? 'Yes' : 'No'}</td>
                <td>{formatRegion(LPRecord.region) || '—'}</td>
                <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{LPRecord.investorType || '—'}</td>
                <td>{instHnw}</td>
                <td title={LPRecord.agentCls || '—'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{LPRecord.agentCls || '—'}</td>
                <td><Tag>{LPRecord.cls}</Tag></td>
                <td style={{ textAlign: 'center' }}><span style={{ fontWeight: 600, fontSize: 11, padding: '2px 7px', borderRadius: 10, background: LPRecord.inc ? '#e6f4ea' : 'var(--tbl)', color: LPRecord.inc ? 'var(--green)' : 'var(--muted)' }}>{LPRecord.inc ? 'Yes' : 'No'}</span></td>
                <td>{LPRecord.ig ? 'Yes' : 'No'}</td>
                <td>{LPRecord.sp || '—'}</td>
                <td>{LPRecord.mdy || '—'}</td>
                <td>{LPRecord.fitch || '—'}</td>
                <td className="num">{tableMoney(lpSizeVal)}</td>
                <td>{sizeMeasure}</td>
                <td className="num">{tableMoney(LPRecord.capCommit)}</td>
                <td className="num">{LPRecord.pctCapCommit || '—'}</td>
                <td className="num">{tableMoney(LPRecord.calledCap)}</td>
                <td className="num">{tableMoney(LPRecord.uc)}</td>
                <td className="num">{LPRecord.pctUncalled || '—'}</td>
                <td className="num">{LPRecord.pctCalled || '—'}</td>
                <td className="num">{LPRecord.agentRate || '—'}</td>
                <td className="num">{LPRecord.rate || '—'}</td>
                <td className="num">{LPRecord.agentConc || '—'}</td>
                <td className="num">{LPRecord.ubsConc || '—'}</td>
                <td className="num">{tableMoney(LPRecord.agentExcessConc)}</td>
                <td className="num">{tableMoney(LPRecord.ubsExcessConc)}</td>
                <td className={`num ${!LPRecord.abb || LPRecord.abb === '$0' ? 'zero' : ''}`}>{tableMoney(LPRecord.abb)}</td>
                <td className={`num ${LPRecord.ubb === '$0' ? 'zero' : ''}`}>{tableMoney(LPRecord.ubb)}</td>
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
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}
            >
              {PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>
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
            canEdit={canEdit}
            enableReclassify
          />
        </DraggablePanel>
      )}

    </div>
  )
}
