import {
  FACILITIES, SUBMISSIONS, ACTIVITY, AUDIT_LOG,
  PROTOTYPE_CYCLE_BDAYS, PROTOTYPE_OWNERS,
  PROTOTYPE_STATUS_OVERRIDES, PROTOTYPE_SUBMITTED_BY_OVERRIDES, PROTOTYPE_PINNED_RUN_DATES,
} from '../data/facilityData'
import { DONUT_DATA } from '../data/lpData'
import { api } from './api'

// ── Date formatters ───────────────────────────────────────────────────────────

export function formatLastRun(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date as string)
  const now = new Date()
  if (d > now) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const diffMs = now.getTime() - d.getTime()
  const diffH  = Math.floor(diffMs / 3_600_000)
  const diffD  = Math.floor(diffMs / 86_400_000)
  return diffD === 0 ? `${Math.max(1, diffH)}h ago` : `${diffD}d ago`
}

function formatRunDate(date: Date | string): string {
  if (!date) return '—'
  return new Date(date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatShortDate(isoDate: string): string {
  if (!isoDate) return '—'
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatAuditTs(isoTs: string): string {
  if (!isoTs) return '—'
  return isoTs.replace('T', ' ').slice(0, 16)
}

function formatActivityTime(isoTs: string): string {
  if (!isoTs) return '—'
  return isoTs.slice(11, 16)
}

// ── Local computation ─────────────────────────────────────────────────────────

function _localGetFacilities() {
  const latestStep: Record<string, { date: string; step: number }> = {}
  SUBMISSIONS.forEach(s => {
    if (!latestStep[s.facility] || s.date > latestStep[s.facility].date) latestStep[s.facility] = s
  })

  const STATUS_PRIORITY: Record<string, number> = { 'Not Started': 0, 'In Progress': 1, 'Needs Review': 2, 'Certified': 3 }

  return FACILITIES.map(f => {
    const status = PROTOTYPE_STATUS_OVERRIDES[f.name] ?? 'Certified'
    const h = f.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const hasSubmission = status === 'Certified' || status === 'Needs Review' || status === 'In Progress'
    const submittedBy   = hasSubmission ? (PROTOTYPE_SUBMITTED_BY_OVERRIDES[f.name] ?? PROTOTYPE_OWNERS[h % PROTOTYPE_OWNERS.length]) : null
    const step          = latestStep[f.name]?.step ?? null
    if (status === 'Not Started') return { ...f, status, step: null, lastRun: '—', submittedBy: null, _sort: new Date(0) }
    if (status === 'In Progress')  return { ...f, status, step, lastRun: '—', submittedBy, _sort: new Date('2026-05-26T00:00:00') }
    const runDate = PROTOTYPE_PINNED_RUN_DATES[f.name] ?? PROTOTYPE_CYCLE_BDAYS[h % PROTOTYPE_CYCLE_BDAYS.length]
    return { ...f, status, step, lastRun: formatRunDate(runDate), submittedBy, _sort: runDate }
  })
    .sort((a, b) => {
      const pd = (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9)
      return pd !== 0 ? pd : b._sort.getTime() - a._sort.getTime()
    })
    .map(({ _sort: _s, ...f }) => f)
}


function _localGetFacilityNames() { return FACILITIES.map(f => f.name).sort((a, b) => a.localeCompare(b)) }

function _localGetSubmissions() {
  return [...SUBMISSIONS]
    .sort((a, b) => b.date.localeCompare(a.date) || a.facility.localeCompare(b.facility))
    .map(s => ({ ...s, date: formatShortDate(s.date) }))
}

function _localGetActivityFeed() { return ACTIVITY.map(a => ({ ...a, time: formatActivityTime(a.ts) })) }

function _localGetAuditLog()    { return AUDIT_LOG.map(r => ({ ...r, ts: formatAuditTs(r.ts) })) }

function _localGetDonutData() {
  function formatPeriod(isoMonth: string) {
    if (!isoMonth) return '—'
    const [y, m] = isoMonth.split('-')
    return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  return Object.fromEntries(
    Object.entries(DONUT_DATA).map(([k, v]) => [k, { ...v, lastBBRun: formatLastRun(v.lastBBRun), lastBBSub: formatPeriod(v.lastBBSub) }])
  )
}

// ── API-first exports ─────────────────────────────────────────────────────────

export type FacilityRow = ReturnType<typeof _localGetFacilities>[0] & {
  id?: number
  lastRunAt?: string | null
  latestSubmissionId?: number | null
}
export type SubmissionRow = ReturnType<typeof _localGetSubmissions>[0]
export type ActivityRow   = ReturnType<typeof _localGetActivityFeed>[0]
export type AuditRow      = ReturnType<typeof _localGetAuditLog>[0]

export async function getFacilities(live: boolean): Promise<FacilityRow[]> {
  if (!live) return _localGetFacilities()
  const [facilities, submissions] = await Promise.all([api.facilities.list(), api.submissions.list()])
  const latestById = new Map<number, number>()
  submissions.forEach(s => {
    const cur = latestById.get(s.facilityId)
    if (!cur || s.id > cur) latestById.set(s.facilityId, s.id)
  })
  return facilities.map(f => ({
    name:                 f.name,
    agentBank:            f.agentBank,
    status:               f.status,
    lps:                  f.lpCount,
    facilitySize:         '—',
    ubsParticipation:     '—',
    ubsParticipationRate: '—',
    creditAgreementRef:   '—',
    agentBB:              '—',
    ubsBB:                '—',
    delta:                '—',
    ear:                  '—',
    lastRun:              f.lastRunAt ? formatLastRun(f.lastRunAt) : '—',
    step:                 null as number | null,
    submittedBy:          null as string | null,
    id:                   f.id,
    lastRunAt:            f.lastRunAt,
    latestSubmissionId:   latestById.get(f.id) ?? null,
  })) as FacilityRow[]
}

export function getFacilityNames(): string[] { return _localGetFacilityNames() }

export async function getSubmissions(live: boolean): Promise<SubmissionRow[]> {
  if (!live) return _localGetSubmissions()
  const data = await api.submissions.list()
  return data.map(s => ({
    id:        s.id,
    facility:  s.facilityName || `Facility ${s.facilityId}`,
    date:      new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    status:    s.status,
    action:    s.status === 'Review' ? 'Resolve' : s.status === 'Error' ? 'Failed' : s.status === 'Aborted' ? '—' : 'View',
    step:      1,
    file:      s.fileName,
    agentBank: s.agentBank,
    notes:     s.notes ?? '',
  }))
}

const ACTIVITY_EXCLUDED = new Set(['Login', 'Config Change', 'Export'])

function activityColor(event: string): string {
  if (event === 'Upload') return '#2E75B6'
  if (event.includes('BB') || event.includes('Shadow') || event.includes('Calculated')) return '#007A38'
  if (event.includes('LP')) return '#C65C00'
  return '#767676'
}

export async function getActivityFeed(live: boolean): Promise<ActivityRow[]> {
  if (!live) return _localGetActivityFeed()
  const data = await api.audit.list()
  return data
    .filter(r => !ACTIVITY_EXCLUDED.has(r.event) && !r.event.endsWith('Exported'))
    .slice(0, 20)
    .map(r => ({
      ts:     r.ts,
      event:  r.event,
      detail: r.facility && r.facility !== '—' ? `${r.facility} · ${r.detail}` : r.detail,
      user:   r.user,
      color:  activityColor(r.event),
      time:   formatActivityTime(r.ts),
    }))
}

export async function getAuditLog(live: boolean): Promise<AuditRow[]> {
  if (!live) return _localGetAuditLog()
  const data = await api.audit.list()
  return data.map(r => ({ ...r, ts: formatAuditTs(r.ts) }))
}

export async function createFacility(name: string, agentBank: string): Promise<{ ok: true; id?: number } | { ok: false; error: string }> {
  try {
    const facility = await api.facilities.create(name, agentBank) as { id?: number }
    return { ok: true, id: facility?.id }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('409')) return { ok: false, error: 'A facility with this name already exists.' }
    if (msg.includes('400')) return { ok: false, error: 'Facility name and agent bank are required.' }
    return { ok: false, error: 'Unable to save — API unavailable. Restart pe-sub-api and try again.' }
  }
}

export function getDonutData() { return _localGetDonutData() }
