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
// Date-only strings ("2029-03-15") are anchored to local midnight so the day isn't shifted
// back by the UTC offset; full datetimes pass through unchanged.
function formatFullDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(date + 'T00:00:00')
    : new Date(date as string)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Loan Amount is stored as a NUMERIC dollar amount on the facility; format it for display
// (e.g. 2_500_000_000 → "$2.5B"). Returns "—" when not yet set.
function formatMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toLocaleString('en-US')}`
}

export function formatUsdNoDecimals(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export function formatLoanAmount(n: number | null | undefined): string {
  return formatUsdNoDecimals(n)
}

// Shadow BB figures arrive from the API in $millions. Format for display as "$138.6M"
// (matching the Executive Summary's parseM contract). Returns "—" when no BB has been run.
function formatM(n: number | null | undefined): string {
  if (n == null) return '—'
  return `$${n.toFixed(1)}M`
}

// Signed millions delta, e.g. "-$2.0M" / "+$0.5M". "—" when absent.
function formatDeltaM(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n < 0 ? '-' : '+'}$${Math.abs(n).toFixed(1)}M`
}

// A rate stored as a fraction (0.874) → "87.4%". "—" when absent.
function formatPctFraction(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

// Inverse of formatMoney for the Facility Edit input — parses "$2.5B" / "150M" / "1,200,000"
// into a plain dollar amount. Returns null for blank / "—" / unparseable input.
export function parseMoneyToNumber(s: string | null | undefined): number | null {
  if (!s) return null
  const trimmed = s.trim()
  if (!trimmed || trimmed === '—') return null
  const m = trimmed.replace(/[$,\s]/g, '').match(/^(-?\d*\.?\d+)([bmkt]?)$/i)
  if (!m) return null
  const mult = { b: 1e9, m: 1e6, k: 1e3, t: 1e12, '': 1 }[m[2].toLowerCase()] ?? 1
  return parseFloat(m[1]) * mult
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
  collateralDate:       string
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
      facilitySize:         formatMoney(f.facilitySize),
      ubsParticipation:     formatMoney(f.ubsParticipation),
      ubsParticipationRate: (f.facilitySize && f.ubsParticipation)
                              ? `${((f.ubsParticipation / f.facilitySize) * 100).toFixed(0)}%`
                              : '—',
      agentBB:              formatM(f.agentBB),
      ubsBB:                formatM(f.ubsBB),
      delta:                formatDeltaM(f.bbDelta),
      ear:                  formatPctFraction(f.ear),
      lastRun:              f.lastRunAt ? formatLastRun(f.lastRunAt) : '—',
      step:                 review?.wizardStep ?? null,
      submittedBy:          null as string | null,
      id:                   f.id,
      lastRunAt:            f.lastRunAt,
      latestSubmissionId:   review?.id ?? latestById.get(f.id) ?? null,
      accountNumber:        f.accountNumber ?? '—',
      loanAmount:           formatLoanAmount(f.loanAmount),
      maturityDate:         f.maturityDate ? formatFullDate(f.maturityDate) : '—',
      collateralDate:       f.collateralDate ? formatFullDate(f.collateralDate) : '—',
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
  if (event.includes('LPRecord')) return '#C65C00'
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
