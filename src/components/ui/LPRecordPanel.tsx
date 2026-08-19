import { useState, useEffect } from 'react'
import Button from './Button'
import RegionTypeahead from './RegionTypeahead'
import Tag    from './Tag'
import { computeLPRecord, parseM, fmtM, fmtPct } from '../../services/bbCalculationService'
import {
  buildBusaRateFractions,
  busaClassificationOptions,
  clsConcLimitBoundsForCls,
  clsConcLimitPctForCls,
} from '../../services/configService'
import { useConfigCache } from '../../store/configStore'
import type { LPRecord } from '../../services/lpService'
import { formatPercentageFraction, formatPercentageText, formatPercentageValue } from '../../utils/percentage'

const NOTES_MAX    = 250

type LpSizeCriteria = 'AUM' | 'NAV' | 'Assets' | ''

function inferLpSizeCriteria(LPRecord: LPRecord): LpSizeCriteria {
  if (String(LPRecord.aum ?? '').trim()) return 'AUM'
  if (String(LPRecord.nav ?? '').trim()) return 'NAV'
  if (String(LPRecord.pensionAssets ?? '').trim()) return 'Assets'
  return ''
}

function agentClsSourceNote(source: string | undefined | null, hasAgentCls: boolean): string {
  const value = String(source ?? '').toUpperCase()
  if (value === 'EXTRACTED') return 'Agent LP Category came directly from the Agent BB file.'
  if (value === 'DERIVED') return 'Agent LP Category was auto-assigned from Investor Type and available investor profile data.'
  if (!hasAgentCls) return 'Agent LP Category is blank. Analyst input is required.'
  if (value === 'USER_EDITED') return 'Agent LP Category was edited by an analyst.'
  return 'Agent LP Category source is not recorded.'
}

function lpSizeValue(LPRecord: LPRecord, criteria: string): string {
  const source = criteria === 'NAV' ? LPRecord.nav : criteria === 'Assets' ? LPRecord.pensionAssets : LPRecord.aum
  return String(source ?? '')
}

/** Advance rates and the ratio fields are raw fractions on LPRecord (0.9 = 90%), but the form's
 *  percent inputs edit them as display text ("90%"). These two convert across that boundary. */
export function pctTextFromFraction(value: number | null | undefined): string {
  return value == null ? '' : formatPercentageFraction(value, '')
}

export function fractionFromPctText(value: unknown): number | null {
  const n = Number.parseFloat(String(value ?? '').replace(/,/g, '').replace('%', '').trim())
  return Number.isFinite(n) ? n / 100 : null
}

/** Form keys that hold a fraction on LPRecord — coerced back on the way into the record so a
 *  blank or "N/A" never lands in a numeric column. */
const FRACTION_FIELDS = [
  'ubsAdvanceRate', 'agentAdvanceRate', 'fundingRatio',
  'pctOfFundCommitments', 'pctOfFundUncalled', 'pctLpCalled',
] as const

function applyLpSizeToRecord(LPRecord: LPRecord, form: Record<string, unknown>): LPRecord {
  const coerced: Record<string, unknown> = { ...form }
  for (const key of FRACTION_FIELDS) {
    if (key in coerced) coerced[key] = fractionFromPctText(coerced[key])
  }
  const next = { ...LPRecord, ...coerced as Partial<LPRecord> } as LPRecord
  const size = String(form.lpSize ?? '')
  switch (form.lpSizeCriteria) {
    case 'AUM': next.aum = size; break
    case 'NAV': next.nav = size; break
    case 'Assets': next.pensionAssets = size; break
  }
  return next
}

export function buildLpRecordFromForm(
  LPRecord: LPRecord,
  form: Record<string, unknown>,
  classCfg: { UBS_CLS_DEFAULT_RATE?: Record<string, string>; BUSA_RATE_MAP?: Record<string, string>; CLS_TAG_MAP?: Record<string, string> },
  busaRates: Record<string, number>,
  totalUncalledM?: number,
  /** Mirrors the server's ReclassificationPolicy: a category change only counts as a
   *  reclassification once a Shadow BB exists to invalidate. Callers that edit records with no
   *  run behind them leave this false, so no R badge or re-run banner appears. */
  marksReclassification = false,
): LPRecord {
  const eff = applyLpSizeToRecord(LPRecord, form)
  const ubsConcPct = parseRatePct(eff.ubsConcentrationLimit)
  const dynamicConcLimitM = totalUncalledM != null && Number.isFinite(ubsConcPct)
    ? totalUncalledM * ubsConcPct
    : undefined
  const c = computeLPRecord(
    dynamicConcLimitM == null ? eff : { ...eff, concLimitM: dynamicConcLimitM } as LPRecord & { concLimitM: number },
    undefined,
    busaRates,
  )
  const capCommitM = parseM(eff.capitalCommitment)
  const calledCapM = capCommitM - parseM(eff.uncalledCapital)
  const agentRateDec = eff.agentAdvanceRate ?? NaN
  const agentConcPct = parseRatePct(eff.agentConcentrationLimit)
  const agentConcLimitM = totalUncalledM != null && Number.isFinite(agentConcPct) && agentConcPct > 0
    ? totalUncalledM * agentConcPct
    : undefined
  const agentExcessM = eff.included && eff.ubsLpCategory !== 'Excluded' && agentConcLimitM != null
    ? Math.max(0, parseM(eff.uncalledCapital) - agentConcLimitM)
    : 0
  // An edited rate wins; otherwise fall back to the class default schedule, then the record's own.
  const clsDefaultRate = fractionFromPctText(
    classCfg.UBS_CLS_DEFAULT_RATE?.[String(form.ubsLpCategory)]
    ?? classCfg.BUSA_RATE_MAP?.[String(form.ubsLpCategory)],
  )
  return {
    ...eff,
    ubsAdvanceRate: eff.ubsAdvanceRate ?? clsDefaultRate ?? LPRecord.ubsAdvanceRate,
    ubsLpCategoryTag: classCfg.CLS_TAG_MAP?.[String(form.ubsLpCategory)] ?? LPRecord.ubsLpCategoryTag,
    highQuality: c.busaRate === 0.90,
    reclassified: LPRecord.reclassified
      || (marksReclassification
        && (String(eff.agentLpCategory ?? '').trim() !== String(LPRecord.agentLpCategory ?? '').trim()
          || String(eff.ubsLpCategory ?? '').trim() !== String(LPRecord.ubsLpCategory ?? '').trim())),
    calledCapital: fmtM(calledCapM),
    pctLpCalled: capCommitM > 0 ? calledCapM / capCommitM : 0,
    agentBorrowingBase: Number.isFinite(agentRateDec) ? fmtM(parseM(eff.uncalledCapital) * agentRateDec) : (eff.agentBorrowingBase ?? '$0'),
    ubsBorrowingBase: c.ubsBorrowingBase,
    uncalledEligibleCapital: c.uncalledEligibleCapital,
    ubsExcessConcentration: c.concExcessM > 0 ? fmtM(c.concExcessM) : '—',
    agentExcessConcentration: agentExcessM > 0 ? fmtM(agentExcessM) : '—',
  }
}

function parseRatePct(s: string | undefined | null): number {
  const m = String(s ?? '').match(/([\d.]+)\s*%?/)
  return m && m[1] ? parseFloat(m[1]) / 100 : NaN
}

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


export interface LPRecordPanelProps {
  LPRecord: LPRecord | null
  open: boolean
  onClose: () => void
  onSave: (LPRecord: LPRecord) => void
  /** When provided (and the panel is editable), shows a Delete action with inline confirmation. */
  onDelete?: (LPRecord: LPRecord) => void
  canEdit?: boolean
  running?: boolean
  totalAgentBB?: number
  totalUbsBB?: number
  /** Facility-wide uncalled capital, used to turn edited concentration percentages into dollar caps. */
  totalUncalledM?: number
  /** Rank is facility-specific; show it only in facility-scoped and Shadow BB contexts. */
  showRank?: boolean
  /** True only where a Shadow BB already exists for this facility, so a category edit invalidates
   *  it. Off by default: with no run behind the record there is nothing to re-run. */
  marksReclassification?: boolean
}

export default function LPRecordPanel({
  LPRecord, open, onClose, onSave, onDelete, canEdit = true, running = false,
  totalAgentBB, totalUbsBB, totalUncalledM, showRank = false, marksReclassification = false,
}: LPRecordPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form,      setForm]      = useState<Record<string, unknown>>({})
  const configCache = useConfigCache()
  const classCfg = configCache.classification
  const eligCfg = configCache.eligibility

  const editable = canEdit && !running

  useEffect(() => {
    if (!LPRecord) return
    const lpSizeCriteria = inferLpSizeCriteria(LPRecord)
    setConfirmDelete(false)
    setForm({
      investorName: LPRecord.investorName ?? '', parent: LPRecord.parent ?? '', spv: LPRecord.spv, agentLpCategory: LPRecord.agentLpCategory ?? '',
      agentLpCategorySource: LPRecord.agentLpCategorySource ?? '',
      investorType: LPRecord.investorType ?? '', institutionalOrHnw: LPRecord.institutionalOrHnw ?? '', ubsLpCategory: LPRecord.ubsLpCategory ?? '', investmentGrade: LPRecord.investmentGrade,
      regionLocation: LPRecord.regionLocation ?? '', highQuality: LPRecord.highQuality,
      spRating: LPRecord.spRating ?? '', moodysRating: LPRecord.moodysRating ?? '', fitchRating: LPRecord.fitchRating ?? '',
      aum: LPRecord.aum ?? '', nav: LPRecord.nav ?? '', pensionAssets: LPRecord.pensionAssets || 'N/A',
      lpSizeCriteria, lpSize: lpSizeValue(LPRecord, lpSizeCriteria),
      capitalCommitment: LPRecord.capitalCommitment ?? '', calledCapital: LPRecord.calledCapital ?? '',
      uncalledCapital: LPRecord.uncalledCapital ?? '',
      ubsAdvanceRate: pctTextFromFraction(LPRecord.ubsAdvanceRate), agentAdvanceRate: pctTextFromFraction(LPRecord.agentAdvanceRate),
      agentConcentrationLimit: LPRecord.agentConcentrationLimit ?? '', ubsConcentrationLimit: LPRecord.ubsConcentrationLimit ?? '', agentBorrowingBase: LPRecord.agentBorrowingBase ?? '', ubsBorrowingBase: LPRecord.ubsBorrowingBase ?? '',
      included: LPRecord.included, notes: LPRecord.notes ?? '',
    })
  }, [LPRecord?.investorName])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !LPRecord) return null
  if (!classCfg || !eligCfg) {
    return (
      <div style={{ height: '100%', minHeight: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18, color: 'var(--muted)', fontSize: 12 }}>
        Loading LPRecord configuration...
      </div>
    )
  }

  const agentRateScheduleOpts = eligCfg.AGENT_TIERS.map(({ cls, rate }) => ({
    value: cls, label: `${cls} (${formatPercentageValue(rate)})`, rate: formatPercentageValue(rate),
  }))
  const agentRateForClass = (agentLpCategory: string): string =>
    agentRateScheduleOpts.find(o => o.value === agentLpCategory)?.rate ?? ''
  const busaRates = buildBusaRateFractions(classCfg)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => {
      const rawValue = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
      const value = k === 'notes' && typeof rawValue === 'string' ? rawValue.slice(0, NOTES_MAX) : rawValue
      const next = { ...p, [k]: value }
      if (k === 'ubsLpCategory') {
        if (!p.ubsAdvanceRate) next.ubsAdvanceRate = classCfg.UBS_CLS_DEFAULT_RATE[String(value)] ?? ''
        // Auto-assign the per-LP concentration limit from the class default. Evaluate the
        // Excluded bucket first: it is a hard 0 regardless of any configured residual default.
        if (String(value) === 'Excluded') {
          next.ubsConcentrationLimit = '0.0%'
        } else {
          const clsConcDefault = clsConcLimitPctForCls(eligCfg, String(value))
          if (clsConcDefault !== '') next.ubsConcentrationLimit = formatPercentageValue(clsConcDefault)
        }
      }
      if (k === 'agentLpCategory') {
        next.agentLpCategorySource = 'USER_EDITED'
        next.agentAdvanceRate = agentRateForClass(String(value)) || next.agentAdvanceRate
      }
      if (k === 'lpSizeCriteria' && LPRecord) next.lpSize = lpSizeValue(applyLpSizeToRecord(LPRecord, p), String(value))
      return next
    })

  const handleSave = () => {
    onSave(buildLpRecordFromForm(LPRecord, form, classCfg, busaRates, totalUncalledM, marksReclassification))
    onClose()
  }

  const sec = (t: string) => (
    <div style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy)', marginTop: 10, padding: '4px 10px', background: 'var(--tbl)', borderRadius: 4, borderLeft: '3px solid var(--navy)' }}>{t}</div>
  )

  const fieldLabel = (label: string, calculated: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)' }}>{label}</span>
      {calculated && <span title="Calculated" style={{ fontSize: 8, fontWeight: 700, lineHeight: 1, color: 'var(--red)', background: '#eef3fb', borderRadius: 3, padding: '1px 4px', fontStyle: 'italic' }}>ƒ</span>}
    </div>
  )

  const setField = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const f = (label: string, _viewVal: unknown, editKey: string | null, cfg: Record<string, unknown> = {}) => {
    const { wide, span2, opts, chk, ta, ro, formula, cols, money, percentage, percentageStep, accent, maxLength, inputMode, width, emptyLabel, typeahead } = cfg
    const editVal = 'editVal' in cfg ? cfg.editVal : (editKey ? (form[editKey] ?? '') : '')
    const colSt: React.CSSProperties = wide ? { gridColumn: '1 / -1' } : cols ? { gridColumn: `span ${Number(cols)}` } : span2 ? { gridColumn: 'span 2' } : { gridColumn: 'span 3' }
    const caption = formula
      ? <div style={{ fontSize: 9, fontStyle: 'italic', color: 'var(--muted)', lineHeight: 1.4, padding: '2px 8px 0' }}>{String(formula)}</div>
      : null

    const disabled = !ro && !editable
    const roSt: React.CSSProperties = ro || disabled ? { background: 'var(--tbl)', color: 'var(--muted)' } : {}
    const boxSt: React.CSSProperties = accent
      ? { border: '1px dotted var(--green)', background: 'var(--green-lt)', borderRadius: 4, padding: '6px 8px' }
      : {}
    const controlSt: React.CSSProperties = { width: width ? Number(width) : '100%', ...roSt }
    const displayVal = money ? formatMoneyText(editVal) : percentage ? formatPercentageText(editVal, '') : String(editVal ?? '')
    const selectOptions = (opts as readonly (string | { value: string; label: string })[] | undefined) ?? []
    const optionValue = (o: string | { value: string; label: string }) => typeof o === 'string' ? o : o.value
    const optionLabel = (o: string | { value: string; label: string }) => typeof o === 'string' ? (o || String(emptyLabel ?? 'Not Rated')) : o.label
    const percentageNumber = String(editVal ?? '').trim() === ''
      ? ''
      : Number.parseFloat(String(editVal).replace(/,/g, '').replace('%', ''))
    const pctStep = typeof percentageStep === 'number' ? percentageStep : 0.1
    const stepPercentage = (direction: 1 | -1) => {
      const current = Number.isFinite(percentageNumber) ? Number(percentageNumber) : 0
      const next = Math.min(100, Math.max(0, current + direction * pctStep))
      setField(editKey!, formatPercentageValue(next, ''))
    }
    return (
      <div className="form-group" style={{ ...colSt, ...boxSt, marginBottom: 0 }} key={label || editKey || ''}>
        <label style={{ display: 'block' }}>{fieldLabel(label, !!ro)}</label>
        {chk
          ? <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer', marginTop: 4 }}>
              <input type="checkbox" checked={!!form[editKey!]} onChange={set(editKey!)} disabled={disabled} /> Yes
            </label>
          : typeahead
          ? <RegionTypeahead value={String(editVal ?? '')} disabled={disabled} onChange={v => setField(editKey!, v)} style={controlSt} />
          : ta
          ? <textarea style={{ width: '100%', height: 72, ...roSt }} value={displayVal} onChange={disabled ? undefined : set(editKey!)} disabled={disabled} maxLength={typeof maxLength === 'number' ? maxLength : undefined} />
          : opts
          ? <select style={controlSt} value={String(editVal)} onChange={disabled ? undefined : set(editKey!)} disabled={disabled}>
              {selectOptions.map(o => <option key={optionValue(o) || '__empty'} value={optionValue(o)}>{optionLabel(o)}</option>)}
            </select>
          : percentage && !ro
          ? <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 24px', alignItems: 'stretch', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', background: disabled ? 'var(--tbl)' : 'var(--card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <input
                  type="text"
                  inputMode="decimal"
                  style={{ ...controlSt, border: 0, borderRadius: 0, paddingRight: 4, background: 'transparent', textAlign: 'left' }}
                  value={Number.isFinite(percentageNumber) ? percentageNumber : ''}
                  onChange={e => {
                    const value = e.target.value.trim()
                    if (value === '') setField(editKey!, '')
                    else {
                      const parsed = Number.parseFloat(value)
                      if (Number.isFinite(parsed)) setField(editKey!, formatPercentageValue(Math.min(100, Math.max(0, parsed)), ''))
                    }
                  }}
                  disabled={disabled}
                  aria-label={label}
                />
                <span style={{ padding: '0 8px 0 2px', color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>%</span>
              </div>
              <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', borderLeft: '1px solid var(--border)' }}>
                <button type="button" onClick={() => stepPercentage(1)} disabled={disabled} aria-label={`Increase ${label}`} style={{ border: 0, borderBottom: '1px solid var(--border)', background: 'var(--tbl)', color: 'var(--navy)', fontSize: 9, lineHeight: 1, cursor: disabled ? 'default' : 'pointer', padding: 0 }}>▲</button>
                <button type="button" onClick={() => stepPercentage(-1)} disabled={disabled} aria-label={`Decrease ${label}`} style={{ border: 0, background: 'var(--tbl)', color: 'var(--navy)', fontSize: 9, lineHeight: 1, cursor: disabled ? 'default' : 'pointer', padding: 0 }}>▼</button>
              </div>
            </div>
          : <input type="text" style={controlSt} value={displayVal} onChange={ro || disabled ? undefined : set(editKey!)} readOnly={!!ro} disabled={disabled} inputMode={typeof inputMode === 'string' ? inputMode as React.HTMLAttributes<HTMLInputElement>['inputMode'] : undefined} maxLength={typeof maxLength === 'number' ? maxLength : undefined} />
        }
        {caption}
      </div>
    )
  }

  const COLS: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '6px 16px' }
  const ubsClsOptions = busaClassificationOptions(classCfg)

  const renderDetail = () => {
    const eff = applyLpSizeToRecord(LPRecord, form)
    const ubsConcPctForCalc = parseRatePct(eff.ubsConcentrationLimit)
    const dynamicConcLimitM = totalUncalledM != null && Number.isFinite(ubsConcPctForCalc)
      ? totalUncalledM * ubsConcPctForCalc
      : undefined
    const c = computeLPRecord(
      dynamicConcLimitM == null ? eff : { ...eff, concLimitM: dynamicConcLimitM } as LPRecord & { concLimitM: number },
      undefined,
      busaRates,
    )
    const capCommitM = parseM(eff.capitalCommitment)
    const ucM = parseM(eff.uncalledCapital)
    const calledCapM = capCommitM - ucM
    const agentRateDec = eff.agentAdvanceRate ?? NaN
    const calledCapStr   = fmtM(calledCapM)
    const pctCalledStr   = fmtPct(capCommitM > 0 ? calledCapM / capCommitM : 0)
    const agentBBStr     = Number.isFinite(agentRateDec) ? fmtM(ucM * agentRateDec) : '—'
    const agentBBM       = Number.isFinite(agentRateDec) ? ucM * agentRateDec : 0
    const ubsExcessStr   = eff.included && eff.ubsLpCategory !== 'Excluded' && c.concExcessM > 0 ? fmtM(c.concExcessM) : (eff.ubsExcessConcentration || '—')
    const agentConcPctForCalc = parseRatePct(eff.agentConcentrationLimit)
    const agentConcLimitM = totalUncalledM != null && Number.isFinite(agentConcPctForCalc) && agentConcPctForCalc > 0
      ? totalUncalledM * agentConcPctForCalc
      : undefined
    const agentExcessM = eff.included && eff.ubsLpCategory !== 'Excluded' && agentConcLimitM != null
      ? Math.max(0, ucM - agentConcLimitM)
      : 0
    const agentExcessStr = agentConcLimitM != null ? (agentExcessM > 0 ? fmtM(agentExcessM) : '—') : (eff.agentExcessConcentration || '—')
    const agentClsValue  = String(form.agentLpCategory ?? '')
    const agentClsOptions = agentClsValue && !agentRateScheduleOpts.some(o => o.value === agentClsValue)
      ? [{ value: '', label: 'Select classification' }, { value: agentClsValue, label: agentClsValue }, ...agentRateScheduleOpts]
      : [{ value: '', label: 'Select classification' }, ...agentRateScheduleOpts]

    // Non-blocking guard: warn when the UBS concentration limit falls outside the accepted
    // range for the selected class. Only percent-style limits are checked — a dollar-denominated
    // limit ("$25,000,000") carries no comparable range and is left alone.
    const concBounds = clsConcLimitBoundsForCls(eligCfg, String(form.ubsLpCategory ?? ''))
    const rawUbsConc = String(form.ubsConcentrationLimit ?? '').trim()
    const ubsConcPct = parseFloat(rawUbsConc.replace('%', '').trim())
    const isPctConc = rawUbsConc !== '' && !/[$mbk]/i.test(rawUbsConc)
    const concOutOfRange = !!concBounds && isPctConc && Number.isFinite(ubsConcPct)
      && (ubsConcPct < concBounds.min || ubsConcPct > concBounds.max)

    const calc = (label: string, val: unknown, cfg: Record<string, unknown> = {}) =>
      f(label, val, null, { ro: true, editVal: val, ...cfg })

    return (
      <div style={COLS}>
        {sec('Identification & Classification')}
        {showRank && calc('Rank', LPRecord.lpRank ?? '—', { cols: 1 })}
        {f('Investor Name', LPRecord.investorName, 'investorName', { cols: showRank ? 5 : 6 })}
        {f('SPV?', LPRecord.spv ? 'Yes' : 'No', 'spv', { chk: true, cols: 1 })}
        {f('Parent', LPRecord.parent, 'parent', { cols: 5 })}
        {f('Region / Location', LPRecord.regionLocation || '—', 'regionLocation', { cols: 3, typeahead: true })}
        {f('Investor Type', LPRecord.investorType ?? '', 'investorType', { opts: classCfg.INVESTOR_TYPE_OPTS, emptyLabel: '—' })}
        {f('Institutional vs HNW', LPRecord.institutionalOrHnw, 'institutionalOrHnw', { opts: classCfg.TYPE_OPTS })}
        {f('Agent LP Classification', LPRecord.agentLpCategory || '—', 'agentLpCategory', { opts: agentClsOptions })}
        {f('Agent Classification Source', LPRecord.agentLpCategorySource || '—', 'agentLpCategorySource', { ro: true })}
        <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', borderRadius: 4, padding: '6px 10px', marginTop: -6 }}>
          {agentClsSourceNote(String(form.agentLpCategorySource ?? ''), Boolean(form.agentLpCategory))}
        </div>
        {f('UBS LP Classification', LPRecord.ubsLpCategory, 'ubsLpCategory', { opts: ubsClsOptions, emptyLabel: 'Unclassified' })}
        {f('Investment Grade?', LPRecord.investmentGrade ? 'Yes' : 'No', 'investmentGrade', { chk: true })}
        {Boolean(form.ubsLpCategory && classCfg.CLS_CRITERIA[form.ubsLpCategory as string]) && (
          <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', borderRadius: 4, padding: '6px 10px', marginTop: -6 }}>
            <strong style={{ color: 'var(--navy)' }}>Qualifying criteria:</strong> {classCfg.CLS_CRITERIA[form.ubsLpCategory as string]}
          </div>
        )}

        {sec('Credit Ratings')}
        {f('S&P', LPRecord.spRating, 'spRating', { opts: classCfg.SP_RATING_OPTS, cols: 2 })}
        {f("Moody's", LPRecord.moodysRating, 'moodysRating', { opts: classCfg.MDY_RATING_OPTS, cols: 2 })}
        {f('Fitch', LPRecord.fitchRating, 'fitchRating', { opts: classCfg.FITCH_RATING_OPTS, cols: 2 })}

        {sec('Capital Metrics')}
        {f('LP Size', form.lpSize, 'lpSize')}
        {f('Size Measure', form.lpSizeCriteria, 'lpSizeCriteria', { opts: classCfg.LP_SIZE_CRITERIA_OPTS.filter(Boolean) })}
        {f('Capital Commitments', LPRecord.capitalCommitment, 'capitalCommitment', { money: true })}
        {calc('% of Capital Commitments', formatPercentageFraction(LPRecord.pctOfFundCommitments ?? NaN), { formula: 'LP commitment ÷ total fund commitments' })}
        {calc('Called Capital', calledCapStr, { money: true, formula: 'Capital Commitments − Uncalled Capital' })}
        {f('Uncalled Capital', LPRecord.uncalledCapital, 'uncalledCapital', { money: true })}
        {calc('% of Uncalled Capital', formatPercentageFraction(LPRecord.pctOfFundUncalled ?? NaN), { formula: 'LP uncalled ÷ total fund uncalled' })}
        {calc('% of LP Called', pctCalledStr, { formula: 'Called Capital ÷ Capital Commitments' })}

        {sec('Borrowing Base Calculation')}
        <div style={{ gridColumn: '1 / -1', fontSize: 10, color: 'var(--muted)', marginTop: -4 }}>
          Preview of unsaved edits — saved totals update on the next Shadow BB run.
        </div>
        {f('Agent Advance Rate', LPRecord.agentAdvanceRate, 'agentAdvanceRate', { percentage: true, percentageStep: 5 })}
        {f('UBS Advance Rate', LPRecord.ubsAdvanceRate, 'ubsAdvanceRate', { percentage: true, percentageStep: 5 })}
        {f('Agent Concentration Limit', LPRecord.agentConcentrationLimit, 'agentConcentrationLimit', { percentage: true, percentageStep: 0.5 })}
        {f('UBS Concentration Limit', LPRecord.ubsConcentrationLimit, 'ubsConcentrationLimit', { percentage: true, percentageStep: 0.5 })}
        {concOutOfRange && concBounds && (
          <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#7a5c00', background: '#fff8e6', border: '1px solid #f0d98a', borderRadius: 4, padding: '6px 10px', marginTop: -2 }}>
            <strong>⚠ Outside norm:</strong> {ubsConcPct}% is outside the accepted {concBounds.min}–{concBounds.max}% range for {String(form.ubsLpCategory)}. Verify before saving.
          </div>
        )}
        {calc('Agent Excess Concentration', agentExcessStr, { money: true, formula: 'Excess uncalled above Agent concentration limit' })}
        {calc('UBS Excess Concentration', ubsExcessStr, { money: true, formula: 'Excess uncalled above UBS concentration limit' })}
        {calc('Agent Borrowing Base', agentBBStr, { money: true, formula: 'Uncalled Capital × Agent Advance Rate, capped by Agent concentration' })}
        {totalAgentBB != null && totalAgentBB > 0 && calc('% of Agent BB', agentBBM > 0 ? fmtPct(agentBBM / totalAgentBB) : '—', { formula: 'Agent BB ÷ total facility Agent BB' })}
        {calc('UBS Borrowing Base', c.ubsBorrowingBase, { money: true, pos: c.ubbM > 0, zero: c.ubbM === 0, formula: 'Uncalled Capital × UBS Advance Rate, capped by UBS concentration' })}
        {totalUbsBB != null && totalUbsBB > 0 && calc('% of UBS BB', c.ubbM > 0 ? fmtPct(c.ubbM / totalUbsBB) : '—', { formula: 'UBS BB ÷ total facility UBS BB' })}
        {f('Eligible (Included in BB)', LPRecord.included ? 'Yes' : 'No', 'included', { chk: true, wide: true, accent: true })}

        {sec('Additional Details')}
        <div style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
          {fieldLabel('Notes', false)}
          <textarea
            style={{ width: '100%', height: 72, background: editable ? undefined : 'var(--tbl)', color: editable ? undefined : 'var(--muted)' }}
            value={String(form.notes ?? '')}
            onChange={editable ? set('notes') : undefined}
            disabled={!editable}
            maxLength={NOTES_MAX}
          />
          <div style={{ marginTop: 3, textAlign: 'right', fontSize: 10, color: 'var(--muted)' }}>
            {String(form.notes ?? '').length}/{NOTES_MAX}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', maxHeight: '100%', minHeight: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="LPRecord-detail-hdr" style={{ background: 'var(--navy)', color: '#fff', padding: '14px 18px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="LPRecord-detail-name" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={LPRecord.investorName}>
              {LPRecord.investorName}
            </div>
            <div style={{ marginTop: 7, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: .9 }}>
              <Tag>{LPRecord.ubsLpCategory}</Tag>
              <span style={{ fontSize: 11, opacity: .7 }}>{pctTextFromFraction(LPRecord.ubsAdvanceRate) || classCfg.UBS_CLS_DEFAULT_RATE[LPRecord.ubsLpCategory] || classCfg.BUSA_RATE_MAP[LPRecord.ubsLpCategory] || '—'} UBS · {pctTextFromFraction(LPRecord.agentAdvanceRate) || '—'} Agent</span>
              {running && <span style={{ fontSize: 10, opacity: .8 }}>Calculating…</span>}
              {LPRecord.reclassified && <span className="rcl-badge">Reclassified</span>}
              {LPRecord.transferee  && <span className="tf-badge">Transferee</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24, lineHeight: 1, opacity: .7, padding: 0, marginTop: -2 }}>×</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 18px' }}>
        {LPRecord.reclassified && (
          <div role="status" style={{ marginBottom: 10, padding: '8px 12px', background: 'var(--amber-lt)', border: '1px solid var(--amber)', borderRadius: 4, color: 'var(--text)', fontSize: 11 }}>
            <strong>Reclassified record.</strong> Agent or UBS LP Classification changed during Save. Re-run Shadow BB and submit the updated result for Manager approval.
          </div>
        )}
        {renderDetail()}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        {confirmDelete ? (
          <>
            <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>
              Delete "{LPRecord.investorName}" from this facility's LP records? This cannot be undone.
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => onDelete?.(LPRecord)}>Confirm Delete</Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              {onDelete && editable && <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={!editable}>Save</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
