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
import { formatPercentageText, formatPercentageValue } from '../../utils/percentage'

const NOTES_MAX    = 250

type LpSizeCriteria = 'AUM' | 'NAV' | 'Assets' | ''

function moneyToBillion(s: string | undefined | null): number | null {
  const m = String(s ?? '').match(/\$?\s*([\d,.]+)\s*([KMBT]?)/i)
  if (!m) return null
  const val = parseFloat(m[1].replace(/,/g, ''))
  if (!Number.isFinite(val)) return null
  const unit = m[2].toUpperCase()
  if (unit === 'T') return val * 1000
  if (unit === 'M') return val / 1000
  if (unit === 'K') return val / 1_000_000
  return val
}

function billionToMoney(b: string | number | undefined | null): string {
  const fromMoney = typeof b === 'string' ? moneyToBillion(b) : null
  const n = fromMoney ?? (typeof b === 'number' ? b : parseFloat(String(b ?? '').replace(/[$,B]/gi, '')))
  return Number.isFinite(n)
    ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 3 })}B`
    : ''
}

function inferLpSizeCriteria(LPRecord: LPRecord): LpSizeCriteria {
  if (moneyToBillion(LPRecord.aum) != null) return 'AUM'
  if (moneyToBillion(LPRecord.nav) != null) return 'NAV'
  if (moneyToBillion(LPRecord.pension) != null) return 'Assets'
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
  const source = criteria === 'NAV' ? LPRecord.nav : criteria === 'Assets' ? LPRecord.pension : LPRecord.aum
  const b = moneyToBillion(source)
  return b == null ? '' : String(Number(b.toFixed(3)))
}

function applyLpSizeToRecord(LPRecord: LPRecord, form: Record<string, unknown>): LPRecord {
  const next = { ...LPRecord, ...form as Partial<LPRecord> } as LPRecord
  const size = billionToMoney(form.lpSize as string | number | undefined)
  switch (form.lpSizeCriteria) {
    case 'AUM': next.aum = size; break
    case 'NAV': next.nav = size; break
    case 'Assets': next.pension = size; break
  }
  return next
}

export function buildLpRecordFromForm(
  LPRecord: LPRecord,
  form: Record<string, unknown>,
  classCfg: { UBS_CLS_DEFAULT_RATE?: Record<string, string>; BUSA_RATE_MAP?: Record<string, string>; CLS_TAG_MAP?: Record<string, string> },
  busaRates: Record<string, number>,
  totalUncalledM?: number,
): LPRecord {
  const eff = applyLpSizeToRecord(LPRecord, form)
  const ubsConcPct = parseRatePct(eff.ubsConc)
  const dynamicConcLimitM = totalUncalledM != null && Number.isFinite(ubsConcPct)
    ? totalUncalledM * ubsConcPct
    : undefined
  const c = computeLPRecord(
    dynamicConcLimitM == null ? eff : { ...eff, concLimitM: dynamicConcLimitM } as LPRecord & { concLimitM: number },
    undefined,
    busaRates,
  )
  const capCommitM = parseM(eff.capCommit)
  const calledCapM = capCommitM - parseM(eff.uc)
  const agentRateDec = parseRatePct(eff.agentRate)
  const agentConcPct = parseRatePct(eff.agentConc)
  const agentConcLimitM = totalUncalledM != null && Number.isFinite(agentConcPct) && agentConcPct > 0
    ? totalUncalledM * agentConcPct
    : undefined
  const agentExcessM = eff.inc && eff.cls !== 'Excluded' && agentConcLimitM != null
    ? Math.max(0, parseM(eff.uc) - agentConcLimitM)
    : 0
  return {
    ...eff,
    fundSleeve: form.fundSleeve as string | undefined,
    rate: eff.rate || classCfg.UBS_CLS_DEFAULT_RATE?.[String(form.cls)] || classCfg.BUSA_RATE_MAP?.[String(form.cls)] || LPRecord.rate,
    clsTag: classCfg.CLS_TAG_MAP?.[String(form.cls)] ?? LPRecord.clsTag,
    hq: c.busaRate === 0.90,
    calledCap: fmtM(calledCapM),
    pctCalled: fmtPct(capCommitM > 0 ? calledCapM / capCommitM : 0),
    abb: Number.isFinite(agentRateDec) ? fmtM(parseM(eff.uc) * agentRateDec) : (eff.abb ?? '$0'),
    ubb: c.ubb,
    uec: c.uec,
    ubsExcessConc: c.concExcessM > 0 ? fmtM(c.concExcessM) : '—',
    agentExcessConc: agentExcessM > 0 ? fmtM(agentExcessM) : '—',
  } as LPRecord
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
  enableReclassify?: boolean
}

export default function LPRecordPanel({
  LPRecord, open, onClose, onSave, onDelete, canEdit = true, running = false,
  totalAgentBB, totalUbsBB, totalUncalledM, enableReclassify = false,
}: LPRecordPanelProps) {
  const [subview,   setSubview]   = useState<null | 'reclassify'>(null)
  const [newCls,    setNewCls]    = useState('')
  const [rationale, setRationale] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form,      setForm]      = useState<Record<string, unknown>>({})
  const configCache = useConfigCache()
  const classCfg = configCache.classification
  const eligCfg = configCache.eligibility

  const editable = canEdit && !running

  useEffect(() => {
    if (!LPRecord) return
    const lpSizeCriteria = inferLpSizeCriteria(LPRecord)
    setSubview(null)
    setConfirmDelete(false)
    setForm({
      name: LPRecord.name ?? '', parent: LPRecord.parent ?? '', spv: LPRecord.spv, agentCls: LPRecord.agentCls ?? '',
      agentClsSource: LPRecord.agentClsSource ?? '',
      fundSleeve: LPRecord.fundSleeve ?? '',
      investorType: LPRecord.investorType ?? '', instVsHnw: LPRecord.instVsHnw ?? '', cls: LPRecord.cls ?? '', ig: LPRecord.ig,
      region: LPRecord.region ?? '', hq: LPRecord.hq,
      sp: LPRecord.sp ?? '', mdy: LPRecord.mdy ?? '', fitch: LPRecord.fitch ?? '',
      aum: LPRecord.aum ?? '', nav: LPRecord.nav ?? '', pension: LPRecord.pension || 'N/A', pensionFunded: LPRecord.pensionFunded || 'N/A',
      lpSizeCriteria, lpSize: lpSizeValue(LPRecord, lpSizeCriteria),
      capCommit: LPRecord.capCommit ?? '', pctCapCommit: LPRecord.pctCapCommit ?? '', calledCap: LPRecord.calledCap ?? '',
      uc: LPRecord.uc ?? '', pctUncalled: LPRecord.pctUncalled ?? '', pctCalled: LPRecord.pctCalled ?? '',
      rate: LPRecord.rate ?? '', agentRate: LPRecord.agentRate ?? '',
      agentConc: LPRecord.agentConc ?? '', ubsConc: LPRecord.ubsConc ?? '', abb: LPRecord.abb ?? '', ubb: LPRecord.ubb ?? '',
      inc: LPRecord.inc, notes: LPRecord.notes ?? '',
    })
  }, [LPRecord?.name])

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
  const agentRateForClass = (cls: string): string =>
    agentRateScheduleOpts.find(o => o.value === cls)?.rate ?? ''
  const busaRates = buildBusaRateFractions(classCfg)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => {
      const rawValue = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
      const value = k === 'notes' && typeof rawValue === 'string' ? rawValue.slice(0, NOTES_MAX) : rawValue
      const next = { ...p, [k]: value }
      if (k === 'cls') {
        if (!p.rate) next.rate = classCfg.UBS_CLS_DEFAULT_RATE[String(value)] ?? ''
        // Auto-assign the per-LP concentration limit from the class default. Evaluate the
        // Excluded bucket first: it is a hard 0 regardless of any configured residual default.
        if (String(value) === 'Excluded') {
          next.ubsConc = '0.0%'
        } else {
          const clsConcDefault = clsConcLimitPctForCls(eligCfg, String(value))
          if (clsConcDefault !== '') next.ubsConc = formatPercentageValue(clsConcDefault)
        }
      }
      if (k === 'agentCls') {
        next.agentClsSource = 'USER_EDITED'
        next.agentRate = agentRateForClass(String(value)) || next.agentRate
      }
      if (k === 'lpSizeCriteria' && LPRecord) next.lpSize = lpSizeValue(applyLpSizeToRecord(LPRecord, p), String(value))
      return next
    })

  const handleSave = () => {
    onSave(buildLpRecordFromForm(LPRecord, form, classCfg, busaRates, totalUncalledM))
    onClose()
  }

  const handleReclassify = () => {
    onSave({
      ...LPRecord,
      cls: newCls as LPRecord['cls'],
      rcl: true,
      clsTag: classCfg.CLS_TAG_MAP[newCls] ?? LPRecord.clsTag,
      rate: classCfg.UBS_CLS_DEFAULT_RATE[newCls] ?? classCfg.BUSA_RATE_MAP[newCls] ?? LPRecord.rate,
      notes: (LPRecord.notes ? LPRecord.notes + '\n' : '') + `Reclassified to ${newCls}: ${rationale}`,
    } as LPRecord)
    setSubview(null)
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
    const displayVal = cfg.moneyUnit === 'B'
      ? billionToMoney(editVal as string | number | undefined)
      : money ? formatMoneyText(editVal) : percentage ? formatPercentageText(editVal, '') : String(editVal ?? '')
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
  const ubsClsRate = (cls: string) => classCfg.BUSA_RATE_MAP[cls] ?? classCfg.UBS_CLS_DEFAULT_RATE[cls] ?? '?'

  const renderDetail = () => {
    const eff = applyLpSizeToRecord(LPRecord, form)
    const ubsConcPctForCalc = parseRatePct(eff.ubsConc)
    const dynamicConcLimitM = totalUncalledM != null && Number.isFinite(ubsConcPctForCalc)
      ? totalUncalledM * ubsConcPctForCalc
      : undefined
    const c = computeLPRecord(
      dynamicConcLimitM == null ? eff : { ...eff, concLimitM: dynamicConcLimitM } as LPRecord & { concLimitM: number },
      undefined,
      busaRates,
    )
    const capCommitM = parseM(eff.capCommit)
    const ucM = parseM(eff.uc)
    const calledCapM = capCommitM - ucM
    const agentRateDec = parseRatePct(eff.agentRate)
    const calledCapStr   = fmtM(calledCapM)
    const pctCalledStr   = fmtPct(capCommitM > 0 ? calledCapM / capCommitM : 0)
    const agentBBStr     = Number.isFinite(agentRateDec) ? fmtM(ucM * agentRateDec) : '—'
    const agentBBM       = Number.isFinite(agentRateDec) ? ucM * agentRateDec : 0
    const ubsExcessStr   = eff.inc && eff.cls !== 'Excluded' && c.concExcessM > 0 ? fmtM(c.concExcessM) : (eff.ubsExcessConc || '—')
    const agentConcPctForCalc = parseRatePct(eff.agentConc)
    const agentConcLimitM = totalUncalledM != null && Number.isFinite(agentConcPctForCalc) && agentConcPctForCalc > 0
      ? totalUncalledM * agentConcPctForCalc
      : undefined
    const agentExcessM = eff.inc && eff.cls !== 'Excluded' && agentConcLimitM != null
      ? Math.max(0, ucM - agentConcLimitM)
      : 0
    const agentExcessStr = agentConcLimitM != null ? (agentExcessM > 0 ? fmtM(agentExcessM) : '—') : (eff.agentExcessConc || '—')
    const agentClsValue  = String(form.agentCls ?? '')
    const agentClsOptions = agentClsValue && !agentRateScheduleOpts.some(o => o.value === agentClsValue)
      ? [{ value: '', label: 'Select classification' }, { value: agentClsValue, label: agentClsValue }, ...agentRateScheduleOpts]
      : [{ value: '', label: 'Select classification' }, ...agentRateScheduleOpts]

    // Non-blocking guard: warn when the UBS concentration limit falls outside the accepted
    // range for the selected class. Only percent-style limits are checked — legacy dollar
    // strings ("$4.0M") carry no comparable range and are left alone.
    const concBounds = clsConcLimitBoundsForCls(eligCfg, String(form.cls ?? ''))
    const rawUbsConc = String(form.ubsConc ?? '').trim()
    const ubsConcPct = parseFloat(rawUbsConc.replace('%', '').trim())
    const isPctConc = rawUbsConc !== '' && !/[$mbk]/i.test(rawUbsConc)
    const concOutOfRange = !!concBounds && isPctConc && Number.isFinite(ubsConcPct)
      && (ubsConcPct < concBounds.min || ubsConcPct > concBounds.max)

    const calc = (label: string, val: unknown, cfg: Record<string, unknown> = {}) =>
      f(label, val, null, { ro: true, editVal: val, ...cfg })

    return (
      <div style={COLS}>
        {sec('Identification & Classification')}
        {calc('Rank', LPRecord.rank ?? '—', { cols: 1 })}
        {f('Investor Name', LPRecord.name, 'name', { cols: 5 })}
        {f('SPV?', LPRecord.spv ? 'Yes' : 'No', 'spv', { chk: true, cols: 1 })}
        {f('Parent', LPRecord.parent, 'parent', { cols: 5 })}
        {f('Fund Sleeve', LPRecord.fundSleeve ?? '', 'fundSleeve', { cols: 3 })}
        {f('Region / Location', LPRecord.region || '—', 'region', { cols: 3, typeahead: true })}
        {f('Investor Type', LPRecord.investorType ?? '', 'investorType', { opts: classCfg.INVESTOR_TYPE_OPTS, emptyLabel: '—' })}
        {f('Institutional vs HNW', LPRecord.instVsHnw, 'instVsHnw', { opts: classCfg.TYPE_OPTS })}
        {f('Agent LP Classification', LPRecord.agentCls || '—', 'agentCls', { opts: agentClsOptions })}
        {f('Agent Classification Source', LPRecord.agentClsSource || '—', 'agentClsSource', { ro: true })}
        <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', borderRadius: 4, padding: '6px 10px', marginTop: -6 }}>
          {agentClsSourceNote(String(form.agentClsSource ?? ''), Boolean(form.agentCls))}
        </div>
        {f('UBS LP Classification', LPRecord.cls, 'cls', { opts: ubsClsOptions, emptyLabel: 'Unclassified' })}
        {f('Investment Grade?', LPRecord.ig ? 'Yes' : 'No', 'ig', { chk: true })}
        {Boolean(form.cls && classCfg.CLS_CRITERIA[form.cls as string]) && (
          <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', borderRadius: 4, padding: '6px 10px', marginTop: -6 }}>
            <strong style={{ color: 'var(--navy)' }}>Qualifying criteria:</strong> {classCfg.CLS_CRITERIA[form.cls as string]}
          </div>
        )}

        {sec('Credit Ratings')}
        {f('S&P', LPRecord.sp, 'sp', { opts: classCfg.SP_RATING_OPTS, cols: 2 })}
        {f("Moody's", LPRecord.mdy, 'mdy', { opts: classCfg.MDY_RATING_OPTS, cols: 2 })}
        {f('Fitch', LPRecord.fitch, 'fitch', { opts: classCfg.FITCH_RATING_OPTS, cols: 2 })}

        {sec('Capital Metrics')}
        {f('LP Size', form.lpSize, 'lpSize', { moneyUnit: 'B' })}
        {f('Size Measure', form.lpSizeCriteria, 'lpSizeCriteria', { opts: classCfg.LP_SIZE_CRITERIA_OPTS.filter(Boolean) })}
        {f('Capital Commitments', LPRecord.capCommit, 'capCommit', { money: true })}
        {calc('% of Capital Commitments', LPRecord.pctCapCommit, { formula: 'LP commitment ÷ total fund commitments' })}
        {calc('Called Capital', calledCapStr, { money: true, formula: 'Capital Commitments − Uncalled Capital' })}
        {f('Uncalled Capital', LPRecord.uc, 'uc', { money: true })}
        {calc('% of Uncalled Capital', LPRecord.pctUncalled, { formula: 'LP uncalled ÷ total fund uncalled' })}
        {calc('% of LP Called', pctCalledStr, { formula: 'Called Capital ÷ Capital Commitments' })}

        {sec('Borrowing Base Calculation')}
        {f('Agent Advance Rate', LPRecord.agentRate, 'agentRate', { percentage: true, percentageStep: 5 })}
        {f('UBS Advance Rate', LPRecord.rate, 'rate', { percentage: true, percentageStep: 5 })}
        {f('Agent Concentration Limit', LPRecord.agentConc, 'agentConc', { percentage: true, percentageStep: 0.5 })}
        {f('UBS Concentration Limit', LPRecord.ubsConc, 'ubsConc', { percentage: true, percentageStep: 0.5 })}
        {concOutOfRange && concBounds && (
          <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#7a5c00', background: '#fff8e6', border: '1px solid #f0d98a', borderRadius: 4, padding: '6px 10px', marginTop: -2 }}>
            <strong>⚠ Outside norm:</strong> {ubsConcPct}% is outside the accepted {concBounds.min}–{concBounds.max}% range for {String(form.cls)}. Verify before saving.
          </div>
        )}
        {calc('Agent Excess Concentration', agentExcessStr, { money: true, formula: 'Excess uncalled above Agent concentration limit' })}
        {calc('UBS Excess Concentration', ubsExcessStr, { money: true, formula: 'Excess uncalled above UBS concentration limit' })}
        {calc('Agent Borrowing Base', agentBBStr, { money: true, formula: 'Uncalled Capital × Agent Advance Rate, capped by Agent concentration' })}
        {totalAgentBB != null && totalAgentBB > 0 && calc('% of Agent BB', agentBBM > 0 ? fmtPct(agentBBM / totalAgentBB) : '—', { formula: 'Agent BB ÷ total facility Agent BB' })}
        {calc('UBS Borrowing Base', c.ubb, { money: true, pos: c.ubbM > 0, zero: c.ubbM === 0, formula: 'Uncalled Capital × UBS Advance Rate, capped by UBS concentration' })}
        {totalUbsBB != null && totalUbsBB > 0 && calc('% of UBS BB', c.ubbM > 0 ? fmtPct(c.ubbM / totalUbsBB) : '—', { formula: 'UBS BB ÷ total facility UBS BB' })}
        {f('Eligible (Included in BB)', LPRecord.inc ? 'Yes' : 'No', 'inc', { chk: true, wide: true, accent: true })}

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

  const renderReclassify = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
      <div className="form-group">
        <label className="form-label">New Classification *</label>
        <select style={{ width: '100%' }} value={newCls} onChange={e => setNewCls(e.target.value)}>
          {ubsClsOptions.filter(Boolean).map(o => <option key={o} value={o}>{o} - {ubsClsRate(o)} UBS</option>)}
        </select>
      </div>
      {newCls && (
        <div style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', borderRadius: 4, padding: '6px 10px' }}>
          <strong style={{ color: 'var(--navy)' }}>Qualifying criteria:</strong> {classCfg.CLS_CRITERIA[newCls]}
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Rationale / Supporting Evidence *</label>
        <textarea
          style={{ width: '100%', height: 80 }}
          placeholder="Describe the basis for reclassification…"
          value={rationale}
          onChange={e => setRationale(e.target.value)}
        />
      </div>
      {newCls !== LPRecord.cls && (
        <div style={{ padding: '8px 12px', background: 'var(--danger-lt)', borderRadius: 4, fontSize: 12 }}>
          <strong style={{ color: 'var(--danger)' }}>Impact:</strong> Advance rate changes from <strong>{LPRecord.rate || classCfg.UBS_CLS_DEFAULT_RATE[LPRecord.cls] || classCfg.BUSA_RATE_MAP[LPRecord.cls]}</strong> to <strong>{ubsClsRate(newCls)}</strong>. Shadow BB will need to be recalculated.
        </div>
      )}
    </div>
  )

  const subviewTitle = subview === 'reclassify' ? 'Reclassify' : null

  return (
    <div style={{ height: '100%', maxHeight: '100%', minHeight: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="LPRecord-detail-hdr" style={{ background: 'var(--navy)', color: '#fff', padding: '14px 18px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="LPRecord-detail-name" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={LPRecord.name}>
              {LPRecord.name}
              {subviewTitle && <span style={{ fontWeight: 400, opacity: 0.65, fontSize: 12 }}> / {subviewTitle}</span>}
            </div>
            <div style={{ marginTop: 7, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: .9 }}>
              <Tag>{LPRecord.cls}</Tag>
              <span style={{ fontSize: 11, opacity: .7 }}>{LPRecord.rate || classCfg.UBS_CLS_DEFAULT_RATE[LPRecord.cls] || classCfg.BUSA_RATE_MAP[LPRecord.cls] || '—'} UBS · {LPRecord.agentRate || '—'} Agent</span>
              {running && <span style={{ fontSize: 10, opacity: .8 }}>Calculating…</span>}
              {LPRecord.rcl && <span className="rcl-badge">Reclassified</span>}
              {LPRecord.tf  && <span className="tf-badge">Transferee</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24, lineHeight: 1, opacity: .7, padding: 0, marginTop: -2 }}>×</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 18px' }}>
        {subview === 'reclassify'  ? renderReclassify() :
         renderDetail()}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        {subview === 'reclassify' ? (
          <>
            <Button variant="secondary" onClick={() => setSubview(null)}>&#x2190; Back to LPRecord Record</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button disabled={newCls === LPRecord.cls || !rationale.trim()} onClick={handleReclassify}>Apply Reclassification</Button>
            </div>
          </>
        ) : confirmDelete ? (
          <>
            <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>
              Delete "{LPRecord.name}" from this facility's LP records? Ranks will be recomputed. This cannot be undone.
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => onDelete?.(LPRecord)}>Confirm Delete</Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              {enableReclassify && editable && <Button variant="secondary" onClick={() => { setNewCls(LPRecord.cls); setRationale(''); setSubview('reclassify') }}>Reclassify</Button>}
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
