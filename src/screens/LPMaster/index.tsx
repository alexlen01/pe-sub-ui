import { useState, useMemo, useEffect } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { SortableHeader, useSortableRows } from '../../hooks/useTableSort'
import { useColumnResize } from '../../hooks/useColumnResize'
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

function lpClassificationRow(lp: LPRecord, originalName?: string): LpClassificationRequest['rows'][number] {
  return {
    name:              lp.name,
    originalName,
    parent:            lp.parent ?? '',
    spv:               lp.spv,
    investorType:      lp.investorType ?? '',
    instVsHnw:         lp.type,
    type:              lp.type,
    region:            lp.region ?? '',
    ig:                lp.ig,
    cls:               lp.cls,
    agentCls:          lp.agentCls ?? '',
    sp:                lp.sp ?? '',
    mdy:               lp.mdy ?? '',
    fitch:             lp.fitch ?? '',
    aum:               lp.aum ?? '',
    nav:               lp.nav ?? '',
    pension:           lp.pension ?? '',
    pensionFunded:     lp.pensionFunded ?? '',
    capCommit:         lp.capCommit ?? '',
    uc:                lp.uc ?? '',
    ubsAdvRatePct:     pctNumber(lp.rate),
    agentRatePct:      pctNumber(lp.agentRate),
    ubsConcLimitPct:   pctNumber(lp.ubsConc),
    agentConcLimitPct: pctNumber(lp.agentConc),
    inc:               lp.inc,
    notes:             lp.notes ?? '',
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

type FacilityForm = { name: string; agentBank: string; accountNumber: string; loanAmount: string; ubsParticipation: string; maturityDate: string; collateralDate: string }
type TextKey = 'name' | 'agentBank' | 'accountNumber' | 'loanAmount' | 'ubsParticipation'

function FacilityDetailOverlay({ facility, open, onClose, onSave, onDeactivate, onDelete }: {
  facility: FacilityRow | null
  open: boolean
  onClose: () => void
  onSave: (f: FacilityRow) => void
  onDeactivate: (f: FacilityRow, status: 'Inactive' | 'Not Started') => void
  onDelete: (f: FacilityRow) => void
}) {
  const [form, setForm] = useState<FacilityForm>({
    name: '', agentBank: '', accountNumber: '', loanAmount: '', ubsParticipation: '', maturityDate: '', collateralDate: '',
  })
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!facility) return
    const clean = (v?: string | null) => (!v || v === '—' ? '' : v)
    setForm({
      name:             clean(facility.name),
      agentBank:        clean(facility.agentBank),
      accountNumber:    clean(facility.accountNumber),
      loanAmount:       moneyForFacilityEdit(facility.loanAmount),
      ubsParticipation: moneyForFacilityEdit(facility.ubsParticipation),
      maturityDate:     toISODate(clean(facility.maturityDate)),
      collateralDate:   toISODate(clean(facility.collateralDate)),
    })
    setConfirmDelete(false)
  }, [facility?.id])

  if (!open || !facility) return null

  // A facility may only be deactivated or deleted while it holds no LP records.
  const hasLPs    = (facility.lps ?? 0) > 0
  const isInactive = facility.status === 'Inactive'
  const nameValid  = form.name.trim().length > 0 && form.agentBank.trim().length > 0

  const set = (k: TextKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))
  const handleSave = () => onSave({ ...facility, ...form })

  const labelSt: React.CSSProperties = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 4, display: 'block' }
  const viewSt:  React.CSSProperties = { fontSize: 13, color: 'var(--navy)', minHeight: 26, display: 'flex', alignItems: 'center' }

  // Read-only field cell (functions, not components, to avoid input focus loss)
  const ro = (label: string, value: React.ReactNode, span?: boolean) => (
    <div key={label} style={span ? { gridColumn: '1 / -1' } : undefined}>
      <div style={labelSt}>{label}</div>
      <div style={viewSt}>{value ?? '—'}</div>
    </div>
  )
  const ed = (label: string, key: TextKey, span?: boolean) => (
    <div key={label} className="form-group" style={span ? { marginBottom: 0, gridColumn: '1 / -1' } : { marginBottom: 0 }}>
      <label style={labelSt}>{label}</label>
      <input type="text" style={{ width: '100%' }} value={form[key]} onChange={set(key)} aria-label={label} />
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
  const { toast, lpData, setLpData, currentUser, setActiveFacilityId } = useApp()
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
    return lpData.filter(lp => {
      const matchQ    = !q || (lp.name ?? '').toLowerCase().includes(q) || (lp.parent ?? '').toLowerCase().includes(q)
      const matchCls  = !clsFilter  || lp.cls === clsFilter
      const matchType = !typeFilter || (lp.investorType ?? '') === typeFilter
      const matchInc  = !incFilter  || (incFilter === 'Y' ? lp.inc : !lp.inc)
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
    { key: 'name',         getValue: (lp: LPRecord) => lp.name },
    { key: 'fundSleeve',   getValue: (lp: LPRecord) => lp.fundSleeve ?? '' },
    { key: 'parent',       getValue: (lp: LPRecord) => lp.parent ?? '' },
    { key: 'spv',          getValue: (lp: LPRecord) => lp.spv ? 'Yes' : 'No' },
    { key: 'region',       getValue: (lp: LPRecord) => lp.region ?? '' },
    { key: 'investorType', getValue: (lp: LPRecord) => lp.investorType ?? '' },
    { key: 'instHnw',      getValue: (lp: LPRecord) => lp.type === 'HNW' ? 'HNW' : 'Institutional' },
    { key: 'agentCls',     getValue: (lp: LPRecord) => lp.agentCls ?? '' },
    { key: 'cls',          getValue: (lp: LPRecord) => lp.cls ?? '' },
    { key: 'inc',          getValue: (lp: LPRecord) => lp.inc ? 'Yes' : 'No' },
    { key: 'ig',           getValue: (lp: LPRecord) => lp.ig ? 'Yes' : 'No' },
    { key: 'sp',           getValue: (lp: LPRecord) => lp.sp ?? '' },
    { key: 'mdy',          getValue: (lp: LPRecord) => lp.mdy ?? '' },
    { key: 'fitch',        getValue: (lp: LPRecord) => lp.fitch ?? '' },
    { key: 'lpSize',       getValue: (lp: LPRecord) => lp.aum || lp.nav || lp.pension || '' },
    { key: 'sizeMeasure',  getValue: (lp: LPRecord) => lp.aum ? 'AUM' : lp.nav ? 'NAV' : lp.pension ? 'Assets' : '' },
    { key: 'capCommit',    getValue: (lp: LPRecord) => lp.capCommit ?? '' },
    { key: 'pctCapCommit', getValue: (lp: LPRecord) => lp.pctCapCommit ?? '' },
    { key: 'calledCap',    getValue: (lp: LPRecord) => lp.calledCap ?? '' },
    { key: 'uc',           getValue: (lp: LPRecord) => lp.uc ?? '' },
    { key: 'pctUncalled',  getValue: (lp: LPRecord) => lp.pctUncalled ?? '' },
    { key: 'pctCalled',    getValue: (lp: LPRecord) => lp.pctCalled ?? '' },
    { key: 'agentRate',    getValue: (lp: LPRecord) => lp.agentRate ?? '' },
    { key: 'rate',         getValue: (lp: LPRecord) => lp.rate ?? '' },
    { key: 'agentConc',    getValue: (lp: LPRecord) => lp.agentConc ?? '' },
    { key: 'ubsConc',      getValue: (lp: LPRecord) => lp.ubsConc ?? '' },
    { key: 'agentExcess',  getValue: (lp: LPRecord) => lp.agentExcessConc ?? '' },
    { key: 'ubsExcess',    getValue: (lp: LPRecord) => lp.ubsExcessConc ?? '' },
    { key: 'abb',          getValue: (lp: LPRecord) => lp.abb ?? '' },
    { key: 'ubb',          getValue: (lp: LPRecord) => lp.ubb ?? '' },
    { key: 'notes',        getValue: (lp: LPRecord) => lp.notes ?? '' },
  ], [])
  const { sort, sortedRows, requestSort } = useSortableRows(filtered, sortColumns)
  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(sortedRows)
  const { widths, onResizeStart, tableWidth } = useColumnResize('lp-master', {
    rank: 52, name: 220, fundSleeve: 140, parent: 160, spv: 54,
    region: 140, investorType: 140, instHnw: 122, agentCls: 166, cls: 174,
    inc: 72, ig: 114, sp: 76, mdy: 84, fitch: 76,
    lpSize: 94, sizeMeasure: 117, capCommit: 138, pctCapCommit: 132,
    calledCap: 116, uc: 126, pctUncalled: 128, pctCalled: 104,
    agentRate: 120, rate: 114, agentConc: 158, ubsConc: 144,
    agentExcess: 174, ubsExcess: 154, abb: 133, ubb: 123, notes: 180,
  })
  const selectedRank = selected ? sortedRows.findIndex(lp => lp.name === selected.name) + 1 : undefined

  const handleSave = async (updated: LPRecord) => {
    const originalName = selected?.name
    setLpData(lpData.map(lp => lp.name === originalName ? updated : lp))
    setSelected(updated)
    if (facFilter?.id != null) {
      try {
        await api.lps.saveClassification({
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
    const ubsParticipation = parseMoneyToNumber(updated.ubsParticipation)
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
            {(classCfg?.INVESTOR_TYPE_OPTS ?? []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select style={{ width: 130 }} value={incFilter} onChange={e => { setIncFilter(e.target.value); setPage(1) }}>
            <option value="">Included: All</option>
            <option value="Y">Included (Y)</option>
            <option value="N">Excluded from BB</option>
          </select>
          <Button variant="secondary" size="sm" onClick={() => toast('LP master exported to Excel.')}>&#x2193; Export</Button>
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
              <SortableHeader sortKey="rank"           sort={sort} onSort={requestSort} style={{ width: widths.rank }}                          onResizeStart={onResizeStart}>Rank</SortableHeader>
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
            {pageItems.map((lp, i) => {
              const sizeMeasure = lp.aum ? 'AUM' : lp.nav ? 'NAV' : lp.pension ? 'Assets' : '—'
              const lpSizeVal   = lp.aum || lp.nav || lp.pension || '—'
              const instHnw     = (lp.type === 'HNW' ? 'HNW' : lp.type ? 'Institutional' : '—')
              return (
              <tr key={lp.name ?? `lp-${i}`} className={selected?.name === lp.name ? 'data-table-row-selected' : undefined} onClick={() => setSelected(lp)} style={{ cursor: 'pointer' }}>
                <td>{i + 1}</td>
                <td title={lp.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong>{lp.name}</strong>
                  {lp.rcl && <span className="rcl-badge">R</span>}
                  {lp.tf  && <span className="tf-badge">T</span>}
                </td>
                <td title={lp.fundSleeve || '—'}>{lp.fundSleeve || '—'}</td>
                <td title={lp.parent} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--muted)' }}>{lp.parent || '—'}</td>
                <td>{lp.spv ? 'Yes' : 'No'}</td>
                <td>{lp.region || '—'}</td>
                <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lp.investorType || '—'}</td>
                <td>{instHnw}</td>
                <td title={lp.agentCls || '—'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{lp.agentCls || '—'}</td>
                <td><Tag>{lp.cls}</Tag></td>
                <td style={{ textAlign: 'center' }}><span style={{ fontWeight: 600, fontSize: 11, padding: '2px 7px', borderRadius: 10, background: lp.inc ? '#e6f4ea' : 'var(--tbl)', color: lp.inc ? 'var(--green)' : 'var(--muted)' }}>{lp.inc ? 'Yes' : 'No'}</span></td>
                <td>{lp.ig ? 'Yes' : 'No'}</td>
                <td>{lp.sp || '—'}</td>
                <td>{lp.mdy || '—'}</td>
                <td>{lp.fitch || '—'}</td>
                <td className="num">{tableMoney(lpSizeVal)}</td>
                <td>{sizeMeasure}</td>
                <td className="num">{tableMoney(lp.capCommit)}</td>
                <td className="num">{lp.pctCapCommit || '—'}</td>
                <td className="num">{tableMoney(lp.calledCap)}</td>
                <td className="num">{tableMoney(lp.uc)}</td>
                <td className="num">{lp.pctUncalled || '—'}</td>
                <td className="num">{lp.pctCalled || '—'}</td>
                <td className="num">{lp.agentRate || '—'}</td>
                <td className="num">{lp.rate || '—'}</td>
                <td className="num">{lp.agentConc || '—'}</td>
                <td className="num">{lp.ubsConc || '—'}</td>
                <td className="num">{tableMoney(lp.agentExcessConc)}</td>
                <td className="num">{tableMoney(lp.ubsExcessConc)}</td>
                <td className={`num ${!lp.abb || lp.abb === '$0' ? 'zero' : ''}`}>{tableMoney(lp.abb)}</td>
                <td className={`num ${lp.ubb === '$0' ? 'zero' : ''}`}>{tableMoney(lp.ubb)}</td>
                <td title={lp.notes || '—'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lp.notes || '—'}</td>
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
        <DraggablePanel className="lp-detail-overlay" storageKey="lp-master-detail">
          <LPRecordPanel
            lp={selected}
            open={!!selected}
            onClose={() => setSelected(null)}
            onSave={handleSave}
            canEdit={canEdit}
            enableReclassify
            rank={selectedRank && selectedRank > 0 ? selectedRank : undefined}
          />
        </DraggablePanel>
      )}

    </div>
  )
}
