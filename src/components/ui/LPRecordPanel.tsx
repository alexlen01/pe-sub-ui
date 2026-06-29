import { useState, useEffect } from 'react'
import Button from './Button'
import Tag    from './Tag'
import { computeLPRecord, parseM, fmtM, fmtPct } from '../../services/bbCalculationService'
import {
  buildBusaRateFractions,
  getClassificationConfig,
  getEligibilityConfig,
  type ClassificationConfig,
  type EligibilityConfig,
} from '../../services/configService'
import type { LPRecord } from '../../services/lpService'

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

function inferLpSizeCriteria(lp: LPRecord): LpSizeCriteria {
  if (moneyToBillion(lp.aum) != null) return 'AUM'
  if (moneyToBillion(lp.nav) != null) return 'NAV'
  if (moneyToBillion(lp.pension) != null) return 'Assets'
  return ''
}

function lpSizeValue(lp: LPRecord, criteria: string): string {
  const source = criteria === 'NAV' ? lp.nav : criteria === 'Assets' ? lp.pension : lp.aum
  const b = moneyToBillion(source)
  return b == null ? '' : String(Number(b.toFixed(3)))
}

function applyLpSizeToRecord(lp: LPRecord, form: Record<string, unknown>): LPRecord {
  const next = { ...lp, ...form as Partial<LPRecord> } as LPRecord
  const size = billionToMoney(form.lpSize as string | number | undefined)
  switch (form.lpSizeCriteria) {
    case 'AUM': next.aum = size; break
    case 'NAV': next.nav = size; break
    case 'Assets': next.pension = size; break
  }
  return next
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

const VERSION_HISTORY = [
  { ts: '2026-05-27 10:45', user: 'J. Smith',  field: 'Classification',      before: 'Unrated >2bn', after: 'Rated',   note: 'Received S&P BB+ rating — confirmed with agent bank' },
  { ts: '2026-05-02 09:15', user: 'M. Patel',  field: 'Uncalled Capital',    before: '$31.2M',       after: '$28.4M',  note: 'Q1 2026 capital call processed' },
  { ts: '2026-04-14 11:04', user: 'L. Torres', field: 'AUM',                 before: '$3.9B',        after: '$4.2B',   note: 'Updated from Q1 2026 manager report' },
  { ts: '2025-12-31 08:00', user: 'System',    field: 'Included Flag',       before: 'N',            after: 'Y',       note: 'ERISA test passed — auto re-included' },
  { ts: '2025-11-18 16:30', user: 'J. Smith',  field: 'Concentration Limit', before: '7.5%',         after: '10.0%',   note: 'Agent confirmed higher concentration applies' },
]

export interface LPRecordPanelProps {
  lp: LPRecord | null
  open: boolean
  onClose: () => void
  onSave: (lp: LPRecord) => void
  canEdit?: boolean
  running?: boolean
  rank?: number
  totalAgentBB?: number
  totalUbsBB?: number
}

export default function LPRecordPanel({
  lp, open, onClose, onSave, canEdit = true, running = false, rank,
  totalAgentBB, totalUbsBB,
}: LPRecordPanelProps) {
  const [subview,   setSubview]   = useState<null | 'history' | 'reclassify'>(null)
  const [newCls,    setNewCls]    = useState('')
  const [rationale, setRationale] = useState('')
  const [form,      setForm]      = useState<Record<string, unknown>>({})
  const [classCfg,  setClassCfg]  = useState<ClassificationConfig | null>(null)
  const [eligCfg,   setEligCfg]   = useState<EligibilityConfig | null>(null)

  const editable = canEdit && !running

  useEffect(() => {
    if (!open) return
    Promise.all([getClassificationConfig(), getEligibilityConfig()])
      .then(([classification, eligibility]) => {
        setClassCfg(classification)
        setEligCfg(eligibility)
      })
      .catch(() => {})
  }, [open])

  useEffect(() => {
    if (!lp) return
    const lpSizeCriteria = inferLpSizeCriteria(lp)
    setSubview(null)
    setForm({
      name: lp.name ?? '', parent: lp.parent ?? '', spv: lp.spv, agentCls: lp.agentCls ?? '',
      fundSleeve: lp.fundSleeve ?? '',
      type: lp.type ?? '', cls: lp.cls ?? '', ig: lp.ig,
      region: lp.region ?? '', hq: lp.hq,
      sp: lp.sp ?? '', mdy: lp.mdy ?? '', fitch: lp.fitch ?? '',
      aum: lp.aum ?? '', nav: lp.nav ?? '', pension: lp.pension || 'N/A', pensionFunded: lp.pensionFunded || 'N/A',
      lpSizeCriteria, lpSize: lpSizeValue(lp, lpSizeCriteria),
      capCommit: lp.capCommit ?? '', pctCapCommit: lp.pctCapCommit ?? '', calledCap: lp.calledCap ?? '',
      uc: lp.uc ?? '', pctUncalled: lp.pctUncalled ?? '', pctCalled: lp.pctCalled ?? '',
      rate: lp.rate ?? '', agentRate: lp.agentRate ?? '',
      agentConc: lp.agentConc ?? '', ubsConc: lp.ubsConc ?? '', abb: lp.abb ?? '', ubb: lp.ubb ?? '',
      inc: lp.inc, notes: lp.notes ?? '',
    })
  }, [lp?.name])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !lp) return null
  if (!classCfg || !eligCfg) {
    return (
      <div style={{ height: '100%', minHeight: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18, color: 'var(--muted)', fontSize: 12 }}>
        Loading LP configuration...
      </div>
    )
  }

  const agentRateScheduleOpts = eligCfg.AGENT_TIERS.map(({ cls, rate }) => ({
    value: cls, label: `${cls} (${rate}%)`, rate: `${rate}%`,
  }))
  const agentRateForClass = (cls: string): string =>
    agentRateScheduleOpts.find(o => o.value === cls)?.rate ?? ''
  const busaRates = buildBusaRateFractions(classCfg)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => {
      const rawValue = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
      const value = k === 'notes' && typeof rawValue === 'string' ? rawValue.slice(0, NOTES_MAX) : rawValue
      const next = { ...p, [k]: value }
      if (k === 'cls' && !p.rate) next.rate = classCfg.UBS_CLS_DEFAULT_RATE[String(value)] ?? ''
      if (k === 'agentCls') next.agentRate = agentRateForClass(String(value)) || next.agentRate
      if (k === 'lpSizeCriteria' && lp) next.lpSize = lpSizeValue(applyLpSizeToRecord(lp, p), String(value))
      return next
    })

  const handleSave = () => {
    const eff = applyLpSizeToRecord(lp, form)
    const c = computeLPRecord(eff, undefined, busaRates)
    const capCommitM = parseM(eff.capCommit)
    const calledCapM = capCommitM - parseM(eff.uc)
    const agentRateDec = parseRatePct(eff.agentRate)
    onSave({
      ...eff,
      fundSleeve: form.fundSleeve as string | undefined,
      rate: eff.rate || classCfg.UBS_CLS_DEFAULT_RATE[form.cls as string] || classCfg.BUSA_RATE_MAP[form.cls as string] || lp.rate,
      clsTag: classCfg.CLS_TAG_MAP[form.cls as string] ?? lp.clsTag,
      hq: c.busaRate === 0.90,
      calledCap: fmtM(calledCapM),
      pctCalled: fmtPct(capCommitM > 0 ? calledCapM / capCommitM : 0),
      abb: Number.isFinite(agentRateDec) ? fmtM(parseM(eff.uc) * agentRateDec) : (eff.abb ?? '$0'),
      ubb: c.ubb,
      uec: c.uec,
      ubsExcessConc: c.concExcessM > 0 ? fmtM(c.concExcessM) : '—',
    } as LPRecord)
    onClose()
  }

  const handleReclassify = () => {
    onSave({
      ...lp,
      cls: newCls as LPRecord['cls'],
      rcl: true,
      clsTag: classCfg.CLS_TAG_MAP[newCls] ?? lp.clsTag,
      rate: classCfg.UBS_CLS_DEFAULT_RATE[newCls] ?? classCfg.BUSA_RATE_MAP[newCls] ?? lp.rate,
      notes: (lp.notes ? lp.notes + '\n' : '') + `Reclassified to ${newCls}: ${rationale}`,
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

  const f = (label: string, _viewVal: unknown, editKey: string | null, cfg: Record<string, unknown> = {}) => {
    const { wide, span2, opts, chk, ta, ro, formula, cols, money, accent, maxLength, inputMode, width } = cfg
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
      : money ? formatMoneyText(editVal) : String(editVal ?? '')
    const selectOptions = (opts as readonly (string | { value: string; label: string })[] | undefined) ?? []
    const optionValue = (o: string | { value: string; label: string }) => typeof o === 'string' ? o : o.value
    const optionLabel = (o: string | { value: string; label: string }) => typeof o === 'string' ? (o || 'Not Rated') : o.label
    return (
      <div className="form-group" style={{ ...colSt, ...boxSt, marginBottom: 0 }} key={label || editKey || ''}>
        <label style={{ display: 'block' }}>{fieldLabel(label, !!ro)}</label>
        {chk
          ? <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer', marginTop: 4 }}>
              <input type="checkbox" checked={!!form[editKey!]} onChange={set(editKey!)} disabled={disabled} /> Yes
            </label>
          : ta
          ? <textarea style={{ width: '100%', height: 72, ...roSt }} value={displayVal} onChange={disabled ? undefined : set(editKey!)} disabled={disabled} maxLength={typeof maxLength === 'number' ? maxLength : undefined} />
          : opts
          ? <select style={controlSt} value={String(editVal)} onChange={disabled ? undefined : set(editKey!)} disabled={disabled}>
              {selectOptions.map(o => <option key={optionValue(o) || '__empty'} value={optionValue(o)}>{optionLabel(o)}</option>)}
            </select>
          : <input type="text" style={controlSt} value={displayVal} onChange={ro || disabled ? undefined : set(editKey!)} readOnly={!!ro} disabled={disabled} inputMode={typeof inputMode === 'string' ? inputMode as React.HTMLAttributes<HTMLInputElement>['inputMode'] : undefined} maxLength={typeof maxLength === 'number' ? maxLength : undefined} />
        }
        {caption}
      </div>
    )
  }

  const COLS: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '6px 16px' }

  const renderDetail = () => {
    const eff = applyLpSizeToRecord(lp, form)
    const c = computeLPRecord(eff, undefined, busaRates)
    const capCommitM = parseM(eff.capCommit)
    const ucM = parseM(eff.uc)
    const calledCapM = capCommitM - ucM
    const agentRateDec = parseRatePct(eff.agentRate)
    const calledCapStr   = fmtM(calledCapM)
    const pctCalledStr   = fmtPct(capCommitM > 0 ? calledCapM / capCommitM : 0)
    const agentBBStr     = Number.isFinite(agentRateDec) ? fmtM(ucM * agentRateDec) : '—'
    const agentBBM       = Number.isFinite(agentRateDec) ? ucM * agentRateDec : 0
    const ubsExcessStr   = eff.inc && eff.cls !== 'Excluded' && c.concExcessM > 0 ? fmtM(c.concExcessM) : (eff.ubsExcessConc || '—')
    const agentExcessStr = eff.agentExcessConc || '—'
    const agentClsValue  = String(form.agentCls ?? '')
    const agentClsOptions = agentClsValue && !agentRateScheduleOpts.some(o => o.value === agentClsValue)
      ? [{ value: '', label: 'Select classification' }, { value: agentClsValue, label: agentClsValue }, ...agentRateScheduleOpts]
      : [{ value: '', label: 'Select classification' }, ...agentRateScheduleOpts]

    const calc = (label: string, val: unknown, cfg: Record<string, unknown> = {}) =>
      f(label, val, null, { ro: true, editVal: val, ...cfg })

    return (
      <div style={COLS}>
        {sec('Identification & Classification')}
        {calc('Rank', rank ?? '—', { cols: 1, width: 64, formula: 'Ordinal rank in the current LP view' })}
        {f('Investor Name', lp.name, 'name', { cols: 5 })}
        {f('SPV?', lp.spv ? 'Yes' : 'No', 'spv', { chk: true, cols: 1 })}
        {f('Parent', lp.parent, 'parent', { cols: 5 })}
        {f('Fund Sleeve', lp.fundSleeve ?? '', 'fundSleeve', { cols: 3 })}
        {f('Region / Location', lp.region || '—', 'region', { opts: ['', ...classCfg.REGION_OPTS], cols: 3 })}
        {f('Investor Type', lp.investorType ?? lp.type, 'type', { opts: classCfg.INVESTOR_TYPE_OPTS })}
        {f('Institutional vs HNW', lp.type, 'type', { opts: classCfg.TYPE_OPTS })}
        {f('Agent LP Classification', lp.agentCls || '—', 'agentCls', { opts: agentClsOptions })}
        {f('UBS LP Classification', lp.cls, 'cls', { opts: classCfg.UBS_CLS_OPTS.filter(Boolean) })}
        {f('Investment Grade?', lp.ig ? 'Yes' : 'No', 'ig', { chk: true })}
        {Boolean(form.cls && classCfg.CLS_CRITERIA[form.cls as string]) && (
          <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', background: 'var(--tbl)', borderRadius: 4, padding: '6px 10px', marginTop: -6 }}>
            <strong style={{ color: 'var(--navy)' }}>Qualifying criteria:</strong> {classCfg.CLS_CRITERIA[form.cls as string]}
          </div>
        )}

        {sec('Credit Ratings')}
        {f('S&P', lp.sp, 'sp', { opts: classCfg.SP_RATING_OPTS, cols: 2 })}
        {f("Moody's", lp.mdy, 'mdy', { opts: classCfg.MDY_RATING_OPTS, cols: 2 })}
        {f('Fitch', lp.fitch, 'fitch', { opts: classCfg.FITCH_RATING_OPTS, cols: 2 })}

        {sec('Capital Metrics')}
        {f('LP Size', form.lpSize, 'lpSize', { moneyUnit: 'B' })}
        {f('Size Measure', form.lpSizeCriteria, 'lpSizeCriteria', { opts: classCfg.LP_SIZE_CRITERIA_OPTS.filter(Boolean) })}
        {f('Capital Commitments', lp.capCommit, 'capCommit', { money: true })}
        {calc('% of Capital Commitments', lp.pctCapCommit, { formula: 'LP commitment ÷ total fund commitments' })}
        {calc('Called Capital', calledCapStr, { money: true, formula: 'Capital Commitments − Uncalled Capital' })}
        {f('Uncalled Capital', lp.uc, 'uc', { money: true })}
        {calc('% of Uncalled Capital', lp.pctUncalled, { formula: 'LP uncalled ÷ total fund uncalled' })}
        {calc('% of LP Called', pctCalledStr, { formula: 'Called Capital ÷ Capital Commitments' })}

        {sec('Borrowing Base Calculation')}
        {f('Agent Advance Rate', lp.agentRate, 'agentRate')}
        {f('UBS Advance Rate', lp.rate, 'rate')}
        {f('Agent Concentration Limit', lp.agentConc, 'agentConc')}
        {f('UBS Concentration Limit', lp.ubsConc, 'ubsConc')}
        {calc('Agent Excess Concentration', agentExcessStr, { money: true, formula: 'Excess uncalled above Agent concentration limit' })}
        {calc('UBS Excess Concentration', ubsExcessStr, { money: true, formula: 'Excess uncalled above UBS concentration limit' })}
        {calc('Agent Borrowing Base', agentBBStr, { money: true, formula: 'Uncalled Capital × Agent Advance Rate, capped by Agent concentration' })}
        {totalAgentBB != null && totalAgentBB > 0 && calc('% of Agent BB', agentBBM > 0 ? fmtPct(agentBBM / totalAgentBB) : '—', { formula: 'Agent BB ÷ total facility Agent BB' })}
        {calc('UBS Borrowing Base', c.ubb, { money: true, pos: c.ubbM > 0, zero: c.ubbM === 0, formula: 'Uncalled Capital × UBS Advance Rate, capped by UBS concentration' })}
        {totalUbsBB != null && totalUbsBB > 0 && calc('% of UBS BB', c.ubbM > 0 ? fmtPct(c.ubbM / totalUbsBB) : '—', { formula: 'UBS BB ÷ total facility UBS BB' })}
        {f('Eligible (Included in BB)', lp.inc ? 'Yes' : 'No', 'inc', { chk: true, wide: true, accent: true })}

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
          {classCfg.UBS_CLS_OPTS.filter(Boolean).map(o => <option key={o} value={o}>{o} - {classCfg.UBS_CLS_DEFAULT_RATE[o] ?? '?'} UBS</option>)}
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
      {newCls !== lp.cls && (
        <div style={{ padding: '8px 12px', background: 'var(--danger-lt)', borderRadius: 4, fontSize: 12 }}>
          <strong style={{ color: 'var(--danger)' }}>Impact:</strong> Advance rate changes from <strong>{lp.rate || classCfg.UBS_CLS_DEFAULT_RATE[lp.cls] || classCfg.BUSA_RATE_MAP[lp.cls]}</strong> to <strong>{classCfg.UBS_CLS_DEFAULT_RATE[newCls]}</strong>. Shadow BB will need to be recalculated.
        </div>
      )}
    </div>
  )

  const subviewTitle = subview === 'history' ? 'Version History' : subview === 'reclassify' ? 'Reclassify' : null

  return (
    <div style={{ height: '100%', maxHeight: '100%', minHeight: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="lp-detail-hdr" style={{ background: 'var(--navy)', color: '#fff', padding: '14px 18px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="lp-detail-name" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lp.name}>
              {lp.name}
              {subviewTitle && <span style={{ fontWeight: 400, opacity: 0.65, fontSize: 12 }}> / {subviewTitle}</span>}
            </div>
            <div style={{ marginTop: 7, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: .9 }}>
              <Tag>{lp.cls}</Tag>
              <span style={{ fontSize: 11, opacity: .7 }}>{lp.rate || classCfg.UBS_CLS_DEFAULT_RATE[lp.cls] || classCfg.BUSA_RATE_MAP[lp.cls] || '—'} UBS · {lp.agentRate || '—'} Agent</span>
              {running && <span style={{ fontSize: 10, opacity: .8 }}>Calculating…</span>}
              {lp.rcl && <span className="rcl-badge">Reclassified</span>}
              {lp.tf  && <span className="tf-badge">Transferee</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24, lineHeight: 1, opacity: .7, padding: 0, marginTop: -2 }}>×</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 18px' }}>
        {subview === 'history'     ? renderHistory()    :
         subview === 'reclassify'  ? renderReclassify() :
         renderDetail()}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        {subview === 'history' ? (
          <>
            <Button variant="secondary" onClick={() => setSubview(null)}>&#x2190; Back to LP Record</Button>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          </>
        ) : subview === 'reclassify' ? (
          <>
            <Button variant="secondary" onClick={() => setSubview(null)}>&#x2190; Back to LP Record</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button disabled={newCls === lp.cls || !rationale.trim()} onClick={handleReclassify}>Apply Reclassification</Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={() => setSubview('history')}>Version History</Button>
              {editable && <Button variant="secondary" onClick={() => { setNewCls(lp.cls); setRationale(''); setSubview('reclassify') }}>Reclassify</Button>}
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
