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

/** /api/lpRecords and /api/lp-master both serve LpRecordDto/LpMasterDto keys one-for-one, so an
 *  API row is an LPRecord with the descriptive string fields possibly absent on older rows. */
type ApiLP = Omit<LPRecord, 'investorType' | 'institutionalOrHnw' | 'regionLocation'> & {
  investorType?: string
  institutionalOrHnw?: string
  regionLocation?: string
}

/** Boundary coercion: pin the three free-text descriptors to '' when the row omits them, so
 *  screens can compare/sort them without null guards. No key aliasing — the API is camelCase. */
function normalizeLP(row: ApiLP): LPRecord {
  return {
    ...row,
    investorType: row.investorType ?? '',
    institutionalOrHnw: (row.institutionalOrHnw ?? '') as LPRecord['institutionalOrHnw'],
    regionLocation: row.regionLocation ?? '',
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

async function getBlob(path: string): Promise<Blob> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.blob()
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
  totalCapCommit: number; totalCalledCap: number; pctLpCalled: number
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
  ubsLpCategory: string; count: number; uncalledM: number; ubbM: number
  /** Fraction (0.90 = 90%), like the API's BigDecimal — formatted by the consumer. */
  ubsAdvanceRate: number
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
  investorName: string; parent: string | null; spv: boolean; highQuality: boolean
  investorType?: string | null
  institutionalOrHnw: string; regionLocation: string; investmentGrade: boolean; ubsLpCategory: string
  agentLpCategory?: string | null
  agentLpCategorySource?: string | null
  spRating: string; moodysRating: string; fitchRating: string
  aum: string | null; nav: string | null; pensionAssets: string | null
  capitalCommitment: string | null; calledCapital: string | null
  uncalledCapital: string | null
  agentConcentrationLimit: string | null; ubsConcentrationLimit: string | null
  // Fractions (0.90 = 90%), matching the server's BigDecimal columns.
  fundingRatio: number | null
  pctOfFundCommitments: number | null; pctOfFundUncalled: number | null; pctLpCalled: number | null
  ubsAdvanceRate: number | null; agentAdvanceRate: number | null
  // Engine outputs (borrowing bases, excess concentrations, rank) are computed and persisted
  // server-side at run time — they are deliberately not part of the commit payload.
  included: boolean; reclassified: boolean; transferee?: boolean; notes: string | null
}

export interface Submission {
  id: number; facilityId: number; facilityName: string; agentBank: string; periodMonth: string
  status: string; fileName: string; uploadedBy: number | null; notes: string | null
  wizardStep: number; shadowBbOverrides: Record<string, unknown> | null
  // Optimistic-concurrency token — pass back on commit writes so a stale edit is rejected (409).
  version: number
  // Ownership captured at upload: the analyst who uploaded/owns the submission.
  ownerUuName: string | null; ownerName: string | null
  // Independent-review (maker-checker) attribution. submittedBy = operator who submitted for
  // review (maker); reviewedBy = manager who accepted/rejected (checker); reviewNote = reason.
  submittedBy: string | null; reviewedBy: string | null; reviewNote: string | null
  createdAt: string; updatedAt: string
}

export interface ExtractedLP {
  id: number; submissionId: number; rawName: string; masterName: string | null
  confidence: number; fields: Record<string, unknown>
}

export interface AgentExtractedRow {
  id: number; name: string
  agentClass?: string
  agentLpCategorySource?: string
  investorType?: string
  commit: string; uncalled: string; aum: string; nav: string
  lpSizeBil?: string; lpSizeCriteria?: string
  spRating: string; moodys: string; fitchRating: string
  agentAdvanceRate: string; agentConc: string
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
    id?: number
    investorName: string
    originalName?: string
    // Identity & classification (manual)
    parent?: string
    spv?: boolean
    investorType?: string            // Investor Type
    institutionalOrHnw?: string      // Institutional vs HNW
    regionLocation?: string
    investmentGrade?: boolean
    ubsLpCategory?: string           // UBS LP Category
    agentLpCategory?: string         // Agent LP Category
    agentLpCategorySource?: string   // EXTRACTED, DERIVED, or USER_EDITED
    spRating?: string; moodysRating?: string; fitchRating?: string
    // Scale (manual)
    aum?: string              // Assets Under Management
    nav?: string              // Net Asset Value
    pensionAssets?: string
    fundingRatio?: number     // Pension funded status as a fraction (0.91 = 91%)
    // Commitment / capital (manual)
    capitalCommitment?: string
    uncalledCapital?: string
    // Rates & limits (manual) — percent-scaled here, unlike the fractions elsewhere on LPRecord;
    // the Pct suffix marks that difference, matching the server record.
    ubsAdvanceRatePct?: number       // UBS Advance Rate, percent e.g. 90
    agentAdvanceRatePct?: number     // Agent Advance Rate, percent e.g. 75
    ubsConcentrationLimitPct?: number    // UBS Concentration Limit, percent e.g. 7.5
    agentConcentrationLimitPct?: number  // Agent Concentration Limit, percent e.g. 12
    // Status (manual)
    included?: boolean
    transferee?: boolean
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
  /** LP Master id of the proposed match — always the matched child/feeder, never its parent. */
  masterLpId: number | null
  /** Sponsor named by the agent document, used for the Parent/Sponsor corroboration signal. */
  agentParent: string | null
  /** Ultimate entity the match routes to — whose profile an Accept applies. Null means "self". */
  masterParent: string | null
  score: number; decision: string | null; status?: string; isNew: boolean; reasons?: string[]
  matchDetails?: MatchAnalysis | null
}

/**
 * A bank-wide LP Master profile — the curated subset that supplies ratings, category and default
 * rates to a matched facility record. Deliberately its own type rather than an `LPRecord`: an
 * LP Master row has no facility, no commitment/uncalled figures and no borrowing base, but it does
 * carry the parent/child hierarchy those records resolve through.
 */
export interface LpMasterRecord {
  id: number
  investorName: string
  /** Sponsor name as displayed. May be set with no `parentId` when the sponsor is not yet on file. */
  parent: string
  parentId: number | null
  isUltimateParent: boolean
  /** Top of the parent chain, or null when this record is itself the ultimate entity. */
  ultimateParent: string | null
  childCount: number
  spv: boolean
  highQuality: boolean
  investorType: string
  institutionalOrHnw: string
  regionLocation: string
  investmentGrade: boolean
  ubsLpCategory: string
  spRating: string
  moodysRating: string
  fitchRating: string
  aum: string
  nav: string
  pensionAssets: string
  fundingRatio: number | null
  /** Fraction, not percent: 0.9 is 90%. */
  ubsDefaultAdvanceRate: number | null
  /** Percent-or-dollars display text ("7.5%", "$25,000,000"), as the per-record limits are. */
  ubsDefaultConcentrationLimit: string
  notes: string
}

/** The editable subset the LP Master panel submits. A full replace, so null clears a value. */
export type LpMasterUpdate = Omit<LpMasterRecord, 'id' | 'isUltimateParent' | 'ultimateParent' | 'childCount'>

/** API row: the same keys, with the string fields absent or null on rows that never set them. */
type ApiLpMaster = Omit<LpMasterRecord,
  'parent' | 'investorType' | 'institutionalOrHnw' | 'regionLocation' | 'ubsLpCategory'
  | 'spRating' | 'moodysRating' | 'fitchRating' | 'aum' | 'nav' | 'pensionAssets'
  | 'ubsDefaultConcentrationLimit' | 'notes'> & Partial<LpMasterRecord>

/** Boundary coercion: pin every free-text field to '' so screens sort and compare without guards. */
function normalizeLpMaster(row: ApiLpMaster): LpMasterRecord {
  return {
    ...row,
    parent:                       row.parent ?? '',
    investorType:                 row.investorType ?? '',
    institutionalOrHnw:           row.institutionalOrHnw ?? '',
    regionLocation:               row.regionLocation ?? '',
    ubsLpCategory:                row.ubsLpCategory ?? '',
    spRating:                     row.spRating ?? '',
    moodysRating:                 row.moodysRating ?? '',
    fitchRating:                  row.fitchRating ?? '',
    aum:                          row.aum ?? '',
    nav:                          row.nav ?? '',
    pensionAssets:                row.pensionAssets ?? '',
    ubsDefaultConcentrationLimit: row.ubsDefaultConcentrationLimit ?? '',
    notes:                        row.notes ?? '',
    ultimateParent:               row.ultimateParent ?? null,
  }
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

/** A rate-schedule row from the busa_tiers / agent_tiers config blobs. The blob's own key is
 *  `cls` — these are config documents, not LP records, so they keep the server's JSON key. */
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
/** Advance rate split on the LP's funded % (pctLpCalled) at the matrix threshold.
 *  Concentration limit is funded-independent. Sourced from Concentration_Limits.xlsx
 *  tabs 2-3 (bb_criteria_matrix config key). See pe-sub-docs/BB_CRITERIA_DESIGN.md. */
export interface BbCriteriaAdvanceRate { lt40: number; gte40: number }
export interface BbCriteriaRatedBand {
  band: string
  /** Human-readable agency rating range from the workbook, e.g. "AA+ / Aa1 to AA- / Aa3". */
  label?: string
  concLimitPct: number
  advanceRatePct: BbCriteriaAdvanceRate
}
export interface BbCriteriaClass {
  /** Config-blob key, kept as the server serves it (bb_criteria_matrix uses `cls`). */
  cls: string
  category?: string
  concLimitPct: number
  advanceRatePct: BbCriteriaAdvanceRate
}
export interface BbCriteriaMatrix {
  source?: string
  fundedThresholdPct: number
  /** Agency ratings that resolve to each band, for Rated Investor CL/AR lookup. */
  ratingBands?: Record<string, { sp?: string[]; moodys?: string[]; fitch?: string[] }>
  /** Tri-party eligible-rating rule: 'middle' (median of three), else see tie-break. */
  ratingBandSelection?: string
  /** Split-rating waterfall: three→middle (median), two→lower, one→as-is. */
  ratingBandTieBreak?: { three?: string; two?: string; one?: string }
  /** Band a rated LP clamps to when its rating matches no configured band (sub-IG). */
  subInvestmentGradeBand?: string
  rated: BbCriteriaRatedBand[]
  classes: BbCriteriaClass[]
}
export interface EligibilityConfig {
  BUSA_TIERS: RateTier[]
  AGENT_TIERS: RateTier[]
  CONC_LIMITS: ConcLimit[]
  /** Per-LP default concentration limit (% of total uncalled) by LP classification.
   *  Optional: absent on DBs without the cls_conc_limit_defaults config key. */
  CLS_CONC_LIMIT_DEFAULTS?: Record<string, number>
  /** Accepted min/max concentration-limit range (%) per LP classification, used to warn
   *  when an analyst enters a limit outside the norm. Optional: absent on DBs without the
   *  cls_conc_limit_bounds config key. */
  CLS_CONC_LIMIT_BOUNDS?: Record<string, { min: number; max: number }>
  /** Borrowing Base Criteria matrix (advance rate × funded split, per-class /
   *  per-rating-band concentration limit). Optional: absent on DBs before V1_4. */
  BB_CRITERIA_MATRIX?: BbCriteriaMatrix
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
export interface CurrentUser {
  uuName: string
  firstName: string
  lastName: string
  email: string
  role: string
}

// ── API client ────────────────────────────────────────────────────────────────

export const api = {

  users: {
    me: () => get<CurrentUser>('/api/users/me'),
  },

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
    // No delete wrapper: a facility is retired by setStatus(id, 'Inactive'), never removed —
    // its LP records and Shadow BB history have to stay auditable.
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
    // Hard-delete an erroneously ingested LP record; the API recomputes the facility's ranks.
    remove: (id: number) =>
      del(`/api/lpRecords/${id}`),
  },

  // ── LP Master (bank-wide) ────────────────────────────────────────────────────
  lpMaster: {
    list: () => get<ApiLpMaster[]>('/api/lp-master').then(rows => rows.map(normalizeLpMaster)),
    get: (id: number) => get<ApiLpMaster>(`/api/lp-master/${id}`).then(normalizeLpMaster),
    count: () => get<{ count: number }>('/api/lp-master/count'),
    investorTypes: () => get<string[]>('/api/lp-master/investor-types'),
    /** Direct children (feeders/SPVs) routing their credit profile to this record. */
    children: (id: number) =>
      get<ApiLpMaster[]>(`/api/lp-master/${id}/children`).then(rows => rows.map(normalizeLpMaster)),
    /** Agent BB strings previously accepted against this record. */
    aliases: (id: number) => get<string[]>(`/api/lp-master/${id}/aliases`),
    // Full replace of the editable subset (ANALYST-gated) — PUT, not PATCH, because the panel
    // always submits every field it renders, so an omitted value means cleared.
    update: (id: number, body: LpMasterUpdate) =>
      put<ApiLpMaster>(`/api/lp-master/${id}`, body).then(normalizeLpMaster),
    // Hard-delete a bank-wide LP Master row (ANALYST-gated); facility LP records are detached, not deleted.
    remove: (id: number) =>
      del(`/api/lp-master/${id}`),
  },

  // ── Borrowing Base ───────────────────────────────────────────────────────────
  bb: {
    run: (facilityId: number, lps?: CommitLpRow[]) =>
      post<BBSnapshot>(`/api/bb/run/${facilityId}`, lps ? { lps } : undefined),
    // LP Master historical bootstrap is the only direct-run exception. Once any snapshot exists,
    // subsequent re-runs must use the submission-backed Manager approval workflow.
    rerunFromLpMaster: async (facilityId: number): Promise<{ snapshot: BBSnapshot; submission: Submission | null }> => {
      const existingSnapshot = await getOrNull<BBSnapshot>(`/api/bb/snapshots/${facilityId}/latest`)
      if (existingSnapshot == null) {
        const snapshot = await post<BBSnapshot>(`/api/bb/run/${facilityId}`)
        return { snapshot, submission: null }
      }
      return api.bb.rerunForReview(facilityId)
    },
    // Re-runs launched outside the submission wizard enter maker/checker review in one server-side
    // transaction. The server creates a review item for seeded facilities that have no upload-
    // backed completed submission.
    rerunForReview: async (facilityId: number): Promise<{ snapshot: BBSnapshot; submission: Submission }> => {
      return post<{ snapshot: BBSnapshot; submission: Submission }>(
        `/api/submissions/facilities/${facilityId}/rerun-for-review`, {})
    },
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
    collateralPdf: (facilityId: number, params: Record<string, string | number | undefined>) =>
      getBlob(`/api/reports/collateral/${facilityId}/pdf${qs(params)}`),
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
    saveShadowBbState: (id: number, overrides: Record<string, unknown> | null, expectedVersion?: number) =>
      patch<Submission>(
        `/api/submissions/${id}/shadow-bb-state${expectedVersion != null ? `?expectedVersion=${expectedVersion}` : ''}`,
        { overrides }),
    // Ownership handoff: claim a colleague's in-flight submission so it can be edited. After this
    // the previous owner is read-only (their writes 403) and is notified.
    takeOver: (id: number) =>
      post<Submission>(`/api/submissions/${id}/take-over`, {}),
    // Maker step: submit the completed Shadow BB for independent (Manager) review.
    complete: (id: number, expectedVersion?: number) =>
      post<Submission>(
        `/api/submissions/${id}/complete${expectedVersion != null ? `?expectedVersion=${expectedVersion}` : ''}`, {}),
    // Checker steps (Manager-only; the API enforces maker ≠ checker).
    accept: (id: number) =>
      post<Submission>(`/api/submissions/${id}/accept`, {}),
    reject: (id: number, reason: string) =>
      post<Submission>(`/api/submissions/${id}/reject`, { reason }),
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
    decideBatch: (decisions: Array<{ id: number; decision: MatchQueueItem['decision']; masterName?: string }>) =>
      patch<MatchQueueItem[]>(`/api/matching/queue/decisions`, { decisions }),
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
      get<Array<{ ts: string; event: string; detail: string; facility: string; user: string; userDisplay?: string; ip: string }>>('/api/audit'),
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
