import { useState, useMemo, useEffect, useRef } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { useApp }  from '../../context/AppContext'
import Button      from '../../components/ui/Button'
import Modal       from '../../components/ui/Modal'
import Tag         from '../../components/ui/Tag'
import InfoTip     from '../../components/ui/InfoTip'
import { CLS_OPTS, REGION_OPTS, TYPE_OPTS, SP_RATING_OPTS, MDY_RATING_OPTS } from '../../config/classificationConfig'
import { BUSA_RATE_MAP, CLS_TAG_MAP, CLS_CRITERIA as _CLS_CRITERIA } from '../../config/classificationConfig'
import { computeLPRecord, parseM, fmtM, fmtPct } from '../../services/bbCalculationService'
import { getFacilities, parseMoneyToNumber } from '../../services/facilityService'
import { api } from '../../services/api'
import { getLPs, getLPsForFacility } from '../../services/lpService'
import type { FacilityRow } from '../../services/facilityService'
import type { LPRecord } from '../../services/lpService'

const CLS_CRITERIA = _CLS_CRITERIA

function hash(str: string) {
  return Math.abs([...str].reduce((a, c) => (Math.imul(31, a) + c.charCodeAt(0)) | 0, 0))
}
// Parse an advance-rate string ("95%", "75%") to a decimal. Returns NaN for "N/A"/blank.
function parseRatePct(s: string | undefined | null): number {
  const m = String(s ?? '').match(/([\d.]+)\s*%?/)
  return m && m[1] ? parseFloat(m[1]) / 100 : NaN
}
function lpBelongsToFacility(lp: { name: string }, facilityName: string) {
  if (facilityName === 'Blue Owl GP Stakes V') return true
  const h = hash(facilityName)
  return (hash(lp.name) + h) % (3 + (h % 5)) !== 0
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
      name: lp.name, parent: lp.parent, spv: lp.spv, agentCls: lp.agentCls ?? '',
      type: lp.type, cls: lp.cls, ig: lp.ig,
      region: lp.region, hq: lp.hq,
      sp: lp.sp, mdy: lp.mdy, fitch: lp.fitch,
      aum: lp.aum, nav: lp.nav, pension: lp.pension || 'N/A', pensionFunded: lp.pensionFunded || 'N/A',
      capCommit: lp.capCommit, pctCapCommit: lp.pctCapCommit, calledCap: lp.calledCap,
      uc: lp.uc, pctUncalled: lp.pctUncalled, pctCalled: lp.pctCalled,
      agentConc: lp.agentConc, ubsConc: lp.ubsConc, abb: lp.abb, ubb: lp.ubb,
      inc: lp.inc, notes: lp.notes ?? '',
    })
  }, [lp?.name])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !lp) return null

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  const handleSave = () => {
    const eff = { ...lp, ...form as Partial<LPRecord> } as LPRecord
    const c = computeLPRecord(eff)
    const capCommitM = parseM(eff.capCommit)
    const calledCapM = capCommitM - parseM(eff.uc)
    const agentRateDec = parseRatePct(eff.agentRate)
    onSave({
      ...eff,
      rate: BUSA_RATE_MAP[form.cls as string] ?? lp.rate,
      clsTag: CLS_TAG_MAP[form.cls as string] ?? lp.clsTag,
      // Calculated columns — kept in sync with the formulas in SHADOW_BB_ANALYSIS.md
      hq: c.busaRate === 0.90,
      calledCap: fmtM(calledCapM),
      pctCalled: fmtPct(capCommitM > 0 ? calledCapM / capCommitM : 0),
      abb: Number.isFinite(agentRateDec) ? fmtM(parseM(eff.uc) * agentRateDec) : (eff.abb ?? '$0'),
      ubb: c.ubb,
      uec: c.uec,
    } as LPRecord)
    setEditMode(false)
  }

  const handleReclassify = () => {
    onSave({ ...lp, cls: newCls, rcl: true, clsTag: CLS_TAG_MAP[newCls] ?? lp.clsTag, rate: BUSA_RATE_MAP[newCls] ?? lp.rate, notes: (lp.notes ? lp.notes + '\n' : '') + `Reclassified to ${newCls}: ${rationale}` } as LPRecord)
    setSubview(null)
  }

  const sec = (t: string) => (
    <div style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy)', marginTop: 10, padding: '4px 10px', background: 'var(--tbl)', borderRadius: 4, borderLeft: '3px solid var(--navy)' }}>{t}</div>
  )

  // A read-only field carries `ro` and is, in this overlay, always a value derived by
  // formula (see SHADOW_BB_ANALYSIS.md › "Source: Calculated"). Mark it visually and
  // surface its formula as a caption so inputs and derived values are distinguishable.
  const fieldLabel = (label: string, calculated: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)' }}>{label}</span>
      {calculated && (
        <span title="Calculated field" style={{ fontSize: 8, fontWeight: 700, lineHeight: 1, color: 'var(--blue)', background: '#eef3fb', borderRadius: 3, padding: '1px 4px', fontStyle: 'italic' }}>ƒ</span>
      )}
    </div>
  )

  const f = (label: string, viewVal: unknown, editKey: string | null, cfg: Record<string, unknown> = {}) => {
    const { wide, span2, opts, chk, ta, ro, neg, pos: posStyle, zero, formula } = cfg
    const editVal = 'editVal' in cfg ? cfg.editVal : (editKey ? (form[editKey] ?? '') : '')
    const colSt: React.CSSProperties = wide ? { gridColumn: '1 / -1' } : span2 ? { gridColumn: 'span 2' } : {}
    const caption = formula
      ? <div style={{ fontSize: 9, fontStyle: 'italic', color: 'var(--muted)', lineHeight: 1.4, padding: '2px 8px 0' }}>{String(formula)}</div>
      : null

    if (!editMode) {
      return (
        <div style={colSt} key={label || editKey || ''}>
          {fieldLabel(label, !!ro)}
          <div style={{ fontSize: 13, fontWeight: neg || posStyle ? 600 : 400, color: neg ? 'var(--red)' : posStyle ? 'var(--green)' : zero ? 'var(--muted)' : 'var(--navy)', minHeight: 28, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
            {String(viewVal || '—')}
          </div>
          {caption}
        </div>
      )
    }

    const roSt: React.CSSProperties = ro ? { background: 'var(--tbl)', color: 'var(--muted)' } : {}
    return (
      <div className="form-group" style={{ ...colSt, marginBottom: 0 }} key={label || editKey || ''}>
        <label style={{ display: 'block' }}>{fieldLabel(label, !!ro)}</label>
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
        {caption}
      </div>
    )
  }

  const COLS: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 28px' }

  const renderDetail = () => {
    // Effective record reflects live edits so calculated columns update as the user types.
    const eff = { ...lp, ...form } as LPRecord
    const c = computeLPRecord(eff)
    const capCommitM = parseM(eff.capCommit)
    const ucM = parseM(eff.uc)
    const calledCapM = capCommitM - ucM
    const agentRateDec = parseRatePct(eff.agentRate)
    // Formulas per pe-sub-docs/SHADOW_BB_ANALYSIS.md › "LP Record Columns".
    const calledCapStr  = fmtM(calledCapM)                                               // Capital Commitments − Uncalled Capital
    const pctCalledStr  = fmtPct(capCommitM > 0 ? calledCapM / capCommitM : 0)            // Called Capital ÷ Capital Commitments
    const agentBBStr    = Number.isFinite(agentRateDec) ? fmtM(ucM * agentRateDec) : '—'  // Uncalled Capital × Agent Advance Rate
    const ubsRateStr    = BUSA_RATE_MAP[eff.cls] ?? lp.rate
    const highQuality   = c.busaRate === 0.90                                             // flagged when UBS Advance Rate = 0.90
    const concExcessStr = eff.inc && eff.cls !== 'Excluded' ? fmtM(c.concExcessM) : '—'    // included LPs only

    // Read-only display of a value derived by formula (never hand-editable).
    const calc = (label: string, val: unknown, cfg: Record<string, unknown> = {}) =>
      f(label, val, null, { ro: true, editVal: val, ...cfg })

    return (
    <div style={COLS}>
      {/* Section order, placement and formulas follow pe-sub-docs/SHADOW_BB_ANALYSIS.md
          › "LP Record Columns". Manual-input fields are editable; calculated fields are
          read-only, badged ƒ, and annotated with their formula. */}
      {sec('Identity')}
      {f('Investor Name', lp.name, 'name', { span2: true })}
      {f('Parent', lp.parent, 'parent', { span2: true })}
      {f('SPV?', lp.spv ? 'Yes' : 'No', 'spv', { chk: true })}
      {f('Region / Location', lp.region, 'region', { opts: REGION_OPTS })}

      {sec('Classification & Eligibility')}
      {f('UBS LP Classification', lp.cls, 'cls', { opts: CLS_OPTS.filter(Boolean) })}
      {f('Agent LP Classification', lp.agentCls || '—', 'agentCls')}
      {Boolean(editMode ? form.cls : lp.cls) && (
        <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', borderRadius: 4, padding: '6px 10px', marginTop: -6 }}>
          <strong style={{ color: 'var(--navy)' }}>Qualifying criteria:</strong> {CLS_CRITERIA[(editMode ? form.cls : lp.cls) as string]}
        </div>
      )}
      {f('Institutional vs HNW', lp.type, 'type', { opts: TYPE_OPTS })}
      {f('Investment Grade?', lp.ig ? 'Yes' : 'No', 'ig', { chk: true })}
      {calc('HQ', highQuality ? 'Yes' : 'No', { formula: 'Mirrors the High Quality flag (UBS rate = 0.90)' })}

      {sec('Credit Ratings')}
      {f('S&P', lp.sp, 'sp', { opts: SP_RATING_OPTS })}
      {f("Moody's", lp.mdy, 'mdy', { opts: MDY_RATING_OPTS })}
      {f('Fitch', lp.fitch, 'fitch', { opts: SP_RATING_OPTS })}

      {sec('Financial Scale')}
      {f('AUM', lp.aum, 'aum')}
      {f('NAV', lp.nav, 'nav')}
      {f('Pension Assets', lp.pension, 'pension')}
      {f('Pension Funded %', lp.pensionFunded, 'pensionFunded')}

      {sec('Advance Rates')}
      {calc('UBS Advance Rate', ubsRateStr, { formula: 'Derived from UBS LP Classification' })}
      {calc('Agent Advance Rate', lp.agentRate || '—', { formula: 'Mirrored from Agent BB advance rate' })}

      {sec('Commitments & Capital')}
      {f('Capital Commitments', lp.capCommit, 'capCommit')}
      {calc('% of Capital Commitments', lp.pctCapCommit, { formula: 'LP commitment ÷ total fund commitments' })}
      {calc('Called Capital', calledCapStr, { formula: 'Capital Commitments − Uncalled Capital' })}
      {f('Uncalled Capital', lp.uc, 'uc')}
      {calc('% of Uncalled Capital', lp.pctUncalled, { formula: 'LP uncalled ÷ total fund uncalled' })}
      {calc('% of LP Called', pctCalledStr, { formula: 'Called Capital ÷ Capital Commitments' })}

      {sec('Concentration Limits')}
      {f('Agent Concentration Limit', lp.agentConc, 'agentConc')}
      {f('UBS Concentration Limit', lp.ubsConc, 'ubsConc')}

      {sec('Borrowing Base')}
      {calc('UBS Eligible Uncalled Cap', c.uec, { formula: 'Lesser of Uncalled Capital or (Total Uncalled × UBS Conc. Limit)' })}
      {calc('Agent Borrowing Base', agentBBStr, { formula: 'Uncalled Capital × Agent Advance Rate' })}
      {calc('UBS Borrowing Base', c.ubb, { pos: c.ubbM > 0, zero: c.ubbM === 0, formula: 'UBS Advance Rate × UBS Eligible Uncalled Capital' })}
      {calc('UBS Included', c.ubbM > 0 ? 'Included' : 'Excluded', { formula: 'Included when UBS Borrowing Base > 0' })}
      {calc('Included UnCalled Conc. Excess', concExcessStr, { formula: 'Excess uncalled above concentration limit (included LPs only)' })}

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
  }

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
                <span style={{ fontSize: 11, opacity: .7 }}>{BUSA_RATE_MAP[lp.cls] ?? lp.rate} BUSA · {lp.agentRate || '—'} Agent</span>
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
  'Active':        'var(--green)',
  'In Progress':   'var(--blue)',
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
        padding: '14px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
        transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.10)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {facility.name}
        </div>
        {canEdit && (
          <button
            onClick={e => { e.stopPropagation(); onEdit(facility) }}
            title="Edit facility details"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, lineHeight: 1, padding: 2, flexShrink: 0 }}
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
// Maturity is stored as a display string ("Mar 15, 2029"); convert to/from ISO so
// the form can use a native date picker without changing the stored format.
const toISODate = (display: string) => {
  const d = new Date(display)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}
const fromISODate = (iso: string) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

type FacilityForm = { name: string; agentBank: string; accountNumber: string; loanAmount: string; maturityDate: string }
type TextKey = 'name' | 'agentBank' | 'accountNumber' | 'loanAmount'

function FacilityDetailOverlay({ facility, open, onClose, onSave, onDeactivate, onDelete }: {
  facility: FacilityRow | null
  open: boolean
  onClose: () => void
  onSave: (f: FacilityRow) => void
  onDeactivate: (f: FacilityRow, status: 'Inactive' | 'Not Started') => void
  onDelete: (f: FacilityRow) => void
}) {
  const [form, setForm] = useState<FacilityForm>({
    name: '', agentBank: '', accountNumber: '', loanAmount: '', maturityDate: '',
  })
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!facility) return
    const clean = (v?: string | null) => (!v || v === '—' ? '' : v)
    setForm({
      name:          clean(facility.name),
      agentBank:     clean(facility.agentBank),
      accountNumber: clean(facility.accountNumber),
      loanAmount:    clean(facility.loanAmount) || clean(facility.ubsParticipation),
      maturityDate:  clean(facility.maturityDate),
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
      <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>Delete "{facility.name}" permanently? This cannot be undone.</span>
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
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={labelSt}>Maturity Date</label>
          <input type="date" style={{ width: '100%' }} value={toISODate(form.maturityDate)} onChange={e => setForm(p => ({ ...p, maturityDate: fromISODate(e.target.value) }))} aria-label="Maturity Date" />
        </div>
        {ro('Facility Status', <Tag>{facility.status}</Tag>)}
        {ro('Facility Status Date', facility.facilityStatusDate)}
      </div>
    </Modal>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function LPMaster() {
  const { toast, lpData, setLpData, updateLPRecord, currentUser, setActiveFacilityId } = useApp()
  const canEdit = currentUser?.role === 'Analyst' || currentUser?.role === 'Account/Transaction Manager'

  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  useEffect(() => {
    getFacilities().then(setFacilities).catch(() => {})
  }, [])

  // view: 'grid' = facility picker, 'list' = LP table
  const [view,      setView]      = useState<'grid' | 'list'>('grid')
  const [facFilter, setFacFilter] = useState<FacilityRow | null>(null)
  const [facSearch, setFacSearch] = useState('')
  const [search,    setSearch]    = useState('')
  const [clsFilter, setClsFilter] = useState('')
  const [incFilter, setIncFilter] = useState('')
  const [selected,  setSelected]  = useState<LPRecord | null>(null)
  const [editingFacility, setEditingFacility] = useState<FacilityRow | null>(null)

  // Live: pull the facility's LP records fresh on open so newly-committed LPs always show,
  // independent of whatever facility the shared context last loaded.
  const openFacility = (fac: FacilityRow) => {
    setFacFilter(fac)
    setSearch('')
    setClsFilter('')
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
      const matchQ   = !q || (lp.name ?? '').toLowerCase().includes(q) || (lp.parent ?? '').toLowerCase().includes(q)
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

  // Persist every editable facility field (Identity + Agent Bank Summary) via PATCH, then reflect
  // the saved values locally. Rows are reconciled by id (the name is itself editable now).
  const handleFacilitySave = async (updated: FacilityRow) => {
    if (updated.id != null) {
      try {
        await api.facilities.update(updated.id, {
          name:          updated.name.trim(),
          agentBank:     updated.agentBank.trim(),
          accountNumber: updated.accountNumber === '—' ? null : updated.accountNumber,
          loanAmount:    parseMoneyToNumber(updated.loanAmount),
          maturityDate:  toISODate(updated.maturityDate) || null,
        })
      } catch (e) {
        toast(e instanceof Error && e.message ? e.message : 'Could not save facility — API unavailable.')
        return
      }
    }
    setFacilities(prev => prev.map(f => (f.id === updated.id ? { ...f, ...updated } : f)))
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
            View All {facilities.reduce((s, f) => s + (f.lps ?? 0), 0).toLocaleString()} LPs →
          </Button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
            {visibleFacilities.length} of {facilities.length} facilities
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
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
              <th style={{ width: '22%', maxWidth: 220 }}>Investor Name</th>
              <th style={{ width: '20%', maxWidth: 200 }}>Parent</th>
              <th style={{ width: 48, textAlign: 'center' }}>SPV</th>
              <th style={{ width: 110 }}>Agent Classification</th>
              <th style={{ width: 110 }}>UBS Classification</th>
              <th style={{ width: 44, textAlign: 'center' }}>HQ</th>
              <th style={{ width: 100 }}>Inst/HNW</th>
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
            {pageItems.map((lp, i) => (
              <tr key={lp.name ?? `lp-${i}`} onClick={() => setSelected(lp)} style={{ cursor: 'pointer' }}>
                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong title={lp.name}>{lp.name}</strong>
                  {lp.rcl && <span className="rcl-badge">R</span>}
                  {lp.tf  && <span className="tf-badge">T</span>}
                </td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--muted)' }} title={lp.parent}>{lp.parent || '—'}</td>
                <td style={{ textAlign: 'center' }}><YN val={lp.spv} /></td>
                <td style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lp.agentCls || ''}>{lp.agentCls || '—'}</td>
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
