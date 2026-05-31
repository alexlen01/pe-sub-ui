import { useState, useEffect } from 'react'
import { useApp }    from '../../context/AppContext'
import KpiCard        from '../../components/ui/KpiCard'
import Card           from '../../components/ui/Card'
import DataTable      from '../../components/ui/DataTable'
import DonutChart     from '../../components/ui/DonutChart'
import Tag            from '../../components/ui/Tag'
import Button         from '../../components/ui/Button'
import InfoTip        from '../../components/ui/InfoTip'
import { getFacilities, getActivityFeed } from '../../services/facilityService'
import { getDonutData } from '../../services/lpService'
import type { FacilityRow } from '../../services/facilityService'

// Derive Executive Summary rows from a selected facility record.
// TUC is the same denominator for both UBS and Agent; only advance rates differ.
function buildExecRows(f: FacilityRow | null) {
  if (!f) return []
  const parseM   = (s: string) => parseFloat((s ?? '0').replace(/[^0-9.]/g, ''))
  const parsePct = (s: string) => parseFloat((s ?? '0').replace('%', '')) / 100
  const fmtM     = (n: number) => `$${n.toFixed(1)}M`
  const fmtPct   = (n: number) => `${(n * 100).toFixed(1)}%`
  const fmtDeltaM   = (n: number) => `${n < 0 ? '-' : '+'}$${Math.abs(n).toFixed(1)}M`
  const fmtDeltaPct = (n: number) => `${n < 0 ? '-' : '+'}${Math.abs(n * 100).toFixed(1)}%`

  const ubbM     = parseM(f.ubsBB)
  const abbM     = parseM(f.agentBB)
  const earF     = parsePct(f.ear)
  const uecM     = earF > 0 ? ubbM / earF : 0
  const agentEarF = uecM > 0 ? abbM / uecM : 0

  return [
    { metric: 'Total Eligible Uncalled', ubs: fmtM(uecM),                 agent: fmtM(uecM)           },
    { metric: 'Total Borrowing Base',    ubs: f.ubsBB,                     agent: f.agentBB, bold: true },
    { metric: 'BB Delta',                ubs: fmtDeltaM(ubbM - abbM),      agent: '',        delta: true },
    { metric: 'Effective Advance Rate',  ubs: f.ear,                       agent: fmtPct(agentEarF)    },
    { metric: 'EAR Delta',               ubs: fmtDeltaPct(earF-agentEarF), agent: '',        delta: true },
  ]
}

const FACILITY_STATUS_ITEMS = [
  { label: 'Certified',    desc: 'Shadow BB signed off for this cycle. Certificate submitted to agent.' },
  { label: 'Needs Review', desc: 'Submission has unresolved issues — LP matches or eligibility disputes — requiring credit officer action before certification.' },
  { label: 'In Progress',  desc: 'Submission uploaded; credit officer is working through matching, classification, and Shadow BB.' },
  { label: 'Not Started',  desc: 'Certificate not yet processed for this cycle.' },
]

const FACILITY_COLS = [
  { key: 'name',    label: 'Facility'  },
  { key: 'lps',     label: '# LPs',    align: 'right', style: { width: 70  }, render: (r: FacilityRow) => r.lps.toLocaleString() },
  { key: 'agentBB', label: 'Agent BB', align: 'right', style: { width: 90  } },
  { key: 'ubsBB',   label: 'UBS BB',   align: 'right', style: { width: 90  } },
  { key: 'delta',   label: 'Delta',    align: 'right', style: { width: 90  }, neg: (r: FacilityRow) => r.delta.startsWith('-') },
  { key: 'ear',     label: 'EAR',      align: 'right', style: { width: 70  } },
  { key: 'lastRun', label: 'Last Run', align: 'right', style: { width: 85  }, render: (r: FacilityRow) => <span style={{ color: r.lastRun === '—' ? 'var(--muted)' : 'inherit' }}>{r.lastRun}</span> },
  { key: 'status',  label: 'Status',                   style: { width: 120 }, render: (r: FacilityRow) => <Tag>{r.status}</Tag> },
]

const donutData = getDonutData()

export default function Dashboard() {
  const { navigate, currentUser, setActiveSubmission, screen } = useApp()
  const [facilities,       setFacilities]       = useState<FacilityRow[]>([])
  const [selectedFacility, setSelectedFacility] = useState<FacilityRow | null>(null)
  const [statusFilter,     setStatusFilter]     = useState('All')
  const [activityFeed,     setActivityFeed]     = useState<ReturnType<typeof getActivityFeed>>([])
  const [loading,          setLoading]          = useState(false)

  const load = () => {
    setLoading(true)
    getFacilities().then(data => {
      setFacilities(data)
      setSelectedFacility(prev => prev ? (data.find(f => f.name === prev.name) ?? data[0] ?? null) : (data[0] ?? null))
      setActivityFeed(data.length > 0 ? getActivityFeed() : [])
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (screen === 'dashboard') load()
  }, [screen])

  const filteredFacilities = statusFilter === 'All' ? facilities : facilities.filter(f => f.status === statusFilter)
  const donut              = selectedFacility ? (donutData[selectedFacility.name] ?? null) : null
  const certifiedCount      = facilities.filter(f => f.status === 'Certified').length
  const needsReviewCount    = facilities.filter(f => f.status === 'Needs Review').length
  const inProgressCount     = facilities.filter(f => f.status === 'In Progress').length
  const notStartedCount     = facilities.filter(f => f.status === 'Not Started').length

  const kpis = [
    {
      label: 'Facilities This Cycle',
      value: String(facilities.length),
      sub: <>
        <span style={{ color: 'var(--green)' }}>{certifiedCount} certified</span>
        {' · '}
        <span style={{ color: 'var(--amber)' }}>{needsReviewCount} needs review</span>
        {' · '}
        <span style={{ color: 'var(--blue)' }}>{inProgressCount} in progress</span>
      </>,
      color: 'black',
    },
    { label: 'Total LP Records',   value: facilities.reduce((s, f) => s + f.lps, 0).toLocaleString(),              sub: 'across all facilities',                                  color: 'blue'  },
    { label: 'Pending LP Reviews', value: donut ? String(donut.pendingReviews) : '—', sub: donut ? `${donut.pendingReviewsSub} · ${selectedFacility?.name}` : '', color: 'amber' },
    { label: 'Last BB Run',        value: donut ? donut.lastBBRun : '—',              sub: donut ? `${donut.lastBBSub} · ${selectedFacility?.name}` : '',          color: 'green' },
  ]

  return (
    <div>
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
                <option value="Certified">Certified ({certifiedCount})</option>
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
                ? `${selectedFacility?.name ?? '—'} · Not yet certified this cycle`
                : `${selectedFacility.name} · As Of ${selectedFacility.lastRun}`
            }
          >
            {(() => {
              const f = selectedFacility
              const isOwner = f?.submittedBy === currentUser.name
              const isPrivileged = currentUser.role === 'Supervisor' || currentUser.role === 'Admin'
              const canAct = isOwner || isPrivileged

              const ownerTag = f?.submittedBy ? (
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  Submitted by <strong>{f.submittedBy}</strong>
                  {!isOwner && !isPrivileged && <span style={{ color: 'var(--amber)', marginLeft: 4 }}>(view only)</span>}
                </span>
              ) : null

              const cta = f?.status === 'Certified' ? (
                <Button size="sm" variant="action" onClick={() => navigate('shadow-bb')}>View Shadow BB ›</Button>
              ) : f?.status === 'Needs Review' ? (
                <Button size="sm" variant="action" onClick={() => {
                  setActiveSubmission(f.name)
                  navigate(f.step === 4 ? 'match-queue' : f.step === 5 ? 'run-shadow-bb' : 'extraction-preview')
                }}>Review Submission ›</Button>
              ) : f?.status === 'In Progress' ? (
                <Button size="sm" variant="action" onClick={() => {
                  setActiveSubmission(f.name)
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
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>No certified BB this cycle</span>
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
                          Submission needs review — figures reflect last certified BB
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
          {activityFeed.map((a, i) => (
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
