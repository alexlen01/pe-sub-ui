import type { Facility, LP, BBSnapshot, BBResult } from '../types'

export interface MatchCandidate { name: string; score: number; action: string }
export interface MatchTestResult { input: string; normalised: string; matches: MatchCandidate[] }

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

// ── HTTP primitives ───────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  const text = await res.text()
  if (!text) throw new Error(`GET ${path} returned empty response`)
  return JSON.parse(text) as T
}

async function extractApiError(res: Response, fallback: string): Promise<string> {
  try {
    const json = await res.clone().json()
    if (typeof json?.detail === 'string') return json.detail
  } catch { /* ignore */ }
  return fallback
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await extractApiError(res, `PATCH ${path} failed: ${res.status}`))
  return res.json() as Promise<T>
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await extractApiError(res, `POST ${path} failed: ${res.status}`))
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  return res.json() as Promise<T>
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`)
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
  id: number; facilityId: number; facilityName: string; agentBank: string; periodMonth: string
  status: string; fileName: string; uploadedBy: number | null; notes: string | null
  wizardStep: number; shadowBbOverrides: Record<string, unknown> | null
  createdAt: string; updatedAt: string
}

export interface ExtractedLP {
  id: number; submissionId: number; rawName: string; masterName: string | null
  confidence: number; fields: Record<string, unknown>
}

export interface AgentExtractedRow {
  id: number; name: string
  commit: string; uncalled: string; aum: string; nav: string
  sp: string; moodys: string; fitch: string
  agentRate: string; agentConc: string
  agentBBFmt: string; pctBBFmt: string
}

export interface DocRecognition {
  document: string; format: string
  tablesIdentified: string; tableLocation: string
  headerRow: number; totalRows: number
  mappedColumns: number; unmatchedColumns: number
  headerInfo: string
}

export interface LpRate {
  lpId: number
  lpName: string
  classification: string
  ubsAdvRatePct: number    // decimal fraction e.g. 0.9 = 90%
  ubsConcLimitPct: number  // decimal fraction e.g. 0.075 = 7.5%
  effectiveDate: string    // ISO date YYYY-MM-DD
}

export interface AliasEntry { id: number; text: string; tier: string; bank: string | null }

export interface AliasGroup {
  group: string
  fields: Array<{ id?: number; canonical: string; lpMasterField: string; disambiguation?: string | null; aliases: AliasEntry[] }>
}

export interface MatchQueueItem {
  id: number; submissionId: number; facilityId?: number; facilityName?: string
  agentName: string; masterName: string | null
  score: number; decision: string | null; status?: string; isNew: boolean; reasons?: string[]
}

export interface MatchingThresholds {
  autoAccept: number; reviewQueue: number
  jwWeight: number; levWeight: number
  stripSuffixes: boolean; caseFold: boolean; punctuation: boolean; abbrevExpand: boolean
}
export interface LegalSuffix       { abbr: string; full: string; strip: boolean }
export interface KnownAbbreviation { token: string; expansion: string }
export interface MatchingConfig {
  thresholds:         MatchingThresholds
  legalSuffixes:      LegalSuffix[]
  knownAbbreviations: KnownAbbreviation[]
}

// ── API client ────────────────────────────────────────────────────────────────

export const api = {

  // ── Facilities ──────────────────────────────────────────────────────────────
  facilities: {
    list: () =>
      get<Facility[]>('/api/facilities'),
    get: (id: number) =>
      get<Facility>(`/api/facilities/${id}`),
    create: (name: string, agentBank: string) =>
      post<Facility>('/api/facilities', { name, agentBank }),
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
    lookup: (name: string) =>
      get<LP[]>(`/api/lps/lookup${qs({ name })}`),
    rates: (effectiveDate?: string) =>
      get<LpRate[]>(`/api/lps/rates${qs({ effective_date: effectiveDate })}`),
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
    create: (facilityId: number, agentBank: string, periodMonth: string, file: File, notes?: string) => {
      const form = new FormData()
      form.append('facilityId', String(facilityId))
      form.append('agentBank', agentBank)
      form.append('periodMonth', periodMonth)
      form.append('file', file)
      if (notes?.trim()) form.append('notes', notes.trim())
      return postForm<Submission>('/api/submissions', form)
    },
    abort: (id: number) =>
      post<void>(`/api/submissions/${id}/abort`, {}),
    confirm: (id: number) =>
      post<{ templateSaved: boolean; agentBank: string }>(`/api/submissions/${id}/confirm`, {}),
    saveShadowBbState: (id: number, overrides: Record<string, unknown> | null) =>
      patch<Submission>(`/api/submissions/${id}/shadow-bb-state`, { overrides }),
    complete: (id: number) =>
      post<Submission>(`/api/submissions/${id}/complete`, {}),
  },

  // ── Extraction ────────────────────────────────────────────────────────────────
  extraction: {
    extractedLPs: (submissionId: number) =>
      get<ExtractedLP[]>(`/api/submissions/${submissionId}/extracted-lps`),
    agentRows: (submissionId: number) =>
      get<AgentExtractedRow[]>(`/api/submissions/${submissionId}/extracted-lps`),
    fieldMap: (submissionId: number) =>
      get<Array<{ extracted: string; canonical: string; group: string; note: string; tier: string }>>(`/api/submissions/${submissionId}/field-map`),
    docRecognition: (submissionId: number) =>
      get<DocRecognition>(`/api/submissions/${submissionId}/doc-recognition`),
    unrecognizedColumns: (submissionId: number) =>
      get<string[]>(`/api/submissions/${submissionId}/unrecognized-columns`),
    remap: (submissionId: number, extractedHeader: string, canonical: string) =>
      post<void>(`/api/submissions/${submissionId}/remap`, { extractedHeader, canonical }),
    reextract: (submissionId: number) =>
      post<void>(`/api/submissions/${submissionId}/reextract`, {}),
  },

  // ── Field Mapping ─────────────────────────────────────────────────────────────
  fieldMapping: {
    aliasGroups: () =>
      get<AliasGroup[]>('/api/field-mapping/alias-groups'),
    canonicalFields: () =>
      get<Array<{ value: string; label: string; extractable: boolean }>>('/api/field-mapping/canonical-fields'),
    blocklist: () =>
      get<Array<{ id: number; qualifier: string; reason: string }>>('/api/field-mapping/blocklist'),
    suggestions: () =>
      get<Array<{ id: number; extractedHeader: string; canonicalField: string; suggestedBy: string | null; source: string; confidence: number | null; createdAt: string }>>('/api/field-mapping/suggestions'),
    suggest: (extractedHeader: string, canonicalField: string) =>
      post('/api/field-mapping/suggestions', { extractedHeader, canonicalField }),
    aliases: {
      create: (canonicalFieldId: number, text: string, tier: string, bank: string | null) =>
        post<AliasEntry>('/api/field-mapping/aliases', { canonicalFieldId, text, tier, bank }),
      remove: (id: number) =>
        del(`/api/field-mapping/aliases/${id}`),
      update: (id: number, text: string, bank: string | null) =>
        patch<AliasEntry>(`/api/field-mapping/aliases/${id}`, { text, bank }),
    },
  },

  // ── Matching ──────────────────────────────────────────────────────────────────
  matching: {
    test: (name: string) =>
      post<MatchTestResult>('/api/matching/test', { name }),
    queue: (submissionId: number) =>
      get<MatchQueueItem[]>(`/api/matching/queue${qs({ submissionId })}`),
    decide: (id: number, decision: MatchQueueItem['decision'], masterName?: string) =>
      patch<MatchQueueItem>(`/api/matching/queue/${id}`, { decision, masterName }),
    getThresholds: () =>
      get<MatchingConfig>('/api/matching/thresholds'),
    setThresholds: (t: MatchingConfig) =>
      patch<MatchingConfig>('/api/matching/thresholds', t),
  },

  // ── Health ────────────────────────────────────────────────────────────────────
  health: {
    ping: () => get<{ status: string }>('/api/ping'),
  },

  // ── Audit ─────────────────────────────────────────────────────────────────────
  audit: {
    list: () =>
      get<Array<{ ts: string; event: string; detail: string; facility: string; user: string; ip: string }>>('/api/audit'),
    login: () =>
      post<void>('/api/audit/login'),
  },

  // ── Config ────────────────────────────────────────────────────────────────────
  config: {
    classification: () =>
      get('/api/config/classification'),
    eligibility: () =>
      get('/api/config/eligibility'),
    setEligibility: (section: string, data: unknown) =>
      put<unknown>(`/api/config/eligibility?section=${encodeURIComponent(section)}`, data),
    wizard: () =>
      get('/api/config/wizard'),
    audit: () =>
      get('/api/config/audit'),
    matching: () =>
      get<MatchingConfig>('/api/config/matching'),
    setMatching: (data: MatchingConfig, section: string) =>
      put<MatchingConfig>(`/api/config/matching?section=${encodeURIComponent(section)}`, data),
    reports: () =>
      get('/api/config/reports'),
  },
}
