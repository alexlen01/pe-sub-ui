import { useEffect, useState } from 'react'
import Card from '../../components/ui/Card'
import { getEligibilityConfig } from '../../services/configService'
import { BUSA_TIERS, AGENT_TIERS, AGENT_RATE_PARAMS, ELIG_RULES, CONC_LIMITS, GLOBAL_SETTINGS } from '../../config/eligibilityConfig'
import type { RateTier, EligRule, ConcLimit, GlobalSetting } from '../../config/eligibilityConfig'

const TH: React.CSSProperties = { padding: '6px 10px', color: 'var(--navy)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }
const TD: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid var(--border)', fontSize: 12 }

function RateTable({ rows }: { rows: RateTier[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: 'var(--tbl)' }}>
          <th style={{ ...TH, textAlign: 'left' }}>Classification</th>
          <th style={{ ...TH, textAlign: 'right' }}>Rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.cls}>
            <td style={{ ...TD, fontWeight: 600 }}>{r.cls}</td>
            <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{r.rate}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const LOCAL_DEFAULTS = { BUSA_TIERS, AGENT_TIERS, AGENT_RATE_PARAMS, ELIG_RULES, CONC_LIMITS, GLOBAL_SETTINGS }

type EligConfig = {
  BUSA_TIERS: RateTier[]
  AGENT_TIERS: RateTier[]
  AGENT_RATE_PARAMS: Array<{ label: string; value: string }>
  ELIG_RULES: EligRule[]
  CONC_LIMITS: ConcLimit[]
  GLOBAL_SETTINGS: GlobalSetting[]
}

export default function Configuration() {
  const [cfg, setCfg] = useState<EligConfig>(LOCAL_DEFAULTS)
  const [fromDb, setFromDb] = useState(false)

  useEffect(() => {
    getEligibilityConfig().then(result => {
      setCfg(result as EligConfig)
      setFromDb(true)
    })
  }, [])

  return (
    <div style={{ padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--tbl)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 14px' }}>
        {fromDb
          ? 'Values loaded from database. Contact the platform team to request an amendment.'
          : 'These values are defined in source code and require a deployment to change. Contact the platform team to request an amendment.'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        <Card title="BUSA Advance Rate Schedule" subtitle="UBS (BUSA) tiered advance rates by LP classification">
          <div style={{ padding: '0 18px 16px' }}>
            <RateTable rows={cfg.BUSA_TIERS} />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Applied to UBS Eligible Uncalled Capital per LP.</div>
          </div>
        </Card>

        <Card title="Agent Advance Rate Schedule" subtitle="Agent bank reference rates used for BB delta calculation">
          <div style={{ padding: '0 18px 16px' }}>
            <RateTable rows={cfg.AGENT_TIERS} />
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cfg.AGENT_RATE_PARAMS.map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{label}</span>
                  <span style={{ fontFamily: 'monospace' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Eligibility Rules" subtitle="LP-level inclusion and exclusion criteria">
          <div style={{ padding: '0 18px 16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--tbl)' }}>
                  <th style={{ ...TH, textAlign: 'left' }}>Rule</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Value</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Active</th>
                </tr>
              </thead>
              <tbody>
                {cfg.ELIG_RULES.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.rule}</td>
                    <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{r.value}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: r.active ? 'var(--green)' : 'var(--muted)' }}>
                        {r.active ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Concentration Limits" subtitle="Portfolio-level collateral concentration thresholds">
          <div style={{ padding: '0 18px 16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--tbl)' }}>
                  <th style={{ ...TH, textAlign: 'left' }}>Limit</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Cap</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Basis</th>
                </tr>
              </thead>
              <tbody>
                {cfg.CONC_LIMITS.map(r => (
                  <tr key={r.label}>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.label}</td>
                    <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{r.value}</td>
                    <td style={{ ...TD, textAlign: 'right', color: 'var(--muted)' }}>{r.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="info-box" style={{ marginTop: 12 }}>Breaches are flagged automatically after each Shadow BB run.</div>
          </div>
        </Card>

      </div>

      <Card title="Global Settings" subtitle="Platform-wide defaults applied to all facilities">
        <div style={{ padding: '4px 18px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 24px' }}>
          {cfg.GLOBAL_SETTINGS.map(({ id, label, value }) => (
            <div key={id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
