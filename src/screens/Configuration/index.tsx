import { useEffect, useState, useCallback } from 'react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { useApp } from '../../context/AppContext'
import { api } from '../../services/api'
import type { RateTier, ConcLimit, GlobalSetting, BbCriteriaMatrix } from '../../services/configService'

interface EligibilityConfig {
  AGENT_TIERS:       RateTier[]
  /** Advance rate (funded-split) and concentration limit by class / rating band.
   *  Optional — absent on DBs seeded before the bb_criteria_matrix config was added. */
  BB_CRITERIA_MATRIX?: BbCriteriaMatrix
  CONC_LIMITS:       ConcLimit[]
  GLOBAL_SETTINGS:   GlobalSetting[]
}

function missingConfigSections(config: Partial<EligibilityConfig>): string[] {
  return [
    ['AGENT_TIERS', config.AGENT_TIERS],
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

  const [agentTiers,     setAgentTiers]     = useState<RateTier[]>([])
  const [concLimits,     setConcLimits]     = useState<ConcLimit[]>([])
  const [criteria,       setCriteria]       = useState<BbCriteriaMatrix | null>(null)
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
        setAgentTiers(config.AGENT_TIERS)
        setConcLimits(config.CONC_LIMITS)
        setCriteria(config.BB_CRITERIA_MATRIX ?? null)
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

  // ── Borrowing Base Criteria Matrix editors (immutable nested updates) ──
  const updRatedConc = (i: number, v: number) =>
    setCriteria(c => c ? { ...c, rated: c.rated.map((r, j) => j === i ? { ...r, concLimitPct: v } : r) } : c)
  const updRatedAR = (i: number, k: 'lt40' | 'gte40', v: number) =>
    setCriteria(c => c ? { ...c, rated: c.rated.map((r, j) => j === i ? { ...r, advanceRatePct: { ...r.advanceRatePct, [k]: v } } : r) } : c)
  const updClassConc = (i: number, v: number) =>
    setCriteria(c => c ? { ...c, classes: c.classes.map((r, j) => j === i ? { ...r, concLimitPct: v } : r) } : c)
  const updClassAR = (i: number, k: 'lt40' | 'gte40', v: number) =>
    setCriteria(c => c ? { ...c, classes: c.classes.map((r, j) => j === i ? { ...r, advanceRatePct: { ...r.advanceRatePct, [k]: v } } : r) } : c)

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

        {/* 2 — Agent Advance Rate Schedule */}
        <Card
          title="Agent Advance Rate Schedule"
          subtitle="Agent bank reference rates used for BB delta calculation"
          action={
            <Button size="sm" disabled={busy} onClick={() => handleSave('agent_tiers', [['agent_tiers', agentTiers]])}>
              {saving === 'agent_tiers' ? 'Saving…' : 'Save'}
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
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Agent bank advance rate per classification — drives the Agent BB vs UBS BB delta.</div>
          </div>
        </Card>

        {/* 4 — Concentration Limits */}
        <Card
          style={{ order: 4 }}
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

      {/* Borrowing Base Criteria Matrix (Concentration_Limits.xlsx tabs 2-3).
          order:-1 floats it above the grid — it is the primary editor, replacing the
          former BUSA Advance Rate Schedule and Per-LP Concentration Limit Defaults cards. */}
      {criteria && (
        <Card
          style={{ order: -1 }}
          title="Borrowing Base Criteria Matrix"
          subtitle="Advance rate by LP funded % (< / ≥ threshold) and concentration limit by class / rating band — source of the Run Shadow BB defaults"
          action={
            <Button size="sm" disabled={busy} onClick={() => handleSave('bb_criteria_matrix', [['bb_criteria_matrix', criteria]])}>
              {saving === 'bb_criteria_matrix' ? 'Saving…' : 'Save'}
            </Button>
          }
        >
          <div style={{ padding: '4px 18px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12 }}>
              <span style={{ color: 'var(--navy)', fontWeight: 600 }}>Funded threshold</span>
              <input
                type="number" min={0} max={100} step={1}
                value={criteria.fundedThresholdPct}
                onChange={e => setCriteria(c => c ? { ...c, fundedThresholdPct: Number(e.target.value) } : c)}
                style={numIn(60)}
              />
              {unit('%')}
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                LPs at or above this funded % (called ÷ commitment) take the ≥ column advance rate.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Rated Investors — resolved by rating band */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Rated Investors (by band)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--tbl)' }}>
                      <th style={{ ...TH, textAlign: 'left' }}>Rating (S&amp;P / Moody's)</th>
                      <th style={{ ...TH, textAlign: 'right', width: 78 }}>Conc (%)</th>
                      <th style={{ ...TH, textAlign: 'right', width: 78 }}>AR &lt;{criteria.fundedThresholdPct}%</th>
                      <th style={{ ...TH, textAlign: 'right', width: 78 }}>AR ≥{criteria.fundedThresholdPct}%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criteria.rated.map((r, i) => (
                      <tr key={r.band}>
                        <td style={{ ...TD, fontWeight: 600 }} title={`Band ${r.band}`}>{r.label ?? r.band}</td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          <input type="number" min={0} max={100} step={0.5} value={r.concLimitPct}
                            onChange={e => updRatedConc(i, Number(e.target.value))} style={numIn(52)} />
                        </td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          <input type="number" min={0} max={100} step={1} value={r.advanceRatePct.lt40}
                            onChange={e => updRatedAR(i, 'lt40', Number(e.target.value))} style={numIn(52)} />
                        </td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          <input type="number" min={0} max={100} step={1} value={r.advanceRatePct.gte40}
                            onChange={e => updRatedAR(i, 'gte40', Number(e.target.value))} style={numIn(52)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Non-rated classes — resolved by classification label */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>By Classification</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--tbl)' }}>
                      <th style={{ ...TH, textAlign: 'left' }}>Classification</th>
                      <th style={{ ...TH, textAlign: 'right', width: 78 }}>Conc (%)</th>
                      <th style={{ ...TH, textAlign: 'right', width: 78 }}>AR &lt;{criteria.fundedThresholdPct}%</th>
                      <th style={{ ...TH, textAlign: 'right', width: 78 }}>AR ≥{criteria.fundedThresholdPct}%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criteria.classes.map((r, i) => (
                      <tr key={r.cls}>
                        <td style={{ ...TD, fontWeight: 600 }}>{r.cls}</td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          <input type="number" min={0} max={100} step={0.5} value={r.concLimitPct}
                            onChange={e => updClassConc(i, Number(e.target.value))} style={numIn(52)} />
                        </td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          <input type="number" min={0} max={100} step={1} value={r.advanceRatePct.lt40}
                            onChange={e => updClassAR(i, 'lt40', Number(e.target.value))} style={numIn(52)} />
                        </td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          <input type="number" min={0} max={100} step={1} value={r.advanceRatePct.gte40}
                            onChange={e => updClassAR(i, 'gte40', Number(e.target.value))} style={numIn(52)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
              Authoritative source for the Run Shadow BB advance-rate and concentration-limit suggestions. Concentration limit is funded-independent; only advance rate splits on funded %.
            </div>
          </div>
        </Card>
      )}

      {/* 5 — Global Settings */}
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
