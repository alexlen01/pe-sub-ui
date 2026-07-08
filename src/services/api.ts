import type { Facility, LPRecord, BBSnapshot, BBResult } from '../types'

export type MatchBand = 'AUTO_ACCEPT' | 'REVIEW_HIGH' | 'REVIEW_LOW' | 'NO_MATCH'
export interface MatchCandidate { name: string; score: number; action: string; band?: MatchBand }
export interface MatchTestResult { input: string; normalised: string; matches: MatchCandidate[] }

// Persisted match_details breakdown (Solution Design §6.5)
export interface ScoredCandidate { name: string; jw: number; lev: number; combined: number; band: MatchBand }
export interface MatchAnalysis {
  agentName: string; normalized: string; band: MatchBand; candidates: ScoredCandidate[]
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

type ApiLP = LPRecord & {
  type?: LPRecord['instVsHnw']
  fund_sleeve?: string
  investor_type?: string
  inst_vs_hnw?: string
  region_location?: string
}

function normalizeLP(row: ApiLP): LPRecord {
  const instVsHnw = (row.instVsHnw ?? row.inst_vs_hnw ?? row.type ?? '') as LPRecord['instVsHnw']
  return {
    ...row,
    fundSleeve: row.fundSleeve ?? row.fund_sleeve ?? '',
    investorType: row.investorType ?? row.investor_type ?? '',
    instVsHnw,
    region: row.region ?? row.regionLocation ?? row.region_location ?? '',
  }
}

// ── HTTP primitives ───────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  const text = await res.text()
  if (!text) throw new Error(`GET ${path} returned empty response`)
  return JSON.parse(text) as T
}

// For endpoints where the API signals "no data yet" with 204 / an empty body.
async function getOrNull<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  if (res.status === 204) return null
  const text = await res.text()
  if (!text) return null
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
  if (!res.ok) throw new Error(await extractApiError(res, `PUT ${path} failed: ${res.status}`))
  return res.json() as Promise<T>
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await extractApiError(res, `DELETE ${path} failed: ${res.status}`))
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
  igRatio: number; pctUncalledGt25bnAum: number
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

// ── Reports (mirrors pe-sub-api ReportController DTOs) ───────────────────────

/** One LPRecord-classification tier of the certificate breakdown. Money in $millions. */
export interface ClassBreakdownReportRow {
  cls: string; count: number; uncalledM: number; ubbM: number; rate: string
}

export interface CollateralReport {
  facilityId: number; facilityName: string; agentBank: string
  snapshotId: number; calculatedAt: string
  summary: BBResult['summary']
  totalEligibleUncalledM: number
  classBreakdown: ClassBreakdownReportRow[]
}

/** UBS exposure per agent bank from each facility's latest snapshot. Money in $millions. */
export interface AgentBankExposureRow {
  agentBank: string; facilityCount: number; lpCount: number
  ubsBBM: number; agentBBM: number; deltaM: number
}

export interface ReportHistoryEntry {
  id: number; report: string
  facilityId: number | null; facilityName: string | null
  snapshotLabel: string | null; format: string | null
  userName: string | null; createdAt: string
}

export interface RecordReportRequest {
  report: string; facilityId?: number; snapshotLabel?: string; format?: string
}

/** Mirrors CommitBbRequest.CommitLpRow on the Java side. All fields from BB_PROCESS_FLOW Step 4. */
export interface CommitLpRow {
  name: string; parent: string | null; spv: boolean; hq: boolean
  fundSleeve?: string | null
  investorType?: string | null
  instVsHnw: string; type?: string; region: string; ig: boolean; cls: string
  agentCls?: string | null
  agentClsSource?: string | null
  sp: string; mdy: string; fitch: string
  aum: string | null; nav: string | null; pension: string | null; pensionFunded: string | null
  capCommit: string | null; pctCapCommit: string | null; calledCap: string | null
  uc: string | null; pctUncalled: string | null; pctCalled: string | null
  agentConc: string | null; ubsConc: string | null
  agentRate: string | null; abb: string | null; ubb?: string | null
  agentExcessConc?: string | null; ubsExcessConc?: string | null
  inc: boolean; rcl: boolean; tf?: boolean; rank?: number | null; notes: string | null
}

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
  agentClass?: string
  agentClsSource?: string
  investorType?: string
  commit: string; uncalled: string; aum: string; nav: string
  lpSizeBil?: string; lpSizeCriteria?: string
  sp: string; moodys: string; fitch: string
  agentRate: string; agentConc: string
  agentBBFmt: string; pctBBFmt: string
  fundSleeve?: string
}

export interface DocRecognition {
  document: string; format: string
  tablesIdentified: string; tableLocation: string
  headerRow: number; totalRows: number
  mappedColumns: number; unmatchedColumns: number
  headerInfo: string
  forcedTemplate?: string
}

/** Batch classification & rate save from the LP Category & Rate Assignment screen.
 * Every Manual-Input column on the Shadow BB (Shadow_BB.xlsx) is editable in the LP record
 * card, so the row mirrors that full manual-input set. Calculated columns are never sent —
 * the server/engine recomputes them. Any field left undefined is unchanged. */
export interface LpClassificationRequest {
  facilityId: number
  effectiveDate?: string   // YYYY-MM; omitted → current month
  audit?: boolean          // true → write one aggregated audit entry; omitted → silent per-row save
  rows: Array<{
    name: string
    originalName?: string
    // Identity & classification (manual)
    parent?: string
    spv?: boolean
    fundSleeve?: string       // Fund Sleeve
    investorType?: string     // Investor Type
    instVsHnw?: string        // Institutional vs HNW
    type?: string             // Back-compat alias for Institutional vs HNW
    region?: string
    ig?: boolean              // Investment Grade?
    cls?: string              // UBS LP Category
    agentCls?: string         // Agent LP Category
    agentClsSource?: string   // EXTRACTED, DERIVED, or USER_EDITED
    sp?: string; mdy?: string; fitch?: string
    // Scale (manual)
    aum?: string              // Assets Under Management
    nav?: string              // Net Asset Value
    pension?: string          // Pension Assets
    pensionFunded?: string    // Pension Funded %
    // Commitment / capital (manual)
    capCommit?: string
    uc?: string               // Uncalled Capital
    // Rates & limits (manual)
    ubsAdvRatePct?: number    // UBS Advance Rate, percent e.g. 90
    agentRatePct?: number     // Agent Advance Rate, percent e.g. 75
    ubsConcLimitPct?: number  // UBS Concentration Limit, percent e.g. 7.5
    agentConcLimitPct?: number// Agent Concentration Limit, percent e.g. 12
    // Status (manual)
    inc?: boolean
    tf?: boolean
    notes?: string
  }>
}

export interface LpRate {
  lpId: number
  lpName: string
  classification: string
  ubsAdvRatePct: number    // decimal fraction e.g. 0.9 = 90%
  ubsConcLimitPct: number  // decimal fraction e.g. 0.075 = 7.5%
  effectiveDate: string    // ISO date YYYY-MM-DD
}

// ── BB Template Registry ──────────────────────────────────────────────────────
export interface BbTemplateGroup {
  id: number; groupSort: number; headerText: string; classification: string
}
export interface TemplateLegendRule { style: string; meaning: string }
export interface BbTemplateTab {
  id: number; tabRole: string; tabSort: number
  sheetName: string | null; sleeveName: string | null
  headerRowIndex: number | null; headerRowSpan: number
  skipRowKeywords: string[]; columns: string[]; groups: BbTemplateGroup[]
}
export interface BbTemplate {
  id: number; templateSlug: string | null; templateName: string; agentName: string | null
  templateClass: string
  sheetName: string | null; headerRowIndex: number | null
  autoLearned: boolean; trancheCount: number
  hasGroupingRows: boolean; hasColorFlags: boolean; autoDiscoverTabs: boolean
  summaryRowsAboveHeader: number; summaryRowRange: string | null
  titleRow: number | null; titleText: string | null
  detectKeys: string[]; legend: TemplateLegendRule[]; notes: string[]
  createdAt: string; updatedAt: string
  tabs: BbTemplateTab[]
}
export interface BbTemplateGroupInput { groupSort: number; headerText: string; classification: string }
export interface BbTemplateTabInput {
  tabRole: string; tabSort: number
  sheetName: string | null; sleeveName: string | null
  headerRowIndex: number | null; headerRowSpan: number
  skipRowKeywords: string[]; columns: string[]; groups: BbTemplateGroupInput[]
}
export interface BbTemplateInput {
  templateSlug: string | null; templateName: string; agentName: string | null
  templateClass: string; sheetName: string | null
  headerRowIndex: number | null; autoLearned: boolean; trancheCount: number
  hasGroupingRows: boolean; hasColorFlags: boolean; autoDiscoverTabs: boolean
  summaryRowsAboveHeader: number; summaryRowRange: string | null
  titleRow: number | null; titleText: string | null
  detectKeys: string[]; legend: TemplateLegendRule[]; notes: string[]
  tabs: BbTemplateTabInput[]
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
  matchDetails?: MatchAnalysis | null
}

export interface MatchingThresholds {
  autoAccept: number; reviewQueue: number; noMatch: number
  jwWeight: number; levWeight: number
  stripSuffixes: boolean; caseFold: boolean; punctuation: boolean; abbrevExpand: boolean
  retirementNormalize?: boolean
}
export interface LegalSuffix       { abbr: string; full: string; strip: boolean }
export interface KnownAbbreviation { token: string; expansion: string }
export interface MatchingConfig {
  thresholds:         MatchingThresholds
  legalSuffixes:      LegalSuffix[]
  knownAbbreviations: KnownAbbreviation[]
  abbrevRegexMap?:    Record<string, string>
}

export interface RateTier {
  cls: string
  rate: number
}
export interface EligRule {
  id: string
  rule: string
  value: string | number
  unit?: '%' | '$'
  active: boolean
}
export interface ConcLimit {
  label: string
  value: number
  basis: string
}
export interface GlobalSetting {
  id: string
  label: string
  value: string | number
}
export interface EligibilityConfig {
  BUSA_TIERS: RateTier[]
  AGENT_TIERS: RateTier[]
  AGENT_RATE_PARAMS: Array<{ label: string; value: string | number; agency?: 'sp' | 'mdy' | 'fitch' }>
  ELIG_RULES: EligRule[]
  CONC_LIMITS: ConcLimit[]
  /** Per-LP default concentration limit (% of total uncalled) by LP classification.
   *  Optional: absent on DBs without the cls_conc_limit_defaults config key. */
  CLS_CONC_LIMIT_DEFAULTS?: Record<string, number>
  /** Accepted min/max concentration-limit range (%) per LP classification, used to warn
   *  when an analyst enters a limit outside the norm. Optional: absent on DBs without the
   *  cls_conc_limit_bounds config key. */
  CLS_CONC_LIMIT_BOUNDS?: Record<string, { min: number; max: number }>
  GLOBAL_SETTINGS: GlobalSetting[]
}
export interface ClassificationConfig {
  CLS_OPTS: string[]
  AGENT_CLS_OPTS: string[]
  UBS_CLS_OPTS: string[]
  UBS_CLS_DEFAULT_RATE: Record<string, string>
  AGENT_RATE_UBS_TIERS: Array<{ min: number; cls: string }>
  AGENT_CLS_UBS_MAP: Record<string, string>
  LP_SIZE_CRITERIA_OPTS: string[]
  REGION_OPTS: string[]
  TYPE_OPTS: string[]
  SP_RATING_OPTS: string[]
  MDY_RATING_OPTS: string[]
  FITCH_RATING_OPTS: string[]
  BUSA_RATE_MAP: Record<string, string>
  AGENT_RATE_MAP: Record<string, string>
  CLS_TAG_MAP: Record<string, string>
  CLS_CRITERIA: Record<string, string>
  INVESTOR_TYPE_OPTS: string[]
  LP_CATEGORY_LABEL: Record<string, string>
}
export interface WizardConfig {
  WIZARD_STEPS: string[]
  SNAPSHOT_OPTIONS: string[]
  CALC_MODES: Array<{ id: string; title: string; desc: string; recommended: boolean }>
}
export interface AuditConfig {
  EVENT_TYPES: string[]
  EVENT_TYPE_VARIANT: Record<string, string>
  AUDIT_RETENTION_LABEL: string
  DEFAULT_DATE_FROM: string
  DEFAULT_DATE_TO: string
}
export interface ReportConfig {
  REPORT_TABS: Array<{ id: string; label: string }>
  CONCENTRATION_TESTS: string[]
  REPORT_SCHEDULES: Array<{ name: string; freq: string; next: string }>
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
    update: (id: number, body: { name?: string; agentBank?: string; accountNumber?: string | null; loanAmount?: number | null; maturityDate?: string | null; collateralDate?: string | null; facilitySize?: number | null; ubsParticipation?: number | null }) =>
      patch<Facility>(`/api/facilities/${id}`, body),
    remove: (id: number) =>
      del(`/api/facilities/${id}`),
  },

  // ── LPs ─────────────────────────────────────────────────────────────────────
  lpRecords: {
    list: (params: { facilityId?: number; cls?: string; search?: string } = {}) =>
      get<ApiLP[]>(`/api/lpRecords${qs(params)}`).then(rows => rows.map(normalizeLP)),
    get: (id: number) =>
      get<ApiLP>(`/api/lpRecords/${id}`).then(normalizeLP),
    update: (id: number, data: Partial<LPRecord>) =>
      patch<ApiLP>(`/api/lpRecords/${id}`, data).then(normalizeLP),
    // Batch-save the classification & rate edits from the Shadow BB screen onto persisted
    // LP Master records. Rows are matched to existing records by (facilityId, name).
    saveClassification: (body: LpClassificationRequest) =>
      patch<{ updated: number }>('/api/lpRecords/classification', body),
    lookup: (name: string) =>
      get<ApiLP[]>(`/api/lpRecords/lookup${qs({ name })}`).then(rows => rows.map(normalizeLP)),
    rates: (effectiveDate?: string) =>
      get<LpRate[]>(`/api/lpRecords/rates${qs({ effective_date: effectiveDate })}`),
  },

  // ── LP Master (bank-wide) ────────────────────────────────────────────────────
  lpMaster: {
    list: () => get<ApiLP[]>('/api/lp-master').then(rows => rows.map(normalizeLP)),
    get: (id: number) => get<ApiLP>(`/api/lp-master/${id}`).then(normalizeLP),
    count: () => get<{ count: number }>('/api/lp-master/count'),
    investorTypes: () => get<string[]>('/api/lp-master/investor-types'),
  },

  // ── Borrowing Base ───────────────────────────────────────────────────────────
  bb: {
    run: (facilityId: number, lps?: CommitLpRow[]) =>
      post<BBSnapshot>(`/api/bb/run/${facilityId}`, lps ? { lps } : undefined),
    snapshots: (facilityId: number) =>
      get<BBSnapshot[]>(`/api/bb/snapshots/${facilityId}`),
    latestSnapshot: (facilityId: number) =>
      getOrNull<BBSnapshot>(`/api/bb/snapshots/${facilityId}/latest`),
    summaryExt: (facilityId: number) =>
      get<BBSummaryExt>(`/api/bb/summary-ext/${facilityId}`),
  },

  // ── Reports ──────────────────────────────────────────────────────────────────
  reports: {
    collateral: (facilityId: number, snapshotId?: number) =>
      get<CollateralReport>(`/api/reports/collateral/${facilityId}${qs({ snapshotId })}`),
    concentration: (facilityId: number) =>
      get<{ breaches: BBResult['breaches'] }>(`/api/reports/concentration/${facilityId}`),
    ear: (facilityId: number) =>
      get<EARDataPoint[]>(`/api/reports/ear/${facilityId}`),
    agentBanks: () =>
      get<AgentBankExposureRow[]>('/api/reports/agent-banks'),
    history: () =>
      get<ReportHistoryEntry[]>('/api/reports/history'),
    recordHistory: (body: RecordReportRequest) =>
      post<ReportHistoryEntry>('/api/reports/history', body),
  },

  // ── Submissions ───────────────────────────────────────────────────────────────
  submissions: {
    list: (params: { facilityId?: number } = {}) =>
      get<Submission[]>(`/api/submissions${qs(params)}`),
    get: (id: number) =>
      get<Submission>(`/api/submissions/${id}`),
    create: (facilityId: number, agentBank: string, periodMonth: string, file: File, notes?: string, forceTemplate?: string) => {
      const form = new FormData()
      form.append('facilityId', String(facilityId))
      form.append('agentBank', agentBank)
      form.append('periodMonth', periodMonth)
      form.append('file', file)
      if (notes?.trim()) form.append('notes', notes.trim())
      if (forceTemplate?.trim()) form.append('forceTemplate', forceTemplate.trim())
      return postForm<Submission>('/api/submissions', form)
    },
    abort: (id: number) =>
      post<void>(`/api/submissions/${id}/abort`, {}),
    confirm: (id: number) =>
      post<{ templateSaved: boolean; templateName: string }>(`/api/submissions/${id}/confirm`, {}),
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
    discardRow: (submissionId: number, rowId: number) =>
      del(`/api/submissions/${submissionId}/extracted-lps/${rowId}`),
    remap: (submissionId: number, extractedHeader: string, canonical: string) =>
      post<void>(`/api/submissions/${submissionId}/remap`, { extractedHeader, canonical }),
    reextract: (submissionId: number, templateName?: string) =>
      post<void>(
        `/api/submissions/${submissionId}/reextract`,
        templateName?.trim() ? { templateName: templateName.trim() } : {},
      ),
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
    discard: (id: number) =>
      del(`/api/matching/queue/${id}`),
    getThresholds: () =>
      get<MatchingConfig>('/api/config/matching'),
    setThresholds: (t: MatchingConfig) =>
      put<MatchingConfig>('/api/config/matching?section=thresholds', t),
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

  // ── BB Template Registry ──────────────────────────────────────────────────────
  bbTemplates: {
    list: () =>
      get<BbTemplate[]>('/api/bb-templates'),
    get: (id: number) =>
      get<BbTemplate>(`/api/bb-templates/${id}`),
    create: (body: BbTemplateInput) =>
      post<BbTemplate>('/api/bb-templates', body),
    update: (id: number, body: BbTemplateInput) =>
      put<BbTemplate>(`/api/bb-templates/${id}`, body),
    remove: (id: number) =>
      del(`/api/bb-templates/${id}`),
    import: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return postForm<BbTemplate>('/api/bb-templates/import', form)
    },
  },

  // ── Config ────────────────────────────────────────────────────────────────────
  config: {
    classification: () =>
      get<ClassificationConfig>('/api/config/classification'),
    eligibility: () =>
      get<EligibilityConfig>('/api/config/eligibility'),
    setEligibility: (section: string, data: unknown) =>
      put<unknown>(`/api/config/eligibility?section=${encodeURIComponent(section)}`, data),
    wizard: () =>
      get<WizardConfig>('/api/config/wizard'),
    audit: () =>
      get<AuditConfig>('/api/config/audit'),
    matching: () =>
      get<MatchingConfig>('/api/config/matching'),
    setMatching: (data: MatchingConfig, section: string) =>
      put<MatchingConfig>(`/api/config/matching?section=${encodeURIComponent(section)}`, data),
    reports: () =>
      get<ReportConfig>('/api/config/reports'),
  },
}
