import type { Facility, LP, BBSnapshot, BBResult } from '../types'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

// ── HTTP primitives ───────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  )
  const s = p.toString()
  return s ? `?${s}` : ''
}

// ── Inline types for planned endpoints (replace with pe-sub-common imports once added) ──

export interface BBSummaryExt {
  // LP Portfolio
  totalCapCommit: number; totalCalledCap: number; pctCalled: number
  totalAllUncalled: number; totalLPs: number
  pctInstitutional: number; pctHNW: number; pctTop10: number; pctTop20: number
  igRatio: number; pctUncalledGt2M: number
  // Borrowing Base
  facilitySize: number; ubsParticipation: number; ubsParticipationPct: number
  facilityLTV: number; availableCommit: number; facilityAdvRate: number
  agentBBRaw: number; ubsBBRaw: number; ubsAdvRate: number
  // Rate & classification breakdowns
  busaBreakdown:  RateBreakdownRow[]
  agentBreakdown: RateBreakdownRow[]
  clsBreakdown:   ClassBreakdownRow[]
}

export interface RateBreakdownRow { rate: string; count: number; dollars: number; pct: number }
export interface ClassBreakdownRow { label: string; count: number; dollars: number; pct: number }

export interface EARDataPoint { calculatedAt: string; ear: number; agentEar: number; earDelta: number }

export interface Submission {
  id: number; facilityId: number; agentBank: string; periodMonth: string
  status: string; fileName: string; uploadedBy: number | null
  createdAt: string; updatedAt: string
}

export interface ExtractedLP {
  id: number; submissionId: number; rawName: string; masterName: string | null
  confidence: number; fields: Record<string, unknown>
}

export interface DocRecognition {
  agentBank: string | null; sheetNames: string[]; headerRow: number | null
  totalRows: number; confidence: number
}

export interface AliasEntry { id: number; text: string; tier: string; bank: string | null }

export interface AliasGroup {
  group: string
  fields: Array<{ canonical: string; lpMasterField: string; disambiguation?: string | null; aliases: AliasEntry[] }>
}

export interface MatchQueueItem {
  id: number; submissionId: number; agentName: string; masterName: string | null
  score: number; decision: 'pending' | 'accepted' | 'rejected' | 'manual' | null; isNew: boolean
}

export interface MatchThresholds { autoAccept: number; reviewQueue: number }

// ── API client ────────────────────────────────────────────────────────────────

export const api = {

  // ── Facilities ──────────────────────────────────────────────────────────────
  facilities: {
    list: () =>
      get<Facility[]>('/api/facilities'),
    get: (id: number) =>
      get<Facility>(`/api/facilities/${id}`),
    setStatus: (id: number, status: string) =>
      patch<Facility>(`/api/facilities/${id}/status`, { status }),
  },

  // ── LPs ─────────────────────────────────────────────────────────────────────
  lps: {
    list: (params: { facilityId?: number; cls?: string; search?: string } = {}) =>
      get<LP[]>(`/api/lps${qs(params)}`),
    get: (id: number) =>
      get<LP>(`/api/lps/${id}`),
    update: (id: number, data: Partial<LP>) =>
      patch<LP>(`/api/lps/${id}`, data),
  },

  // ── Borrowing Base ───────────────────────────────────────────────────────────
  bb: {
    run: (facilityId: number) =>
      post<BBSnapshot>(`/api/bb/run/${facilityId}`),
    snapshots: (facilityId: number) =>
      get<BBSnapshot[]>(`/api/bb/snapshots/${facilityId}`),
    latestSnapshot: (facilityId: number) =>
      get<BBSnapshot>(`/api/bb/snapshots/${facilityId}/latest`),
    summaryExt: (facilityId: number) =>
      get<BBSummaryExt>(`/api/bb/summary-ext/${facilityId}`),
  },

  // ── Reports ──────────────────────────────────────────────────────────────────
  reports: {
    collateral: (facilityId: number) =>
      get<{ facilityId: number; calculatedAt: string; summary: BBResult['summary'] }>(
        `/api/reports/collateral/${facilityId}`
      ),
    concentration: (facilityId: number) =>
      get<{ breaches: BBResult['breaches'] }>(`/api/reports/concentration/${facilityId}`),
    ear: (facilityId: number) =>
      get<EARDataPoint[]>(`/api/reports/ear/${facilityId}`),
  },

  // ── Submissions ───────────────────────────────────────────────────────────────
  submissions: {
    list: (params: { facilityId?: number } = {}) =>
      get<Submission[]>(`/api/submissions${qs(params)}`),
    get: (id: number) =>
      get<Submission>(`/api/submissions/${id}`),
    create: (facilityId: number, agentBank: string, periodMonth: string, file: File) => {
      const form = new FormData()
      form.append('facilityId', String(facilityId))
      form.append('agentBank', agentBank)
      form.append('periodMonth', periodMonth)
      form.append('file', file)
      return postForm<Submission>('/api/submissions', form)
    },
  },

  // ── Extraction ────────────────────────────────────────────────────────────────
  extraction: {
    extractedLPs: (submissionId: number) =>
      get<ExtractedLP[]>(`/api/submissions/${submissionId}/extracted-lps`),
    fieldMap: (submissionId: number) =>
      get<Record<string, string>>(`/api/submissions/${submissionId}/field-map`),
    docRecognition: (submissionId: number) =>
      get<DocRecognition>(`/api/submissions/${submissionId}/doc-recognition`),
    unrecognizedColumns: (submissionId: number) =>
      get<string[]>(`/api/submissions/${submissionId}/unrecognized-columns`),
  },

  // ── Field Mapping ─────────────────────────────────────────────────────────────
  fieldMapping: {
    aliasGroups: () =>
      get<AliasGroup[]>('/api/field-mapping/alias-groups'),
    canonicalFields: () =>
      get<string[]>('/api/field-mapping/canonical-fields'),
    blocklist: () =>
      get<string[]>('/api/field-mapping/blocklist'),
    suggestions: () =>
      get<Array<{ extractedHeader: string; canonicalField: string }>>('/api/field-mapping/suggestions'),
    suggest: (extractedHeader: string, canonicalField: string) =>
      post('/api/field-mapping/suggestions', { extractedHeader, canonicalField }),
  },

  // ── Matching ──────────────────────────────────────────────────────────────────
  matching: {
    queue: (submissionId: number) =>
      get<MatchQueueItem[]>(`/api/matching/queue${qs({ submissionId })}`),
    decide: (id: number, decision: MatchQueueItem['decision'], masterName?: string) =>
      patch<MatchQueueItem>(`/api/matching/queue/${id}`, { decision, masterName }),
    getThresholds: () =>
      get<MatchThresholds>('/api/matching/thresholds'),
    setThresholds: (t: MatchThresholds) =>
      patch<MatchThresholds>('/api/matching/thresholds', t),
  },

  // ── Config (read-only, mirrors pe-sub-platform configService / classificationService) ──
  config: {
    classification: () =>
      get('/api/config/classification'),
    eligibility: () =>
      get('/api/config/eligibility'),
    wizard: () =>
      get('/api/config/wizard'),
    audit: () =>
      get('/api/config/audit'),
    matching: () =>
      get('/api/config/matching'),
    reports: () =>
      get('/api/config/reports'),
  },
}
