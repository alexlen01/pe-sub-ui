import { FACILITIES, SUBMISSIONS, ACTIVITY, AUDIT_LOG } from '../data/facilityData'
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

function businessDaysBefore(count: number, anchorIso: string): Date[] {
  const dates: Date[] = []
  const d = new Date(anchorIso + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  while (dates.length < count) {
    if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(new Date(d))
    d.setDate(d.getDate() - 1)
  }
  return dates
}

const CYCLE_BDAYS = businessDaysBefore(17, '2026-05-24')
const OWNERS = ['J. Smith', 'M. Chen', 'L. Torres']

const STATUS_OVERRIDES: Record<string, string> = {
  'Blue Owl GP Stakes V':         'Not Started',
  'Apollo Natural Resources III': 'Needs Review',
  'Ares Capital IX':              'Needs Review',
  'Carlyle Partners VIII':        'Needs Review',
  'Advent Global IX':             'In Progress',
}

const SUBMITTED_BY_OVERRIDES: Record<string, string> = {
  'Blue Owl GP Stakes V': 'J. Smith',
  'Advent Global IX':     'L. Torres',
}

const PINNED_RUN_DATES: Record<string, Date> = {
  'Apollo Natural Resources III': new Date('2026-05-26T00:00:00'),
  'Ares Capital IX':              new Date('2026-05-26T00:00:00'),
  'Blackstone CRE VII':           new Date('2026-05-22T00:00:00'),
  'Carlyle Partners VIII':        new Date('2026-05-25T00:00:00'),
}

function _localGetFacilities() {
  const latestStep: Record<string, { date: string; step: number }> = {}
  SUBMISSIONS.forEach(s => {
    if (!latestStep[s.facility] || s.date > latestStep[s.facility].date) latestStep[s.facility] = s
  })

  const STATUS_PRIORITY: Record<string, number> = { 'Not Started': 0, 'In Progress': 1, 'Needs Review': 2, 'Certified': 3 }

  return FACILITIES.map(f => {
    const status = STATUS_OVERRIDES[f.name] ?? 'Certified'
    const h = f.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const hasSubmission = status === 'Certified' || status === 'Needs Review' || status === 'In Progress'
    const submittedBy   = hasSubmission ? (SUBMITTED_BY_OVERRIDES[f.name] ?? OWNERS[h % OWNERS.length]) : null
    const step          = latestStep[f.name]?.step ?? null
    if (status === 'Not Started') return { ...f, status, step: null, lastRun: '—', submittedBy: null, _sort: new Date(0) }
    if (status === 'In Progress')  return { ...f, status, step, lastRun: '—', submittedBy, _sort: new Date('2026-05-26T00:00:00') }
    const runDate = PINNED_RUN_DATES[f.name] ?? CYCLE_BDAYS[h % CYCLE_BDAYS.length]
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

import { reportApiMode } from './apiStatus'

export type FacilityRow = ReturnType<typeof _localGetFacilities>[0]
export type SubmissionRow = ReturnType<typeof _localGetSubmissions>[0]
export type ActivityRow   = ReturnType<typeof _localGetActivityFeed>[0]
export type AuditRow      = ReturnType<typeof _localGetAuditLog>[0]

export async function getFacilities(): Promise<FacilityRow[]> {
  try {
    const data = (await api.facilities.list()) as unknown as FacilityRow[]
    reportApiMode('live')
    return data
  } catch {
    reportApiMode('prototype')
    return _localGetFacilities()
  }
}

export function getFacilityNames(): string[] { return _localGetFacilityNames() }

export async function getSubmissions(): Promise<SubmissionRow[]> {
  try {
    const data = (await api.submissions.list()) as unknown as SubmissionRow[]
    reportApiMode('live')
    return data
  } catch {
    return []
  }
}

export function getActivityFeed(): ActivityRow[] { return [] }

export async function getAuditLog(): Promise<AuditRow[]> {
  try {
    const data = (await api.facilities.list()) as unknown as AuditRow[]
    reportApiMode('live')
    return data
  } catch {
    return []
  }
}

export async function createFacility(name: string, agentBank: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await api.facilities.create(name, agentBank)
    reportApiMode('live')
    return { ok: true }
  } catch (e: unknown) {
    if (e instanceof Response || (e && typeof e === 'object' && 'status' in e)) {
      const status = (e as { status: number }).status
      if (status === 409) return { ok: false, error: 'A facility with this name already exists.' }
    }
    return { ok: false, error: 'Unable to save facility. Check that the API is running.' }
  }
}

export function getDonutData() { return _localGetDonutData() }
