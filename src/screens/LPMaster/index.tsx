import { useState, useMemo, useEffect, useRef } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { useApp }  from '../../context/AppContext'
import Button      from '../../components/ui/Button'
import Tag         from '../../components/ui/Tag'
import InfoTip     from '../../components/ui/InfoTip'
import { CLS_OPTS, REGION_OPTS, TYPE_OPTS, SP_RATING_OPTS, MDY_RATING_OPTS } from '../../config/classificationConfig'
import { BUSA_RATE_MAP, AGENT_RATE_MAP, CLS_TAG_MAP, CLS_CRITERIA as _CLS_CRITERIA } from '../../config/classificationConfig'
import { getFacilities } from '../../services/facilityService'
import type { FacilityRow } from '../../services/facilityService'
import type { LPRecord } from '../../services/lpService'

const CLS_CRITERIA = _CLS_CRITERIA

function hash(str: string) {
  return Math.abs([...str].reduce((a, c) => (Math.imul(31, a) + c.charCodeAt(0)) | 0, 0))
}
function lpBelongsToFacility(lp: { rank: number }, facilityName: string) {
  if (facilityName === 'Blue Owl GP Stakes V') return true
  const h = hash(facilityName)
  return (lp.rank + h) % (3 + (h % 5)) !== 0
}

const CLS_LEGEND_ITEMS = [
  { label: 'Rated — 90%',           desc: 'S&P, Moody\'s, or Fitch investment-grade rated LP.' },
  { label: 'Unrated >$2bn — 75%',   desc: 'Unrated fund with AUM above $2bn.' },
  { label: 'Unrated $1–2bn — 65%',  desc: 'Unrated fund with AUM between $1bn and $2bn.' },
  { label: 'Eligible — 50%',        desc: 'Meets eligibility criteria but AUM is below $1bn.' },
  { label: 'Excluded — 0%',         desc: 'Does not meet credit agreement eligibility criteria. Not counted in the borrowing base.' },
]

const YN = ({ val }: { val: boolean }) => (
  <span style={{ fontWeight: 600, fontSize: 11, color: val ? 'var(--green)' : 'var(--muted)' }}>
    {val ? 'Y' : 'N'}
  </span>
)

// ── Full-screen LP detail overlay ─────────────────────────────────────────────
function LPDetailOverlay({ lp, open, onClose, onSave, canEdit }: {
  lp: LPRecord | null
  open: boolean
  onClose: () => void
  onSave: (lp: LPRecord) => void
  canEdit: boolean
}) {
  const [editMode, setEditMode] = useState(false)
  const [subview,  setSubview]  = useState<null | 'history' | 'reclassify'>(null)
  const [newCls,    setNewCls]    = useState('')
  const [rationale, setRationale] = useState('')
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [pos,      setPos]      = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      if (!dragStart.current) return
      setPos({ x: dragStart.current.px + e.clientX - dragStart.current.mx, y: dragStart.current.py + e.clientY - dragStart.current.my })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging])

  useEffect(() => {
    if (!lp) return
    setEditMode(false)
    setSubview(null)
    setPos({ x: 0, y: 0 })
    setForm({
      name: lp.name, parent: lp.parent, spv: lp.spv,
      type: lp.type, cls: lp.cls, ig: lp.ig,
      region: lp.region, hq: lp.hq,
      sp: lp.sp, mdy: lp.mdy, fitch: lp.fitch,
      aum: lp.aum, nav: lp.nav, pension: (lp as unknown as Record<string, unknown>).pension ?? 'N/A', pensionFunded: (lp as unknown as Record<string, unknown>).pensionFunded ?? 'N/A',
      capCommit: lp.capCommit, pctCapCommit: lp.pctCapCommit, calledCap: lp.calledCap,
      uc: lp.uc, pctUncalled: lp.pctUncalled, pctCalled: lp.pctCalled,
      agentConc: lp.agentConc, ubsConc: lp.ubsConc, abb: lp.abb, ubb: lp.ubb,
      inc: lp.inc, notes: lp.notes ?? '',
    })
  }, [lp?.rank])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !lp) return null

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  const handleSave = () => {
    onSave({ ...lp, ...form as Partial<LPRecord>, rate: BUSA_RATE_MAP[form.cls as string] ?? lp.rate, clsTag: CLS_TAG_MAP[form.cls as string] ?? lp.clsTag } as LPRecord)
    setEditMode(false)
  }

  const handleReclassify = () => {
    onSave({ ...lp, cls: newCls, rcl: true, clsTag: CLS_TAG_MAP[newCls] ?? lp.clsTag, rate: BUSA_RATE_MAP[newCls] ?? lp.rate, notes: (lp.notes ? lp.notes + '\n' : '') + `Reclassified to ${newCls}: ${rationale}` } as LPRecord)
    setSubview(null)
  }

  const sec = (t: string) => (
    <div style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy)', marginTop: 10, padding: '4px 10px', background: 'var(--tbl)', borderRadius: 4, borderLeft: '3px solid var(--navy)' }}>{t}</div>
  )

  const f = (label: string, viewVal: unknown, editKey: string | null, cfg: Record<string, unknown> = {}) => {
    const { wide, span2, opts, chk, ta, ro, neg, pos: posStyle, zero } = cfg
    const editVal = 'editVal' in cfg ? cfg.editVal : (editKey ? (form[editKey] ?? '') : '')
    const colSt: React.CSSProperties = wide ? { gridColumn: '1 / -1' } : span2 ? { gridColumn: 'span 2' } : {}

    if (!editMode) {
      return (
        <div style={colSt} key={label || editKey || ''}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 13, fontWeight: neg || posStyle ? 600 : 400, color: neg ? 'var(--red)' : posStyle ? 'var(--green)' : zero ? 'var(--muted)' : 'var(--navy)', minHeight: 28, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
            {String(viewVal || '—')}
          </div>
        </div>
      )
    }

    const roSt: React.CSSProperties = ro ? { background: 'var(--tbl)', color: 'var(--muted)' } : {}
    return (
      <div className="form-group" style={{ ...colSt, marginBottom: 0 }} key={label || editKey || ''}>
        <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 4, display: 'block' }}>{label}</label>
        {chk
          ? <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer', marginTop: 4 }}>
              <input type="checkbox" checked={!!form[editKey!]} onChange={set(editKey!)} /> Yes
            </label>
          : ta
          ? <textarea style={{ width: '100%', height: 72 }} value={String(editVal)} onChange={set(editKey!)} />
          : opts
          ? <select style={{ width: '100%' }} value={String(editVal)} onChange={set(editKey!)}>
              {(opts as string[]).map(o => <option key={o || '__empty'} value={o}>{o || 'Not Rated'}</option>)}
            </select>
          : <input type="text" style={{ width: '100%', ...roSt }} value={String(editVal)} onChange={ro ? undefined : set(editKey!)} readOnly={!!ro} />
        }
      </div>
    )
  }

  const COLS: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 28px' }

  const renderDetail = () => (
    <div style={COLS}>
      {sec('Identity & Classification')}
      {f('Investor Name', lp.name, 'name', { span2: true })}
      {f('Rank', lp.rank ?? '—', null, { ro: true })}
      {f('LEI / ID', lp.lei || '—', null, { ro: true, span2: true })}
      {f('Parent / Sponsor', lp.parent, 'parent', { span2: true })}
      {f('SPV', lp.spv ? 'Yes' : 'No', 'spv', { chk: true })}
      {f('Institutional vs HNW', lp.type, 'type', { opts: TYPE_OPTS })}
      {f('Region / Location', lp.region, 'region', { opts: REGION_OPTS })}
      {f('HQ', lp.hq ? 'Yes' : 'No', 'hq', { chk: true })}
      {f('Investment Grade', lp.ig ? 'Yes' : 'No', 'ig', { chk: true })}

      {sec('Classification')}
      {f('LP Classification', lp.cls, 'cls', { opts: CLS_OPTS.filter(Boolean) })}
      {f('BUSA Advance Rate', BUSA_RATE_MAP[lp.cls] ?? lp.rate, null, { ro: true, editVal: BUSA_RATE_MAP[form.cls as string] ?? lp.rate })}
      {f('Agent Advance Rate', AGENT_RATE_MAP[lp.cls] || '—', null, { ro: true, editVal: AGENT_RATE_MAP[form.cls as string] || '—' })}
      {Boolean(editMode ? form.cls : lp.cls) && (
        <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', borderRadius: 4, padding: '6px 10px', marginTop: -6 }}>
          <strong style={{ color: 'var(--navy)' }}>Qualifying criteria:</strong> {CLS_CRITERIA[(editMode ? form.cls : lp.cls) as string]}
        </div>
      )}

      {sec('Ratings')}
      {f('S&P', lp.sp, 'sp', { opts: SP_RATING_OPTS })}
      {f("Moody's", lp.mdy, 'mdy', { opts: MDY_RATING_OPTS })}
      {f('Fitch', lp.fitch, 'fitch', { opts: SP_RATING_OPTS })}

      {sec('Financial Scale')}
      {f('AUM', lp.aum, 'aum')}
      {f('NAV', lp.nav, 'nav')}
      {f('Pension Assets', (lp as unknown as Record<string, unknown>).pension as string, 'pension')}
      {f('Pension Funded %', (lp as unknown as Record<string, unknown>).pensionFunded as string, 'pensionFunded')}

      {sec('Commitment Data')}
      {f('Capital Commitments', lp.capCommit, 'capCommit')}
      {f('% of Cap. Commitments', lp.pctCapCommit, 'pctCapCommit')}
      {f('Called Capital', lp.calledCap, 'calledCap')}

      {sec('Uncalled / Eligible Capital')}
      {f('Uncalled Capital', lp.uc, 'uc')}
      {f('% of Uncalled Capital', lp.pctUncalled, 'pctUncalled')}
      {f('% of LP Called', lp.pctCalled, 'pctCalled')}

      {sec('Concentration & BB')}
      {f('Agent Conc. Limit', lp.agentConc, 'agentConc')}
      {f('UBS Conc. Limit', lp.ubsConc, 'ubsConc')}
      {f('Agent BB', lp.abb, 'abb')}
      {f('UBS BB', lp.ubb, 'ubb', { pos: lp.ubb !== '$0', zero: lp.ubb === '$0' })}

      {sec('Notes')}
      {editMode
        ? <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
            <label className="form-label">Notes</label>
            <textarea style={{ width: '100%', height: 72 }} value={form.notes as string ?? ''} onChange={set('notes')} />
          </div>
        : <div style={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{lp.notes || '—'}</div>
      }
    </div>
  )

  const renderHistory = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ background: 'var(--tbl)' }}>
          {['Timestamp', 'User', 'Field', 'Before', 'After', 'Note'].map(h => (
            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--navy)', borderBottom: '1px solid var(--border)', fontSize: 11 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {VERSION_HISTORY.map((r, i) => (
          <tr key={i}>
            <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{r.ts}</td>
            <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{r.user}</td>
            <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--navy)' }}>{r.field}</td>
            <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'monospace', fontSize: 11 }}>{r.before}</td>
            <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--green)', fontFamily: 'monospace', fontSize: 11 }}>{r.after}</td>
            <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11 }}>{r.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  const renderReclassify = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
      <div className="form-group">
        <label className="form-label">New Classification *</label>
        <select style={{ width: '100%' }} value={newCls} onChange={e => setNewCls(e.target.value)}>
          {CLS_OPTS.filter(Boolean).map(o => <option key={o} value={o}>{o} — {BUSA_RATE_MAP[o] ?? '?'} (BUSA)</option>)}
        </select>
      </div>
      {newCls && (
        <div style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', borderRadius: 4, padding: '6px 10px' }}>
          <strong style={{ color: 'var(--navy)' }}>Qualifying criteria:</strong> {CLS_CRITERIA[newCls]}
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Rationale / Supporting Evidence *</label>
        <textarea
          style={{ width: '100%', height: 80 }}
          placeholder="Describe the basis for reclassification (rating agency action, fund size change, eligibility test result, etc.)"
          value={rationale}
          onChange={e => setRationale(e.target.value)}
        />
      </div>
      {newCls !== lp.cls && (
        <div style={{ padding: '8px 12px', background: 'var(--red-lt)', borderRadius: 4, fontSize: 12 }}>
          <strong style={{ color: 'var(--red)' }}>Impact:</strong> Advance rate changes from <strong>{BUSA_RATE_MAP[lp.cls] ?? lp.rate}</strong> to <strong>{BUSA_RATE_MAP[newCls]}</strong>. Shadow BB will need to be recalculated.
        </div>
      )}
    </div>
  )

  const subviewTitle = subview === 'history' ? 'Version History' : subview === 'reclassify' ? 'Reclassify' : null

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.48)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={ev => { if (ev.target === ev.currentTarget) onClose() }}
    >
      <div style={{ width: '66vw', maxWidth: 940, height: '88vh', background: '#fff', borderRadius: 10, boxShadow: '0 28px 90px rgba(0,0,0,.28)', display: 'flex', flexDirection: 'column', overflow: 'hidden', transform: `translate(${pos.x}px, ${pos.y}px)` }}>

        <div
          style={{ background: 'var(--navy)', color: '#fff', padding: '16px 28px', flexShrink: 0, cursor: 'move', userSelect: 'none' }}
          onMouseDown={e => { dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }; setDragging(true) }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>
                {lp.name}
                {subviewTitle && <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 14 }}> / {subviewTitle}</span>}
              </div>
              <div style={{ marginTop: 7, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: .9 }}>
                <Tag>{lp.cls}</Tag>
                <span style={{ fontSize: 11, opacity: .7 }}>Rank #{lp.rank}</span>
                <span style={{ fontSize: 11, opacity: .7 }}>{BUSA_RATE_MAP[lp.cls] ?? lp.rate} BUSA · {AGENT_RATE_MAP[lp.cls] || '—'} Agent</span>
                {lp.rcl && <span className="rcl-badge">Reclassified</span>}
                {lp.tf  && <span className="tf-badge">Transferee</span>}
                {!canEdit && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'rgba(255,255,255,.15)', color: 'rgba(255,255,255,.8)', fontWeight: 600 }}>View Only</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24, lineHeight: 1, opacity: .7, padding: 0, marginTop: -2 }}>×</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 28px' }}>
          {subview === 'history'    ? renderHistory()    :
           subview === 'reclassify' ? renderReclassify() :
           renderDetail()}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 28px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {subview === 'history' ? (
            <>
              <Button variant="secondary" onClick={() => setSubview(null)}>&#x2190; Back to LP Record</Button>
              <Button variant="secondary" onClick={onClose}>Close</Button>
            </>
          ) : subview === 'reclassify' ? (
            <>
              <Button variant="secondary" onClick={() => setSubview(null)}>&#x2190; Back to LP Record</Button>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" onClick={onClose}>Close</Button>
                <Button disabled={newCls === lp.cls || !rationale.trim()} onClick={handleReclassify}>Apply Reclassification</Button>
              </div>
            </>
          ) : editMode ? (
            <>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Rates are derived from Classification and cannot be edited directly.</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" onClick={() => setEditMode(false)}>Cancel</Button>
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" onClick={() => setSubview('history')}>Version History</Button>
                {canEdit && <Button variant="secondary" onClick={() => { setNewCls(lp.cls); setRationale(''); setSubview('reclassify') }}>Reclassify</Button>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" onClick={onClose}>Close</Button>
                {canEdit && <Button onClick={() => setEditMode(true)}>Edit LP Record</Button>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Version History data ──────────────────────────────────────────────────────
const VERSION_HISTORY = [
  { ts: '2026-05-27 10:45', user: 'J. Smith',  field: 'Classification',     before: 'Unrated >2bn', after: 'Rated',   note: 'Received S&P BB+ rating — confirmed with Goldman' },
  { ts: '2026-05-02 09:15', user: 'M. Patel',  field: 'Uncalled Capital',   before: '$31.2M',       after: '$28.4M',  note: 'Q1 2026 capital call processed' },
  { ts: '2026-04-14 11:04', user: 'L. Torres', field: 'AUM',                before: '$3.9B',        after: '$4.2B',   note: 'Updated from Q1 2026 manager report' },
  { ts: '2025-12-31 08:00', user: 'System',    field: 'Included Flag',      before: 'N',            after: 'Y',       note: 'ERISA test passed — auto re-included' },
  { ts: '2025-11-18 16:30', user: 'J. Smith',  field: 'Concentration Limit',before: '7.5%',         after: '10.0%',   note: 'Agent confirmed higher concentration applies' },
]

// Status colour mapping for facility cards
const STATUS_COLOR: Record<string, string> = {
  'Certified':     'var(--green)',
  'In Progress':   'var(--blue)',
  'Needs Review':  'var(--amber)',
  'Not Started':   'var(--muted)',
  'Pending':       '#e65100',
  'Review':        '#c2185b',
}

// ── Facility grid card ────────────────────────────────────────────────────────
function FacilityCard({ facility, onClick }: { facility: FacilityRow; onClick: () => void }) {
  const color = STATUS_COLOR[facility.status] ?? 'var(--muted)'
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
        borderLeft: `4px solid ${color}`,
        padding: '14px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
        transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.10)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {facility.name}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{facility.agentBank}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>
          {facility.lps.toLocaleString()}
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>LPs</span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color }}>● {facility.status}</span>
      </div>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function LPMaster() {
  const { toast, lpData, updateLPRecord, currentUser } = useApp()
  const canEdit = currentUser?.role === 'Credit Officer' || currentUser?.role === 'Supervisor'

  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  useEffect(() => { getFacilities().then(setFacilities) }, [])

  // view: 'grid' = facility picker, 'list' = LP table
  const [view,      setView]      = useState<'grid' | 'list'>('grid')
  const [facFilter, setFacFilter] = useState<FacilityRow | null>(null)
  const [facSearch, setFacSearch] = useState('')
  const [search,    setSearch]    = useState('')
  const [clsFilter, setClsFilter] = useState('')
  const [incFilter, setIncFilter] = useState('')
  const [selected,  setSelected]  = useState<LPRecord | null>(null)

  const openFacility = (fac: FacilityRow) => {
    setFacFilter(fac)
    setSearch('')
    setClsFilter('')
    setIncFilter('')
    setView('list')
  }

  const openAll = () => {
    setFacFilter(null)
    setSearch('')
    setClsFilter('')
    setIncFilter('')
    setView('list')
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
      const matchQ   = !q || lp.name.toLowerCase().includes(q) || lp.parent.toLowerCase().includes(q) || (lp.lei || '').toLowerCase().includes(q)
      const matchCls = !clsFilter || lp.cls === clsFilter
      const matchInc = !incFilter || (incFilter === 'Y' ? lp.inc : !lp.inc)
      const matchFac = !facFilter || lpBelongsToFacility(lp, facFilter.name)
      return matchQ && matchCls && matchInc && matchFac
    })
  }, [lpData, search, clsFilter, incFilter, facFilter])

  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(filtered)

  const handleSave = (updated: LPRecord) => {
    updateLPRecord(updated)
    setSelected(updated)
    toast(`LP record updated — ${updated.name}.`)
  }

  // ── Facility grid view ────────────────────────────────────────────────────
  if (view === 'grid') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))' }}>
        <div className="filter-bar">
          <input
            type="text"
            placeholder="Search facilities or agent bank…"
            style={{ width: 300 }}
            value={facSearch}
            onChange={e => setFacSearch(e.target.value)}
            autoFocus
          />
          <Button variant="secondary" size="sm" onClick={openAll}>
            View All {facilities.reduce((s, f) => s + f.lps, 0).toLocaleString()} LPs →
          </Button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
            {visibleFacilities.length} of {facilities.length} facilities
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {visibleFacilities.map(f => (
              <FacilityCard key={f.name} facility={f} onClick={() => openFacility(f)} />
            ))}
          </div>
          {visibleFacilities.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '60px 0', fontSize: 13 }}>
              No facilities match "{facSearch}"
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── LP list view ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))' }}>

      <div className="filter-bar">
        <button
          onClick={backToGrid}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: 12, fontWeight: 600, padding: '0 4px', display: 'flex', alignItems: 'center', gap: 4 }}
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
          {CLS_OPTS.map(o => <option key={o} value={o}>{o || 'Classification: All'}</option>)}
        </select>
        <InfoTip title="LP Classification" items={CLS_LEGEND_ITEMS} align="left" width={330} />
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

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 24 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>Rank</th>
              <th style={{ width: '30%', maxWidth: 280 }}>Investor Name</th>
              <th style={{ width: 80 }}>LEI / ID</th>
              <th style={{ width: 48, textAlign: 'center' }}>SPV</th>
              <th style={{ width: 110 }}>Classification</th>
              <th style={{ width: 44, textAlign: 'center' }}>HQ</th>
              <th style={{ width: 100 }}>Type</th>
              <th style={{ width: 44, textAlign: 'center' }}>Inv. Grade</th>
              <th className="num" style={{ width: 75 }}>AUM</th>
              <th className="num" style={{ width: 100 }}>Uncalled Cap.</th>
              <th className="num" style={{ width: 110 }}>UBS Elig. Uncalled</th>
              <th className="num" style={{ width: 65 }}>BUSA Rate</th>
              <th className="num" style={{ width: 80 }}>UBS BB</th>
              <th className="num" style={{ width: 80 }}>Agent BB</th>
              <th className="num" style={{ width: 70 }}>Delta</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(lp => (
              <tr key={lp.rank} onClick={() => setSelected(lp)} style={{ cursor: 'pointer' }}>
                <td style={{ color: 'var(--muted)' }}>{lp.rank}</td>
                <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong title={lp.name}>{lp.name}</strong>
                  {lp.rcl && <span className="rcl-badge">R</span>}
                  {lp.tf  && <span className="tf-badge">T</span>}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.02em' }}>{lp.lei || '—'}</td>
                <td style={{ textAlign: 'center' }}><YN val={lp.spv} /></td>
                <td><Tag>{lp.cls}</Tag></td>
                <td style={{ textAlign: 'center' }}><YN val={lp.hq} /></td>
                <td style={{ fontSize: 11 }}>{lp.type}</td>
                <td style={{ textAlign: 'center' }}><YN val={lp.ig} /></td>
                <td className="num">{lp.aum}</td>
                <td className="num">{lp.uc}</td>
                <td className="num">{lp.uec}</td>
                <td className="num">{lp.rate}</td>
                <td className={`num ${lp.ubb === '$0' ? 'zero' : ''}`}>{lp.ubb}</td>
                <td className={`num ${!lp.abb || lp.abb === '$0' ? 'zero' : ''}`}>{lp.abb || '—'}</td>
                <td className={`num ${lp.delta?.startsWith('–') ? 'neg' : !lp.delta || lp.delta === '$0' ? 'zero' : ''}`}>{lp.delta || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

      <LPDetailOverlay
        lp={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onSave={handleSave}
        canEdit={canEdit}
      />

    </div>
  )
}
