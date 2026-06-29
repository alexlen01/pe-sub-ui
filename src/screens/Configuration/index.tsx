import { useEffect, useState, useCallback } from 'react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { useApp } from '../../context/AppContext'
import { api } from '../../services/api'
import type { RateTier, EligRule, ConcLimit, GlobalSetting } from '../../services/configService'

type AgentRateParam = { label: string; value: string | number; agency?: 'sp' | 'mdy' | 'fitch' }

interface EligibilityConfig {
  BUSA_TIERS:        RateTier[]
  AGENT_TIERS:       RateTier[]
  AGENT_RATE_PARAMS: AgentRateParam[]
  ELIG_RULES:        EligRule[]
  CONC_LIMITS:       ConcLimit[]
  GLOBAL_SETTINGS:   GlobalSetting[]
}

function missingConfigSections(config: Partial<EligibilityConfig>): string[] {
  return [
    ['BUSA_TIERS', config.BUSA_TIERS],
    ['AGENT_TIERS', config.AGENT_TIERS],
    ['AGENT_RATE_PARAMS', config.AGENT_RATE_PARAMS],
    ['ELIG_RULES', config.ELIG_RULES],
    ['CONC_LIMITS', config.CONC_LIMITS],
    ['GLOBAL_SETTINGS', config.GLOBAL_SETTINGS],
  ].filter(([, value]) => !Array.isArray(value)).map(([key]) => key as string)
}

function isCompleteConfig(config: Partial<EligibilityConfig>): config is EligibilityConfig {
  return missingConfigSections(config).length === 0
}

const RETENTION_OPTIONS = [1, 2, 3, 5, 7, 10, 15]

const SNAPSHOT_FREQ_OPTIONS: Array<{ label: string; days: number }> = [
  { label: 'Daily',          days: 1   },
  { label: 'Weekly',         days: 7   },
  { label: 'Bi-weekly',      days: 14  },
  { label: 'Monthly',        days: 30  },
  { label: 'Quarterly',      days: 90  },
  { label: 'Semi-annually',  days: 180 },
  { label: 'Annually',       days: 365 },
]

const WATERMARK_OPTIONS = [
  'DRAFT - For Internal Review',
  'DRAFT',
  'PRELIMINARY',
  'CONFIDENTIAL',
  'FINAL',
]

// S&P / Fitch scale — IG boundary is BBB- and above
const SP_RATING_OPTS_IG    = ['BBB-', 'BBB', 'BBB+', 'A-', 'A', 'A+', 'AA-', 'AA', 'AA+', 'AAA']
const SP_RATING_OPTS_SUBIG = ['BB+', 'BB', 'BB-', 'B+', 'B', 'B-']

// Moody's scale — IG boundary is Baa3 and above
const MDY_RATING_OPTS_IG    = ['Baa3', 'Baa2', 'Baa1', 'A3', 'A2', 'A1', 'Aa3', 'Aa2', 'Aa1', 'Aaa']
const MDY_RATING_OPTS_SUBIG = ['Ba1', 'Ba2', 'Ba3', 'B1', 'B2', 'B3']

function RatingSelect({ value, agency, onChange }: {
  value: string
  agency: 'sp' | 'mdy' | 'fitch'
  onChange: (v: string) => void
}) {
  const igOpts    = agency === 'mdy' ? MDY_RATING_OPTS_IG    : SP_RATING_OPTS_IG
  const subigOpts = agency === 'mdy' ? MDY_RATING_OPTS_SUBIG : SP_RATING_OPTS_SUBIG
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: 12, cursor: 'pointer', width: 110 }}
    >
      <optgroup label="Investment Grade">
        {igOpts.map(r => <option key={r} value={r}>{r}</option>)}
      </optgroup>
      <optgroup label="Below Investment Grade">
        {subigOpts.map(r => <option key={r} value={r}>{r}</option>)}
      </optgroup>
    </select>
  )
}

const TH: React.CSSProperties = { padding: '6px 10px', color: 'var(--navy)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }
const TD: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid var(--border)', fontSize: 12 }
const numIn = (w: number): React.CSSProperties => ({
  width: w, textAlign: 'right', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: 12, fontFamily: 'monospace',
})
const txtIn = (w: number): React.CSSProperties => ({
  width: w, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: 12,
})
const unit = (s: string) => (
  <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', userSelect: 'none' }}>{s}</span>
)

export default function Configuration() {
  const { toast, navigate } = useApp()

  const [busa,           setBusa]           = useState<RateTier[]>([])
  const [agentTiers,     setAgentTiers]     = useState<RateTier[]>([])
  const [agentParams,    setAgentParams]    = useState<AgentRateParam[]>([])
  const [eligRules,      setEligRules]      = useState<EligRule[]>([])
  const [concLimits,     setConcLimits]     = useState<ConcLimit[]>([])
  const [globalSettings, setGlobalSettings] = useState<GlobalSetting[]>([])
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState<string | null>(null)
  const [loadError,      setLoadError]      = useState<string | null>(null)

  useEffect(() => {
    setLoadError(null)
    api.config.eligibility()
      .then((result: unknown) => {
        const config = result as Partial<EligibilityConfig>
        const missing = missingConfigSections(config)
        if (missing.length > 0) throw new Error(`Missing config sections: ${missing.join(', ')}`)
        if (!isCompleteConfig(config)) throw new Error('Eligibility configuration is incomplete')
        setBusa(config.BUSA_TIERS)
        setAgentTiers(config.AGENT_TIERS)
        setAgentParams(config.AGENT_RATE_PARAMS)
        setEligRules(config.ELIG_RULES)
        setConcLimits(config.CONC_LIMITS)
        setGlobalSettings(config.GLOBAL_SETTINGS)
      })
      .catch(e => setLoadError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = useCallback(async (section: string, saves: Array<[string, unknown]>) => {
    if (loadError) {
      toast('Configuration was not loaded; save is disabled until the DB config is available.')
      return
    }
    setSaving(section)
    try {
      for (const [key, data] of saves) {
        await api.config.setEligibility(key, data)
      }
      toast('Configuration saved.')
    } catch {
      toast('Save failed — ensure pe-sub-api is running.')
    } finally {
      setSaving(null)
    }
  }, [loadError, toast])

  const busy = saving !== null || loading || loadError != null

  if (loading) {
    return <div style={{ padding: '40px 24px', color: 'var(--muted)', fontSize: 13 }}>Loading configuration…</div>
  }

  if (loadError) {
    return (
      <div style={{ padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><Button variant="ghost" size="sm" onClick={() => navigate('upload')}>← Back to Upload</Button></div>
        <div style={{ padding: '10px 14px', background: '#fff0f0', color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>
          API error — {loadError}. Configuration saves are disabled so UI defaults cannot replace database-backed settings.
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* 1 — BUSA Advance Rate Schedule */}
        <Card
          title="BUSA Advance Rate Schedule"
          subtitle="UBS (BUSA) tiered advance rates by LP classification"
          action={
            <Button size="sm" disabled={busy} onClick={() => handleSave('busa_tiers', [['busa_tiers', busa]])}>
              {saving === 'busa_tiers' ? 'Saving…' : 'Save'}
            </Button>
          }
        >
          <div style={{ padding: '0 18px 16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--tbl)' }}>
                  <th style={{ ...TH, textAlign: 'left' }}>Classification</th>
                  <th style={{ ...TH, textAlign: 'right', width: 80 }}>Rate (%)</th>
                </tr>
              </thead>
              <tbody>
                {busa.map((r, i) => (
                  <tr key={r.cls}>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.cls}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>
                      <input
                        type="number" min={0} max={100} step={1}
                        value={r.rate}
                        onChange={e => setBusa(prev => prev.map((row, j) => j === i ? { ...row, rate: Number(e.target.value) } : row))}
                        style={numIn(60)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Applied to UBS Eligible Uncalled Capital per LP.</div>
          </div>
        </Card>

        {/* 2 — Agent Advance Rate Schedule */}
        <Card
          title="Agent Advance Rate Schedule"
          subtitle="Agent bank reference rates used for BB delta calculation"
          action={
            <Button size="sm" disabled={busy} onClick={() => handleSave('agent', [['agent_tiers', agentTiers], ['agent_rate_params', agentParams]])}>
              {saving === 'agent' ? 'Saving…' : 'Save'}
            </Button>
          }
        >
          <div style={{ padding: '0 18px 16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--tbl)' }}>
                  <th style={{ ...TH, textAlign: 'left' }}>Classification</th>
                  <th style={{ ...TH, textAlign: 'right', width: 80 }}>Rate (%)</th>
                </tr>
              </thead>
              <tbody>
                {agentTiers.map((r, i) => (
                  <tr key={r.cls}>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.cls}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>
                      <input
                        type="number" min={0} max={100} step={1}
                        value={r.rate}
                        onChange={e => setAgentTiers(prev => prev.map((row, j) => j === i ? { ...row, rate: Number(e.target.value) } : row))}
                        style={numIn(60)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {agentParams.map(({ label, value, agency }, i) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{label}</span>
                  {typeof value === 'number' ? (
                    <input
                      type="number" min={0} step={1}
                      value={value}
                      onChange={e => setAgentParams(prev => prev.map((p, j) => j === i ? { ...p, value: Number(e.target.value) } : p))}
                      style={numIn(130)}
                    />
                  ) : agency ? (
                    <RatingSelect
                      value={String(value)}
                      agency={agency}
                      onChange={v => setAgentParams(prev => prev.map((p, j) => j === i ? { ...p, value: v } : p))}
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(value)}
                      onChange={e => setAgentParams(prev => prev.map((p, j) => j === i ? { ...p, value: e.target.value } : p))}
                      style={txtIn(150)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* 3 — Eligibility Rules */}
        <Card
          title="Eligibility Rules"
          subtitle="LP-level inclusion and exclusion criteria"
          action={
            <Button size="sm" disabled={busy} onClick={() => handleSave('elig_rules', [['elig_rules', eligRules]])}>
              {saving === 'elig_rules' ? 'Saving…' : 'Save'}
            </Button>
          }
        >
          <div style={{ padding: '0 18px 16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--tbl)' }}>
                  <th style={{ ...TH, textAlign: 'left' }}>Rule</th>
                  <th style={{ ...TH, textAlign: 'right', width: 110 }}>Value</th>
                  <th style={{ ...TH, textAlign: 'center', width: 56 }}>Active</th>
                </tr>
              </thead>
              <tbody>
                {eligRules.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.rule}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>
                      {typeof r.value === 'number' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                          {r.unit === '$' && unit('$')}
                          <input
                            type="number" min={0} step={r.unit === '$' ? 1000 : 1}
                            value={r.value}
                            onChange={e => setEligRules(prev => prev.map((row, j) => j === i ? { ...row, value: Number(e.target.value) } : row))}
                            style={numIn(r.unit === '$' ? 90 : 50)}
                          />
                          {r.unit === '%' && unit('%')}
                        </span>
                      ) : (
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)', padding: '2px 6px' }}>
                          {String(r.value)}
                        </span>
                      )}
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={() => setEligRules(prev => prev.map((row, j) => j === i ? { ...row, active: !row.active } : row))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 4 — Concentration Limits */}
        <Card
          title="Concentration Limits"
          subtitle="Portfolio-level collateral concentration thresholds"
          action={
            <Button size="sm" disabled={busy} onClick={() => handleSave('conc_limits', [['conc_limits', concLimits]])}>
              {saving === 'conc_limits' ? 'Saving…' : 'Save'}
            </Button>
          }
        >
          <div style={{ padding: '0 18px 16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--tbl)' }}>
                  <th style={{ ...TH, textAlign: 'left' }}>Limit</th>
                  <th style={{ ...TH, textAlign: 'right', width: 70 }}>Cap (%)</th>
                  <th style={{ ...TH, textAlign: 'right', width: 155 }}>Basis</th>
                </tr>
              </thead>
              <tbody>
                {concLimits.map((r, i) => (
                  <tr key={r.label}>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.label}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>
                      <input
                        type="number" min={0} max={100} step={1}
                        value={r.value}
                        onChange={e => setConcLimits(prev => prev.map((row, j) => j === i ? { ...row, value: Number(e.target.value) } : row))}
                        style={numIn(50)}
                      />
                    </td>
                    <td style={{ ...TD, textAlign: 'right' }}>
                      <input
                        type="text"
                        value={r.basis}
                        onChange={e => setConcLimits(prev => prev.map((row, j) => j === i ? { ...row, basis: e.target.value } : row))}
                        style={txtIn(145)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="info-box" style={{ marginTop: 12 }}>Breaches are flagged automatically after each Shadow BB run.</div>
          </div>
        </Card>

      </div>

      {/* 5 — BB Template Registry */}
      <Card
        title="BB Template Registry"
        subtitle="Agent BB workbook format definitions — tabs, header positions, LP category group sections"
        action={<Button size="sm" onClick={() => navigate('bb-templates')}>Manage Templates</Button>}
      >
        <div style={{ padding: '10px 18px 14px', fontSize: 12, color: 'var(--muted)' }}>
          Register and maintain the structural definitions that the extraction engine uses to parse each Agent BB workbook format. One entry per template name / template class variant.
        </div>
      </Card>

      {/* 6 — Global Settings */}
      <Card
        title="Global Settings"
        subtitle="Platform-wide defaults applied to all facilities"
        action={
          <Button size="sm" disabled={busy} onClick={() => handleSave('global_settings', [['global_settings', globalSettings]])}>
            {saving === 'global_settings' ? 'Saving…' : 'Save'}
          </Button>
        }
      >
        <div style={{ padding: '4px 18px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 24px' }}>
          {globalSettings.map(({ id, label, value }, i) => (
            <div key={id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
              {id === 'snapshot-freq' ? (
                <select
                  value={Number(value)}
                  onChange={e => setGlobalSettings(prev => prev.map((s, j) => j === i ? { ...s, value: Number(e.target.value) } : s))}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  {SNAPSHOT_FREQ_OPTIONS.map(({ label, days }) => (
                    <option key={days} value={days}>{label}</option>
                  ))}
                </select>
              ) : id === 'report-watermark' ? (
                <select
                  value={String(value)}
                  onChange={e => setGlobalSettings(prev => prev.map((s, j) => j === i ? { ...s, value: e.target.value } : s))}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  {WATERMARK_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : id === 'audit-retention' ? (
                <select
                  value={Number(value)}
                  onChange={e => setGlobalSettings(prev => prev.map((s, j) => j === i ? { ...s, value: Number(e.target.value) } : s))}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  {RETENTION_OPTIONS.map(n => (
                    <option key={n} value={n}>{n} {n === 1 ? 'year' : 'years'}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={typeof value === 'number' ? 'number' : 'text'}
                  min={typeof value === 'number' ? 0 : undefined}
                  max={typeof value === 'number' ? 100 : undefined}
                  step={typeof value === 'number' ? 1 : undefined}
                  value={value}
                  onChange={e => setGlobalSettings(prev => prev.map((s, j) => j === i ? {
                    ...s,
                    value: typeof s.value === 'number' ? Number(e.target.value) : e.target.value
                  } : s))}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: 12, fontWeight: 600, fontFamily: typeof value === 'number' ? 'monospace' : 'inherit' }}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

    </div>
  )
}
