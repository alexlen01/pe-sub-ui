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

// "May 27, 2026" style — used for Agent Bank Summary date fields that need the year.
function formatFullDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  return new Date(date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Deterministic loan account number in the agent's "5V" house format (e.g. "5VX1796"),
// keyed on facility name so the value is stable across renders/sessions.
function genAccountNumber(name: string): string {
  const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0
  h = Math.abs(h)
  return `5V${LETTERS[h % LETTERS.length]}${String(h % 10000).padStart(4, '0')}`
}

// Deterministic facility maturity date in the 2027–2031 window, keyed on facility name.
function genMaturityDate(name: string): Date {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (Math.imul(37, h) + name.charCodeAt(i)) | 0
  h = Math.abs(h)
  return new Date(2027 + (h % 5), h % 12, 1 + (h % 28))
}

function formatAuditTs(isoTs: string): string {
  if (!isoTs) return '—'
  return isoTs.replace('T', ' ').slice(0, 16)
}

function formatActivityTime(isoTs: string): string {
  if (!isoTs) return '—'
  return isoTs.slice(11, 16)
}

// ── Row types (API response shapes after display formatting) ───────────────────

export interface FacilityRow {
  name:                 string
  agentBank:            string
  status:               string
  lps:                  number
  facilitySize:         string
  ubsParticipation:     string
  ubsParticipationRate: string
  creditAgreementRef:   string
  agentBB:              string
  ubsBB:                string
  delta:                string
  ear:                  string
  lastRun:              string
  step:                 number | null
  submittedBy:          string | null
  accountNumber:        string
  loanAmount:           string
  maturityDate:         string
  facilityStatusDate:   string
  id?:                  number
  lastRunAt?:           string | null
  latestSubmissionId?:  number | null
}

export interface SubmissionRow {
  id?:         number
  facilityId?: number
  facility:    string
  date:        string
  status:      string
  action:      string
  step:        number
  file:        string
  agentBank:   string
  notes:       string
}

export interface ActivityRow {
  ts:     string
  event:  string
  detail: string
  user:   string
  color:  string
  time:   string
}

export interface AuditRow {
  ts:       string
  event:    string
  facility: string
  detail:   string
  user:     string
  ip:       string
}

// ── API exports ────────────────────────────────────────────────────────────────

export async function getFacilities(): Promise<FacilityRow[]> {
  const [facilities, submissions] = await Promise.all([api.facilities.list(), api.submissions.list()])
  const latestById = new Map<number, number>()
  submissions.forEach(s => {
    const cur = latestById.get(s.facilityId)
    if (!cur || s.id > cur) latestById.set(s.facilityId, s.id)
  })
  // For navigation: find the latest in-Review submission per facility to get its wizard step.
  const latestReviewById = new Map<number, { id: number; wizardStep: number }>()
  submissions
    .filter(s => s.status === 'Review')
    .forEach(s => {
      const cur = latestReviewById.get(s.facilityId)
      if (!cur || s.id > cur.id) latestReviewById.set(s.facilityId, { id: s.id, wizardStep: s.wizardStep })
    })
  return facilities.map(f => {
    const review = f.id != null ? latestReviewById.get(f.id) : undefined
    return {
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
      step:                 review?.wizardStep ?? null,
      submittedBy:          null as string | null,
      id:                   f.id,
      lastRunAt:            f.lastRunAt,
      latestSubmissionId:   review?.id ?? latestById.get(f.id) ?? null,
      accountNumber:        genAccountNumber(f.name),
      loanAmount:           '',
      maturityDate:         formatFullDate(genMaturityDate(f.name)),
      facilityStatusDate:   f.lastRunAt ? formatFullDate(f.lastRunAt) : '—',
    }
  }) as FacilityRow[]
}

export async function getSubmissions(): Promise<SubmissionRow[]> {
  const data = await api.submissions.list()
  return data.map(s => ({
    id:         s.id,
    facilityId: s.facilityId,
    facility:   s.facilityName || `Facility ${s.facilityId}`,
    date:       new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    status:     s.status,
    action:     s.status === 'Review' ? 'Resolve' : s.status === 'Error' ? 'Failed' : s.status === 'Aborted' ? '—' : 'View',
    step:       s.wizardStep,
    file:       s.fileName,
    agentBank:  s.agentBank,
    notes:      s.notes ?? '',
  }))
}

const ACTIVITY_EXCLUDED = new Set(['Login', 'Config Change', 'Export'])

function activityColor(event: string): string {
  if (event === 'Upload') return '#2E75B6'
  if (event.includes('BB') || event.includes('Shadow') || event.includes('Calculated')) return '#007A38'
  if (event.includes('LP')) return '#C65C00'
  return '#767676'
}

export async function getActivityFeed(): Promise<ActivityRow[]> {
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

export async function getAuditLog(): Promise<AuditRow[]> {
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
