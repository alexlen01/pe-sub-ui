import { useState, useEffect, useMemo } from 'react'
import { useApp }    from '../../context/AppContext'
import KpiCard        from '../../components/ui/KpiCard'
import Card           from '../../components/ui/Card'
import DataTable      from '../../components/ui/DataTable'
import DonutChart     from '../../components/ui/DonutChart'
import Tag            from '../../components/ui/Tag'
import Button         from '../../components/ui/Button'
import InfoTip        from '../../components/ui/InfoTip'
import { getFacilities, getActivityFeed, formatLastRun } from '../../services/facilityService'
import { getLPsForFacility } from '../../services/lpService'
import type { FacilityRow, ActivityRow } from '../../services/facilityService'
import { buildExecRows } from '../../utils/execSummary'

const FACILITY_STATUS_ITEMS = [
  { label: 'Active',       desc: 'Shadow BB completed and accepted for this cycle.' },
  { label: 'Needs Review', desc: 'Submission has unresolved issues — LP matches or eligibility disputes — requiring credit officer action.' },
  { label: 'In Progress',  desc: 'Submission uploaded; credit officer is working through matching, classification, and Shadow BB.' },
  { label: 'Not Started',  desc: 'No Shadow BB submission processed for this cycle.' },
]

const FACILITY_COLS = [
  { key: 'name',    label: 'Facility'  },
  { key: 'lps',     label: '# LPs',    align: 'right', style: { width: 70  }, render: (r: FacilityRow) => r.lps?.toLocaleString() ?? '—' },
  { key: 'agentBB', label: 'Agent BB', align: 'right', style: { width: 90  } },
  { key: 'ubsBB',   label: 'UBS BB',   align: 'right', style: { width: 90  } },
  { key: 'delta',   label: 'Delta',    align: 'right', style: { width: 90  }, neg: (r: FacilityRow) => r.delta?.startsWith('-') ?? false },
  { key: 'ear',     label: 'EAR',      align: 'right', style: { width: 70  } },
  { key: 'lastRun', label: 'Last Run', align: 'right', style: { width: 85  }, render: (r: FacilityRow) => <span style={{ color: r.lastRun === '—' ? 'var(--muted)' : 'inherit' }}>{r.lastRun}</span> },
  { key: 'status',  label: 'Status',                   style: { width: 120 }, render: (r: FacilityRow) => <Tag>{r.status}</Tag> },
]

const CLS_SEGMENTS = [
  { cls: 'Rated',          label: 'Rated (90%)',           color: '#4F4F4F' },
  { cls: 'Unrated >2bn',   label: 'Unrated >$2bn (75%)',   color: '#E60000' },
  { cls: 'Unrated 1–2bn', label: 'Unrated $1–2bn (65%)', color: '#767676' },
  { cls: 'Eligible',       label: 'Eligible <$1bn (50%)',  color: '#007A38' },
  { cls: 'Excluded',       label: 'Excluded (0%)',         color: '#C8C8C8' },
]

export default function Dashboard() {
  const { navigate, currentUser, setActiveSubmission, setActiveSubmissionId, setActiveFacilityId, screen } = useApp()
  const [facilities,       setFacilities]       = useState<FacilityRow[]>([])
  const [selectedFacility, setSelectedFacility] = useState<FacilityRow | null>(null)
  const [statusFilter,     setStatusFilter]     = useState('All')
  const [activityFeed,     setActivityFeed]     = useState<ActivityRow[]>([])
  const [loading,          setLoading]          = useState(false)
  const [facilityLPs,      setFacilityLPs]      = useState<{ cls?: string }[]>([])
  const [error,            setError]            = useState<string | null>(null)

  const selectedFacilityId = selectedFacility?.id ?? null

  useEffect(() => {
    if (!selectedFacilityId) { setFacilityLPs([]); return }
    getLPsForFacility(selectedFacilityId)
      .then(lps => setFacilityLPs(lps as { cls?: string }[]))
      .catch(e => setError(String(e)))
  }, [selectedFacilityId])

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([getFacilities(), getActivityFeed()]).then(([data, activity]) => {
      setFacilities(data)
      setSelectedFacility(prev => prev ? (data.find(f => f.name === prev.name) ?? data[0] ?? null) : (data[0] ?? null))
      setActivityFeed(data.length > 0 ? activity : [])
    })
    .catch(e => setError(String(e)))
    .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (screen !== 'dashboard') return
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [screen])

  const filteredFacilities = statusFilter === 'All' ? facilities : facilities.filter(f => f.status === statusFilter)
  const donut = useMemo(() => {
    if (facilityLPs.length === 0) return null
    const total = facilityLPs.length
    const segments = CLS_SEGMENTS
      .map(({ cls, label, color }) => {
        const n = facilityLPs.filter(lp => lp.cls === cls).length
        return { label, n, pct: `${((n / total) * 100).toFixed(1)}%`, color }
      })
      .filter(s => s.n > 0)
    return { total, segments }
  }, [facilityLPs])
  const activeCount         = facilities.filter(f => f.status === 'Active').length
  const needsReviewCount    = facilities.filter(f => f.status === 'Needs Review').length
  const inProgressCount     = facilities.filter(f => f.status === 'In Progress').length
  const notStartedCount     = facilities.filter(f => f.status === 'Not Started').length

  const kpis = [
    {
      label: 'Facilities This Cycle',
      value: String(facilities.length),
      sub: <>
        <span style={{ color: 'var(--green)' }}>{activeCount} active</span>
        {' · '}
        <span style={{ color: 'var(--amber)' }}>{needsReviewCount} needs review</span>
        {' · '}
        <span style={{ color: 'var(--blue)' }}>{inProgressCount} in progress</span>
      </>,
      color: 'black',
    },
    { label: 'Total LP Records',   value: facilities.reduce((s, f) => s + (f.lps ?? 0), 0).toLocaleString(),              sub: 'across all facilities',                                  color: 'blue'  },
    { label: 'Pending LP Reviews', value: '—', sub: selectedFacility?.name ?? '', color: 'amber' },
    { label: 'Last BB Run',        value: selectedFacility ? formatLastRun(selectedFacility.lastRunAt) : '—', sub: selectedFacility?.name ?? '',          color: 'green' },
  ]

  return (
    <div>
      {error && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: '#fff0f0', color: 'var(--red)', borderRadius: 6, fontSize: 12 }}>API error — {error}</div>}
      <div className="kpi-grid">
        {kpis.map(k => (
          <KpiCard key={k.label} label={k.label} value={k.value} sub={k.sub} color={k.color} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 12, padding: '12px 24px 0' }}>
        <Card
          title="Facility Summary"
          subtitle={`${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })} · ${statusFilter === 'All' ? `All ${facilities.length}` : `${filteredFacilities.length}`} facilities · Click a row to view LP Classification and Executive Summary`}
          action={
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <InfoTip title="Facility Status" items={FACILITY_STATUS_ITEMS} />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--card)', color: 'var(--text)', cursor: 'pointer' }}
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active ({activeCount})</option>
                <option value="Needs Review">Needs Review ({needsReviewCount})</option>
                <option value="In Progress">In Progress ({inProgressCount})</option>
                <option value="Not Started">Not Started ({notStartedCount})</option>
              </select>
              <Button variant="secondary" size="sm" onClick={load} disabled={loading}>↻ Refresh</Button>
              <Button variant="secondary" size="sm" onClick={() => navigate('lp-master')}>View All LPs</Button>
            </div>
          }
          style={{ display: 'flex', flexDirection: 'column' }}
          bodyStyle={{ flex: 1, minHeight: 0, padding: 0, display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <DataTable
              columns={FACILITY_COLS}
              rows={filteredFacilities}
              onRowClick={setSelectedFacility}
              selectedRow={selectedFacility}
            />
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card
            title="LP Classification"
            subtitle={`${selectedFacility?.name ?? '—'} · ${donut ? donut.total.toLocaleString() : '—'} LPs`}
          >
            {donut && <DonutChart segments={donut.segments} total={donut.total} />}
          </Card>

          <Card
            title="Executive Summary"
            subtitle={
              !selectedFacility || selectedFacility.lastRun === '—'
                ? `${selectedFacility?.name ?? '—'} · No Shadow BB this cycle`
                : `${selectedFacility.name} · As Of ${selectedFacility.lastRun}`
            }
          >
            {(() => {
              const f = selectedFacility
              const isOwner = f?.submittedBy === currentUser.name
              const isPrivileged = currentUser.role === 'Account/Transaction Manager'
              const canAct = isOwner || isPrivileged

              const ownerTag = f?.submittedBy ? (
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  Submitted by <strong>{f.submittedBy}</strong>
                  {!isOwner && !isPrivileged && <span style={{ color: 'var(--amber)', marginLeft: 4 }}>(view only)</span>}
                </span>
              ) : null

              const cta = f?.status === 'Active' ? (
                <Button size="sm" variant="action" onClick={() => navigate('shadow-bb')}>View Shadow BB ›</Button>
              ) : f?.status === 'Needs Review' ? (
                <Button size="sm" variant="action" onClick={() => {
                  setActiveSubmission(f.name)
                  setActiveSubmissionId(f.latestSubmissionId ?? null)
                  setActiveFacilityId(f.id ?? null)
                  navigate(f.step === 4 ? 'match-queue' : f.step === 5 ? 'run-shadow-bb' : 'extraction-preview')
                }}>View Submission ›</Button>
              ) : f?.status === 'In Progress' ? (
                <Button size="sm" variant="action" onClick={() => {
                  setActiveSubmission(f.name)
                  setActiveSubmissionId(f.latestSubmissionId ?? null)
                  setActiveFacilityId(f.id ?? null)
                  navigate(f.step === 4 ? 'match-queue' : f.step === 5 ? 'run-shadow-bb' : 'extraction-preview')
                }}>View Submission ›</Button>
              ) : f?.status === 'Not Started' ? (
                canAct
                  ? <Button size="sm" variant="action" onClick={() => navigate('upload')}>Start Submission ›</Button>
                  : null
              ) : null

              return (
                <>
                  {(f?.status === 'Not Started' || f?.status === 'In Progress') ? (
                    <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
                      <span style={{ fontSize: 22, opacity: .35 }}>&#x25AB;</span>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>No Shadow BB this cycle</span>
                      <span>
                        {f?.status === 'In Progress'
                          ? 'Submission is being processed — Shadow BB not yet run for this cycle.'
                          : 'Upload the agent borrowing base to begin this cycle\'s Shadow BB.'}
                      </span>
                    </div>
                  ) : (
                    <div style={{ padding: '8px 18px' }}>
                      {f?.status === 'Needs Review' && (
                        <div style={{ marginBottom: 8, padding: '5px 8px', background: 'var(--amber-lt)', borderRadius: 4, fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>
                          Submission needs review — figures reflect last active Shadow BB
                        </div>
                      )}
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--tbl)' }}>
                            {['Metric', 'UBS', 'Agent'].map(h => (
                              <th key={h} style={{ padding: '5px 8px', textAlign: h !== 'Metric' ? 'right' : 'left', color: 'var(--navy)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {buildExecRows(f).map((row, i) => (
                            <tr key={i} style={{ background: row.delta ? 'var(--red-lt)' : 'inherit' }}>
                              <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>{row.metric}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: row.bold || row.delta ? 700 : 400, color: row.delta ? 'var(--red)' : 'var(--navy)', borderBottom: '1px solid var(--border)' }}>{row.ubs}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{row.agent}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div style={{ padding: '8px 18px 12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    {ownerTag ?? <span />}
                    {cta}
                  </div>
                </>
              )
            })()}
          </Card>
        </div>
      </div>

      <div style={{ padding: '12px 24px 24px' }}>
        <Card title="Recent Activity" action={<Button variant="secondary" size="sm" onClick={() => navigate('audit')}>View All</Button>}>
          {activityFeed.slice(0, 10).map((a, i) => (
            <div className="activity-item" key={i}>
              <span className="act-time">{a.time}</span>
              <span className="act-dot" style={{ background: a.color }} />
              <div>
                <div className="act-event">{a.event}</div>
                <div className="act-detail">{a.detail}</div>
                <div className="act-user">{a.user}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
