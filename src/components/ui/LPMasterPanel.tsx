import { useState, useEffect } from 'react'
import Button from './Button'
import ParentTypeahead, { type ParentChoice } from './ParentTypeahead'
import RegionTypeahead from './RegionTypeahead'
import Tag    from './Tag'
import { useConfigCache } from '../../store/configStore'
import { api, type LpMasterRecord, type LpMasterUpdate } from '../../services/api'
import { formatPercentageFraction, formatPercentageValue } from '../../utils/percentage'

const NOTES_MAX = 250

type LpSizeCriteria = 'AUM' | 'NAV' | 'Assets' | ''

/** Which size measure a record carries. Blank fields are absent, per the API's ""-for-null contract. */
function inferLpSizeCriteria(record: LpMasterRecord): LpSizeCriteria {
  if (record.aum.trim()) return 'AUM'
  if (record.nav.trim()) return 'NAV'
  if (record.pensionAssets.trim()) return 'Assets'
  return ''
}

function lpSizeValue(record: LpMasterRecord, criteria: string): string {
  if (criteria === 'NAV') return record.nav
  if (criteria === 'Assets') return record.pensionAssets
  return record.aum
}

/** Fractions on the record (0.9) are edited as percent text ("90"). These convert across. */
function pctTextFromFraction(value: number | null): string {
  return value == null ? '' : formatPercentageFraction(value, '')
}

function fractionFromPctText(value: unknown): number | null {
  const n = Number.parseFloat(String(value ?? '').replace(/,/g, '').replace('%', '').trim())
  return Number.isFinite(n) ? n / 100 : null
}

/** Re-exported so the screen has one import for the panel and its sponsor picker's row shape. */
export type ParentOption = ParentChoice

export interface LPMasterPanelProps {
  record: LpMasterRecord | null
  open: boolean
  onClose: () => void
  onSave: (id: number, body: LpMasterUpdate) => Promise<void> | void
  onDelete?: (record: LpMasterRecord) => void
  canEdit?: boolean
  /** Every LP Master row, with descendants of the edited record marked unselectable. */
  parentOptions: ParentOption[]
}

/**
 * Edit one bank-wide LP Master profile.
 *
 * <p>Deliberately the same shell as the LP Record panel — same overlay class, so the same width and
 * docked right-hand position — but a different field set: no facility, commitment or borrowing base
 * figures, and a Hierarchy section instead, because the parent link is what decides whose ratings
 * and rates a matched upload row inherits.
 */
export default function LPMasterPanel({
  record, open, onClose, onSave, onDelete, canEdit = true, parentOptions,
}: LPMasterPanelProps) {
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [children, setChildren] = useState<LpMasterRecord[]>([])
  const [aliases, setAliases] = useState<string[]>([])
  const configCache = useConfigCache()
  const classCfg = configCache.classification

  useEffect(() => {
    if (!record) return
    const lpSizeCriteria = inferLpSizeCriteria(record)
    setConfirmDelete(false)
    setForm({
      investorName: record.investorName,
      parentId: record.parentId == null ? '' : String(record.parentId),
      // Retained so a sponsor named before it exists is not silently dropped on save. The feed's
      // own-name "no parent" convention is preserved verbatim rather than normalised away, so a
      // save does not rewrite rows the analyst never touched.
      parent: record.parent,
      spv: record.spv,
      highQuality: record.highQuality,
      investmentGrade: record.investmentGrade,
      investorType: record.investorType,
      institutionalOrHnw: record.institutionalOrHnw,
      regionLocation: record.regionLocation,
      ubsLpCategory: record.ubsLpCategory,
      spRating: record.spRating,
      moodysRating: record.moodysRating,
      fitchRating: record.fitchRating,
      lpSizeCriteria,
      lpSize: lpSizeValue(record, lpSizeCriteria),
      fundingRatio: pctTextFromFraction(record.fundingRatio),
      ubsDefaultAdvanceRate: pctTextFromFraction(record.ubsDefaultAdvanceRate),
      ubsDefaultConcentrationLimit: record.ubsDefaultConcentrationLimit,
      notes: record.notes,
    })
  }, [record?.id])

  // Hierarchy and alias context are read-only detail, fetched per record rather than carried on
  // the list payload so the table stays a single round-trip.
  useEffect(() => {
    if (!record) { setChildren([]); setAliases([]); return }
    let cancelled = false
    api.lpMaster.children(record.id).then(r => { if (!cancelled) setChildren(r) }).catch(() => setChildren([]))
    api.lpMaster.aliases(record.id).then(r => { if (!cancelled) setAliases(r) }).catch(() => setAliases([]))
    return () => { cancelled = true }
  }, [record?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !record) return null
  if (!classCfg) {
    return (
      <div style={{ height: '100%', minHeight: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18, color: 'var(--muted)', fontSize: 12 }}>
        Loading LP Master configuration...
      </div>
    )
  }

  const editable = canEdit && !saving
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => {
      const raw = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
      const value = k === 'notes' && typeof raw === 'string' ? raw.slice(0, NOTES_MAX) : raw
      const next = { ...p, [k]: value }
      if (k === 'ubsLpCategory' && !p.ubsDefaultAdvanceRate) {
        next.ubsDefaultAdvanceRate = classCfg.UBS_CLS_DEFAULT_RATE[String(value)]
          ?? classCfg.BUSA_RATE_MAP[String(value)] ?? ''
      }
      if (k === 'lpSizeCriteria') next.lpSize = ''
      return next
    })
  const setField = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    const criteria = String(form.lpSizeCriteria ?? '')
    const size = String(form.lpSize ?? '').trim()
    setSaving(true)
    try {
      await onSave(record.id, {
        investorName: String(form.investorName ?? '').trim(),
        parent: String(form.parent ?? '').trim(),
        parentId: form.parentId === '' || form.parentId == null ? null : Number(form.parentId),
        spv: Boolean(form.spv),
        highQuality: Boolean(form.highQuality),
        investmentGrade: Boolean(form.investmentGrade),
        investorType: String(form.investorType ?? ''),
        institutionalOrHnw: String(form.institutionalOrHnw ?? ''),
        regionLocation: String(form.regionLocation ?? ''),
        ubsLpCategory: String(form.ubsLpCategory ?? ''),
        spRating: String(form.spRating ?? ''),
        moodysRating: String(form.moodysRating ?? ''),
        fitchRating: String(form.fitchRating ?? ''),
        // Only the selected measure carries the value; the other two are cleared so a record
        // never reports two different sizes at once.
        aum:           criteria === 'AUM' ? size : '',
        nav:           criteria === 'NAV' ? size : '',
        pensionAssets: criteria === 'Assets' ? size : '',
        fundingRatio: fractionFromPctText(form.fundingRatio),
        ubsDefaultAdvanceRate: fractionFromPctText(form.ubsDefaultAdvanceRate),
        ubsDefaultConcentrationLimit: String(form.ubsDefaultConcentrationLimit ?? ''),
        notes: String(form.notes ?? ''),
      })
    } finally {
      setSaving(false)
    }
  }

  const nameValid = String(form.investorName ?? '').trim().length > 0

  // ── Field primitives (functions, not components, to avoid input focus loss) ────
  const sec = (t: string) => (
    <div key={t} style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy)', marginTop: 10, padding: '4px 10px', background: 'var(--tbl)', borderRadius: 4, borderLeft: '3px solid var(--navy)' }}>{t}</div>
  )
  const fieldLabel = (label: string, readOnly: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)' }}>{label}</span>
      {readOnly && <span title="Resolved" style={{ fontSize: 8, fontWeight: 700, lineHeight: 1, color: 'var(--red)', background: '#eef3fb', borderRadius: 3, padding: '1px 4px', fontStyle: 'italic' }}>ƒ</span>}
    </div>
  )

  const f = (label: string, editKey: string | null, cfg: Record<string, unknown> = {}) => {
    const { wide, opts, chk, ro, cols, percentage, percentageStep, emptyLabel, typeahead, caption } = cfg
    const editVal = 'editVal' in cfg ? cfg.editVal : (editKey ? (form[editKey] ?? '') : '')
    const colSt: React.CSSProperties = wide ? { gridColumn: '1 / -1' } : cols ? { gridColumn: `span ${Number(cols)}` } : { gridColumn: 'span 3' }
    const disabled = !ro && !editable
    const roSt: React.CSSProperties = ro || disabled ? { background: 'var(--tbl)', color: 'var(--muted)' } : {}
    const controlSt: React.CSSProperties = { width: '100%', ...roSt }
    const selectOptions = (opts as readonly (string | { value: string; label: string })[] | undefined) ?? []
    const optionValue = (o: string | { value: string; label: string }) => typeof o === 'string' ? o : o.value
    const optionLabel = (o: string | { value: string; label: string }) => typeof o === 'string' ? (o || String(emptyLabel ?? 'Not Rated')) : o.label
    const pctNumber = String(editVal ?? '').trim() === ''
      ? '' : Number.parseFloat(String(editVal).replace(/,/g, '').replace('%', ''))
    const pctStep = typeof percentageStep === 'number' ? percentageStep : 0.5
    const stepPct = (direction: 1 | -1) => {
      const current = Number.isFinite(pctNumber) ? Number(pctNumber) : 0
      setField(editKey!, formatPercentageValue(Math.min(100, Math.max(0, current + direction * pctStep)), ''))
    }
    return (
      <div className="form-group" style={{ ...colSt, marginBottom: 0 }} key={label || editKey || ''}>
        <label style={{ display: 'block' }}>{fieldLabel(label, !!ro)}</label>
        {chk
          ? <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: disabled ? 'default' : 'pointer', marginTop: 4 }}>
              <input type="checkbox" checked={!!form[editKey!]} onChange={set(editKey!)} disabled={disabled} /> Yes
            </label>
          : typeahead
          ? <RegionTypeahead value={String(editVal ?? '')} disabled={disabled} onChange={v => setField(editKey!, v)} style={controlSt} />
          : opts
          ? <select style={controlSt} value={String(editVal)} onChange={disabled ? undefined : set(editKey!)} disabled={disabled} aria-label={label}>
              {selectOptions.map(o => <option key={optionValue(o) || '__empty'} value={optionValue(o)}>{optionLabel(o)}</option>)}
            </select>
          : percentage && !ro
          ? <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 24px', alignItems: 'stretch', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', background: disabled ? 'var(--tbl)' : 'var(--card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <input
                  type="text" inputMode="decimal"
                  style={{ ...controlSt, border: 0, borderRadius: 0, paddingRight: 4, background: 'transparent', textAlign: 'left' }}
                  value={Number.isFinite(pctNumber) ? pctNumber : ''}
                  onChange={e => {
                    const value = e.target.value.trim()
                    if (value === '') setField(editKey!, '')
                    else {
                      const parsed = Number.parseFloat(value)
                      if (Number.isFinite(parsed)) setField(editKey!, formatPercentageValue(Math.min(100, Math.max(0, parsed)), ''))
                    }
                  }}
                  disabled={disabled} aria-label={label}
                />
                <span style={{ padding: '0 8px 0 2px', color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>%</span>
              </div>
              <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', borderLeft: '1px solid var(--border)' }}>
                <button type="button" onClick={() => stepPct(1)} disabled={disabled} aria-label={`Increase ${label}`} style={{ border: 0, borderBottom: '1px solid var(--border)', background: 'var(--tbl)', color: 'var(--navy)', fontSize: 9, lineHeight: 1, cursor: disabled ? 'default' : 'pointer', padding: 0 }}>▲</button>
                <button type="button" onClick={() => stepPct(-1)} disabled={disabled} aria-label={`Decrease ${label}`} style={{ border: 0, background: 'var(--tbl)', color: 'var(--navy)', fontSize: 9, lineHeight: 1, cursor: disabled ? 'default' : 'pointer', padding: 0 }}>▼</button>
              </div>
            </div>
          : <input type="text" style={controlSt} value={String(editVal ?? '')} onChange={ro || disabled ? undefined : set(editKey!)} readOnly={!!ro} disabled={disabled} aria-label={label} />
        }
        {caption ? <div style={{ fontSize: 9, fontStyle: 'italic', color: 'var(--muted)', lineHeight: 1.4, padding: '2px 8px 0' }}>{String(caption)}</div> : null}
      </div>
    )
  }

  const COLS: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '6px 16px' }

  // Sponsor picker: the record itself is dropped outright, and its descendants are shown but inert,
  // because either choice would leave the hierarchy with no ultimate entity. The API enforces the
  // same rule — this only makes the reason visible before the request.
  const sponsorChoices = parentOptions.filter(o => o.id !== record.id)
  // A record naming itself is the feed's "no parent" convention, not an unresolved sponsor —
  // most LP Master rows carry it, so flagging it would bury the genuine cases in noise.
  const namedParent = String(form.parent ?? '').trim()
  const unresolvedParent = namedParent !== ''
    && namedParent !== String(form.investorName ?? '').trim()
    && String(form.parentId ?? '') === ''
  const routesTo = record.ultimateParent

  return (
    <div style={{ height: '100%', maxHeight: '100%', minHeight: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="LPRecord-detail-hdr" style={{ background: 'var(--navy)', color: '#fff', padding: '14px 18px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="LPRecord-detail-name" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.investorName}>
              {record.investorName}
            </div>
            <div style={{ marginTop: 7, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: .9 }}>
              <Tag>{record.ubsLpCategory || 'Unclassified'}</Tag>
              <span style={{ fontSize: 11, opacity: .75 }}>
                {record.isUltimateParent ? 'Ultimate entity' : `Feeder → ${routesTo ?? record.parent}`}
                {record.childCount > 0 && ` · ${record.childCount} child${record.childCount === 1 ? '' : 'ren'}`}
              </span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24, lineHeight: 1, opacity: .7, padding: 0, marginTop: -2 }}>×</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 18px' }}>
        <div style={COLS}>
          {sec('Hierarchy')}
          <div className="form-group" style={{ gridColumn: 'span 4', marginBottom: 0 }}>
            <label style={{ display: 'block' }}>{fieldLabel('Parent / Sponsor', false)}</label>
            <ParentTypeahead
              value={form.parentId === '' || form.parentId == null ? null : Number(form.parentId)}
              unlinkedName={unresolvedParent ? namedParent : ''}
              choices={sponsorChoices}
              disabled={!editable}
              onChange={choice => setForm(p => ({
                ...p,
                parentId: choice ? String(choice.id) : '',
                // Both halves move together — the display string must never name a different
                // entity than the link points at.
                parent: choice ? choice.investorName : '',
              }))}
            />
          </div>
          {f('SPV?', 'spv', { chk: true, cols: 2 })}
          {f('Ultimate Parent', null, {
            ro: true, cols: 3,
            editVal: routesTo ?? 'Self — this is the ultimate entity',
          })}
          {f('Direct Children', null, { ro: true, cols: 3, editVal: children.length ? String(children.length) : 'None' })}
          {unresolvedParent && (
            <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#7a5c00', background: '#fff8e6', border: '1px solid #f0d98a', borderRadius: 4, padding: '6px 10px' }}>
              <strong>⚠ Unlinked sponsor:</strong> "{String(form.parent)}" is not an LP Master record, so nothing is inherited from it. Create that record, or pick a sponsor from the list.
            </div>
          )}
          {!record.isUltimateParent && (
            <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', borderRadius: 4, padding: '6px 10px' }}>
              Fields left blank here are inherited from <strong style={{ color: 'var(--navy)' }}>{routesTo ?? record.parent}</strong> when an upload row matches this record. Values set here win.
            </div>
          )}
          {children.length > 0 && (
            <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', borderRadius: 4, padding: '6px 10px' }}>
              <strong style={{ color: 'var(--navy)' }}>Feeders routing to this record:</strong> {children.map(c => c.investorName).join(', ')}
            </div>
          )}

          {sec('Identification & Classification')}
          {f('Investor Name', 'investorName', { wide: true })}
          {f('Region / Location', 'regionLocation', { cols: 3, typeahead: true })}
          {f('Investor Type', 'investorType', { opts: classCfg.INVESTOR_TYPE_OPTS, emptyLabel: '—', cols: 3 })}
          {f('Institutional vs HNW', 'institutionalOrHnw', { opts: classCfg.TYPE_OPTS, cols: 3 })}
          {f('UBS LP Classification', 'ubsLpCategory', { opts: classCfg.CLS_OPTS, emptyLabel: 'Unclassified', cols: 3 })}
          {f('Investment Grade?', 'investmentGrade', { chk: true, cols: 3 })}
          {f('High Quality?', 'highQuality', { chk: true, cols: 3 })}
          {Boolean(form.ubsLpCategory && classCfg.CLS_CRITERIA[form.ubsLpCategory as string]) && (
            <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', borderRadius: 4, padding: '6px 10px' }}>
              <strong style={{ color: 'var(--navy)' }}>Qualifying criteria:</strong> {classCfg.CLS_CRITERIA[form.ubsLpCategory as string]}
            </div>
          )}

          {sec('Credit Ratings')}
          {f('S&P', 'spRating', { opts: classCfg.SP_RATING_OPTS, cols: 2 })}
          {f("Moody's", 'moodysRating', { opts: classCfg.MDY_RATING_OPTS, cols: 2 })}
          {f('Fitch', 'fitchRating', { opts: classCfg.FITCH_RATING_OPTS, cols: 2 })}

          {sec('Financial Scale')}
          {f('LP Size', 'lpSize', { cols: 3 })}
          {f('Size Measure', 'lpSizeCriteria', { opts: classCfg.LP_SIZE_CRITERIA_OPTS.filter(Boolean), cols: 3 })}
          {f('Pension Funded Ratio', 'fundingRatio', { percentage: true, percentageStep: 1, cols: 3 })}

          {sec('Borrowing Base Defaults')}
          <div style={{ gridColumn: '1 / -1', fontSize: 10, color: 'var(--muted)', marginTop: -4 }}>
            Pre-populated onto a facility LP record when an upload row matches this profile. The credit officer may still override them per facility.
          </div>
          {f('UBS Default Advance Rate', 'ubsDefaultAdvanceRate', { percentage: true, percentageStep: 5, cols: 3 })}
          {f('UBS Default Concentration Limit', 'ubsDefaultConcentrationLimit', { percentage: true, percentageStep: 0.5, cols: 3 })}

          {sec('Known Aliases')}
          <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', borderRadius: 4, padding: '6px 10px' }}>
            {aliases.length === 0
              ? 'No accepted Agent BB spellings recorded yet. Each accepted match adds one, so the next upload of that exact string matches without fuzzy scoring.'
              : aliases.join(' · ')}
          </div>

          {sec('Additional Details')}
          <div style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
            {fieldLabel('Notes', false)}
            <textarea
              style={{ width: '100%', height: 72, background: editable ? undefined : 'var(--tbl)', color: editable ? undefined : 'var(--muted)' }}
              value={String(form.notes ?? '')}
              onChange={editable ? set('notes') : undefined}
              disabled={!editable}
              maxLength={NOTES_MAX}
              aria-label="Notes"
            />
            <div style={{ marginTop: 3, textAlign: 'right', fontSize: 10, color: 'var(--muted)' }}>
              {String(form.notes ?? '').length}/{NOTES_MAX}
            </div>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        {confirmDelete ? (
          <>
            <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>
              Delete "{record.investorName}" from LP Master? Facility records are detached, not deleted.
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => onDelete?.(record)}>Confirm Delete</Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              {onDelete && canEdit && (
                <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={record.childCount > 0}
                        title={record.childCount > 0 ? 'Reassign its feeders before deleting this sponsor' : undefined}>Delete</Button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={!editable || !nameValid}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
