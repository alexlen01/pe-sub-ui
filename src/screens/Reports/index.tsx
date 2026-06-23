import { useState, useEffect } from 'react'
import { useApp }    from '../../context/AppContext'
import Button        from '../../components/ui/Button'
import { REPORT_TABS, CONCENTRATION_TESTS, REPORT_SCHEDULES } from '../../config/reportConfig'
import { getFacilities } from '../../services/facilityService'

const EMPTY: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', gap: 8, height: '100%',
  color: 'var(--muted)', fontSize: 12, textAlign: 'center',
}

function EmptyPreview() {
  return (
    <div style={EMPTY}>
      <span style={{ fontSize: 32, opacity: .3 }}>&#x25AB;</span>
      Select options and generate a report to see the preview.
    </div>
  )
}

function FacilitySelect({ facilities }: { facilities: string[] }) {
  return (
    <select style={{ width: '100%' }}>
      {facilities.length === 0
        ? <option>No facilities available</option>
        : facilities.map(f => <option key={f}>{f}</option>)
      }
    </select>
  )
}

export default function Reports() {
  const { toast }           = useApp()
  const [tab, setTab]       = useState('collateral')
  const [facilities, setFacilities] = useState<string[]>([])

  useEffect(() => {
    getFacilities().then(rows => setFacilities(rows.map(r => r.name))).catch(() => {})
  }, [])

  const currentMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="report-tabs">
        {REPORT_TABS.map(t => (
          <div key={t.id} className={`r-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', height: 'calc(100vh - var(--topbar-h) - 84px)', overflow: 'hidden' }}>
        <div style={{ borderRight: '1px solid var(--border)', overflow: 'auto', padding: 18, background: 'var(--card)' }}>

          {tab === 'collateral' && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 4 }}>Collateral Market Value &amp; Coverage</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>Overall collateral quality, coverage ratios, and UBS Shadow BB vs. Agent BB comparison.</div>
              <hr className="sep" />
              <div className="form-group">
                <label className="form-label">Facility</label>
                <FacilitySelect facilities={facilities} />
              </div>
              <div className="form-group">
                <label className="form-label">BB Snapshot</label>
                <select style={{ width: '100%' }}><option>{currentMonth} (latest)</option></select>
              </div>
              <div className="form-group">
                <label className="form-label">Include LPs</label>
                <select style={{ width: '100%' }}>
                  <option>Included only (UBS Included = Y)</option>
                  <option>All LPs</option>
                  <option>Included + variance highlighted</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Watermark</label>
                <select style={{ width: '100%' }}>
                  <option>DRAFT - For Internal Review</option>
                  <option>FINAL</option>
                  <option>None</option>
                </select>
              </div>
              <hr className="sep" />
              <div className="form-group">
                <label className="form-label">Detail Level</label>
                {['LP-level drill-down', 'Facility summary only', 'Executive summary only'].map((o, i) => (
                  <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6, cursor: 'pointer' }}>
                    <input type="radio" name="detail" defaultChecked={i === 0} /> {o}
                  </label>
                ))}
              </div>
              <div className="form-group">
                <label className="form-label">Format</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  {['PDF', 'XLSX', 'Both'].map((o, i) => (
                    <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                      <input type="radio" name="fmt" defaultChecked={i === 0} /> {o}
                    </label>
                  ))}
                </div>
              </div>
              <hr className="sep" />
              <div className="form-group">
                <label className="form-label">Additional Sections</label>
                {['LP Category Summary', 'Coverage Ratio Trend', 'Concentration Limit Analysis', 'Reclassified LP Detail', 'Collateral Quality Breakdown'].map((o, i) => (
                  <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6, cursor: 'pointer' }}>
                    <input type="checkbox" defaultChecked={i < 3} /> {o}
                  </label>
                ))}
              </div>
              <hr className="sep" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={() => toast('Report generation not yet implemented.')}>Generate Certificate</Button>
                <Button variant="secondary" onClick={() => toast('Scheduling not yet implemented.')}>Schedule</Button>
              </div>
            </div>
          )}

          {tab === 'ear' && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 4 }}>Effective Advance Rates</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>Blended UBS advance rate across the portfolio — trend, breakdown by classification tier, and delta vs. agent EAR.</div>
              <hr className="sep" />
              <div className="form-group"><label className="form-label">Facility</label><FacilitySelect facilities={['All Active', ...facilities]} /></div>
              <div className="form-group"><label className="form-label">Period</label>
                <select style={{ width: '100%' }}><option>{currentMonth}</option></select>
              </div>
              <div className="form-group"><label className="form-label">Format</label>
                <select style={{ width: '100%' }}><option>XLSX with charts</option><option>PDF</option></select>
              </div>
              <Button onClick={() => toast('Report generation not yet implemented.')}>Generate Report</Button>
            </div>
          )}

          {tab === 'agent-bank' && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 4 }}>Agent Bank Exposure</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>UBS exposure by agent bank — BB value, LP count, and variance from each agent's submitted BB.</div>
              <hr className="sep" />
              <div className="form-group"><label className="form-label">Agent Bank</label>
                <select style={{ width: '100%' }}><option>All Agent Banks</option></select>
              </div>
              <div className="form-group"><label className="form-label">Snapshot</label>
                <select style={{ width: '100%' }}><option>{currentMonth} (latest)</option></select>
              </div>
              <div className="form-group"><label className="form-label">Format</label>
                <select style={{ width: '100%' }}><option>XLSX</option><option>PDF</option></select>
              </div>
              <Button onClick={() => toast('Report generation not yet implemented.')}>Generate Report</Button>
            </div>
          )}

          {tab === 'concentration' && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 4 }}>Concentration Exposures</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>LP-level and category-level concentration limit analysis across all active facilities.</div>
              <hr className="sep" />
              <div className="form-group"><label className="form-label">Facility</label><FacilitySelect facilities={['All Facilities', ...facilities]} /></div>
              <div className="form-group">
                <label className="form-label">Concentration Tests</label>
                {CONCENTRATION_TESTS.map(t => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}>
                    <input type="checkbox" defaultChecked /> {t}
                  </label>
                ))}
              </div>
              <Button onClick={() => toast('Report generation not yet implemented.')}>Generate Report</Button>
            </div>
          )}

          {tab === 'adhoc' && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 4 }}>Ad Hoc Reporting</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>On-demand analysis — build a custom LP-level query and export results.</div>
              <hr className="sep" />
              <div className="form-group"><label className="form-label">Facility</label><FacilitySelect facilities={['All Facilities', ...facilities]} /></div>
              <div className="form-group"><label className="form-label">Filter by Classification</label>
                <select style={{ width: '100%' }}><option>All</option><option>Rated</option><option>Unrated &gt;$2bn</option><option>Unrated $1–2bn</option><option>Eligible</option><option>Excluded</option></select>
              </div>
              <div className="form-group"><label className="form-label">Sort By</label>
                <select style={{ width: '100%' }}><option>UBS BB (desc)</option><option>LP Name</option><option>Uncalled Capital (desc)</option></select>
              </div>
              <Button onClick={() => toast('Report generation not yet implemented.')}>Run &amp; Export</Button>
            </div>
          )}

          {tab === 'scheduled' && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 4 }}>Scheduled Jobs</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>System-managed batch jobs. Run automatically — no user configuration required.</div>
              <hr className="sep" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {REPORT_SCHEDULES.map((s, i) => (
                  <div key={i} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tbl)' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--navy)', marginBottom: 4 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.freq} · Next run: {s.next}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        <div style={{ overflow: 'auto', padding: 18, background: 'var(--bg)' }}>
          <EmptyPreview />
        </div>
      </div>
    </div>
  )
}
