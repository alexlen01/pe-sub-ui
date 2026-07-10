import { api } from './api'
import type {
  AuditConfig,
  BbCriteriaClass,
  BbCriteriaMatrix,
  BbCriteriaRatedBand,
  ClassificationConfig,
  EligibilityConfig,
  MatchingConfig,
  ReportConfig,
  WizardConfig,
} from './api'

export type {
  AuditConfig,
  ClassificationConfig,
  EligibilityConfig,
  MatchingConfig,
  ReportConfig,
  WizardConfig,
  RateTier,
  EligRule,
  ConcLimit,
  GlobalSetting,
  BbCriteriaMatrix,
  BbCriteriaRatedBand,
  BbCriteriaClass,
} from './api'

export const getAuditConfig = (): Promise<AuditConfig> => api.config.audit()
export const getWizardConfig = (): Promise<WizardConfig> => api.config.wizard()
export const getWizardSteps = async (): Promise<string[]> => (await getWizardConfig()).WIZARD_STEPS
export const getEligibilityConfig = (): Promise<EligibilityConfig> => api.config.eligibility()
export const getReportConfig = (): Promise<ReportConfig> => api.config.reports()
export const getClassificationConfig = async (): Promise<ClassificationConfig> => {
  const [cfg, masterInvestorTypes] = await Promise.all([
    api.config.classification(),
    api.lpMaster.investorTypes().catch(() => [] as string[]),
  ])
  const investorTypeOpts = mergeOptions(cfg.INVESTOR_TYPE_OPTS, masterInvestorTypes)
  return {
    ...cfg,
    INVESTOR_TYPE_OPTS: investorTypeOpts,
  }
}
export const getMatchingConfig = (): Promise<MatchingConfig> => api.config.matching()

export function ubsClassFromAgentRate(
  cfg: ClassificationConfig,
  agentRatePct: number | '' | undefined,
): string {
  if (typeof agentRatePct !== 'number') return ''
  const tiers = [...cfg.AGENT_RATE_UBS_TIERS].sort((a, b) => b.min - a.min)
  return tiers.find(t => agentRatePct >= t.min)?.cls ?? ''
}

export function ubsClassFromAgentCls(
  cfg: ClassificationConfig,
  agentCls: string | undefined,
): string {
  if (!agentCls) return ''
  return cfg.AGENT_CLS_UBS_MAP[agentCls] ?? ''
}

const normalizeDashes = (value: string): string => value.replace(/[\u2010-\u2015]/g, '-')

/** BUSA advance rate (percent, e.g. 90) for a classification from either taxonomy,
 *  matching keys dash-insensitively across BUSA_RATE_MAP and UBS_CLS_DEFAULT_RATE. */
export function busaRatePctForCls(cfg: ClassificationConfig, cls: string | undefined): number | '' {
  if (!cls) return ''
  const wanted = normalizeDashes(cls)
  for (const map of [cfg.BUSA_RATE_MAP, cfg.UBS_CLS_DEFAULT_RATE]) {
    for (const [key, raw] of Object.entries(map)) {
      if (normalizeDashes(key) !== wanted) continue
      const n = parseFloat(String(raw).replace('%', '').trim())
      if (!Number.isFinite(n)) continue
      return n > 1 ? n : n * 100
    }
  }
  return ''
}

/** Class-default per-LP concentration limit (percent of total uncalled capital)
 *  from eligibility config's CLS_CONC_LIMIT_DEFAULTS map (cls_conc_limit_defaults
 *  config key), matched dash-insensitively. '' when unconfigured for the class. */
export function clsConcLimitPctForCls(
  cfg: Pick<EligibilityConfig, 'CLS_CONC_LIMIT_DEFAULTS'> | null,
  cls: string | undefined,
): number | '' {
  if (!cfg?.CLS_CONC_LIMIT_DEFAULTS || !cls) return ''
  const wanted = normalizeDashes(cls)
  for (const [key, pct] of Object.entries(cfg.CLS_CONC_LIMIT_DEFAULTS)) {
    if (normalizeDashes(key) !== wanted) continue
    return typeof pct === 'number' && Number.isFinite(pct) ? pct : ''
  }
  return ''
}

/** Accepted per-LP concentration-limit range (percent) for a classification, from the
 *  CLS_CONC_LIMIT_BOUNDS map (cls_conc_limit_bounds config key), matched dash-insensitively.
 *  Returns null when unconfigured for the class or the range is malformed. Used by the LP
 *  record entry form to warn — without blocking — on out-of-range limits. */
export function clsConcLimitBoundsForCls(
  cfg: Pick<EligibilityConfig, 'CLS_CONC_LIMIT_BOUNDS'> | null,
  cls: string | undefined,
): { min: number; max: number } | null {
  if (!cfg?.CLS_CONC_LIMIT_BOUNDS || !cls) return null
  const wanted = normalizeDashes(cls)
  for (const [key, range] of Object.entries(cfg.CLS_CONC_LIMIT_BOUNDS)) {
    if (normalizeDashes(key) !== wanted) continue
    const min = Number(range?.min)
    const max = Number(range?.max)
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null
    return { min, max }
  }
  return null
}

// ── Borrowing Base Criteria resolver (mirrors the API's BbCriteriaResolver) ─────

export interface ResolvedBbCriteria { advanceRatePct: number; concLimitPct: number }

const RATED_BAND_ORDER = ['AAA', 'AA', 'A', 'BBB']

/** Resolves the Borrowing Base Criteria (advance rate % + concentration limit %) for an LP from
 *  the bb_criteria_matrix: advance rate splits on the LP's funded fraction at fundedThresholdPct;
 *  Rated Investors resolve a band via the tri-party middle-rating waterfall over S&P/Moody's/Fitch.
 *  Returns null when the matrix is absent or the classification is not in it (caller falls back to
 *  the legacy flat maps). Kept in lockstep with the API's BbCriteriaResolver. */
export function resolveBbCriteria(
  matrix: BbCriteriaMatrix | null | undefined,
  cls: string | undefined,
  ratings: { sp?: string; mdy?: string; fitch?: string },
  pctFunded: number,
): ResolvedBbCriteria | null {
  if (!matrix || !cls) return null
  const norm = normalizeDashes(cls).trim()
  const threshold = (matrix.fundedThresholdPct ?? 40) / 100
  const funded: 'lt40' | 'gte40' = pctFunded >= threshold ? 'gte40' : 'lt40'

  const rowCriteria = (row: BbCriteriaRatedBand | BbCriteriaClass): ResolvedBbCriteria => ({
    advanceRatePct: row.advanceRatePct?.[funded] ?? 0,
    concLimitPct: row.concLimitPct ?? 0,
  })

  if (norm === 'Rated Investor' || norm === 'Rated') {
    const band = resolveRatedBand(matrix, ratings)
    const row = matrix.rated?.find(r => r.band === band)
    return row ? rowCriteria(row) : null
  }
  const row = matrix.classes?.find(c => normalizeDashes(c.cls).trim() === norm)
  return row ? rowCriteria(row) : null
}

/** Tri-party "eligible rating" waterfall → band string: three ratings → middle (median), two → the
 *  lower (conservative), one → that rating. A present rating matching no band clamps to the sub-IG
 *  floor (BBB). No rating at all → the sub-IG floor. */
function resolveRatedBand(matrix: BbCriteriaMatrix, ratings: { sp?: string; mdy?: string; fitch?: string }): string {
  const bands = matrix.ratingBands ?? {}
  const subIG = matrix.subInvestmentGradeBand ?? 'BBB'
  const subIGIndex = RATED_BAND_ORDER.indexOf(subIG) >= 0 ? RATED_BAND_ORDER.indexOf(subIG) : RATED_BAND_ORDER.length - 1

  const ordinalOf = (agency: 'sp' | 'moodys' | 'fitch', value?: string): number => {
    const v = (value ?? '').trim()
    if (!v || v.toUpperCase() === 'NR' || v === 'N/A') return -1
    for (let i = 0; i < RATED_BAND_ORDER.length; i++) {
      if ((bands[RATED_BAND_ORDER[i]]?.[agency] ?? []).includes(v)) return i
    }
    return subIGIndex   // present but unmatched → sub-investment-grade floor
  }

  const ords = [ordinalOf('sp', ratings.sp), ordinalOf('moodys', ratings.mdy), ordinalOf('fitch', ratings.fitch)]
    .filter(o => o >= 0)
    .sort((a, b) => a - b)   // ascending = best → worst
  if (ords.length === 0) return subIG
  const chosen = ords.length >= 3
    ? ords[Math.floor((ords.length - 1) / 2)]   // median (3 → index 1)
    : ords.length === 2
      ? ords[ords.length - 1]                   // lower rating = higher ordinal
      : ords[0]
  return RATED_BAND_ORDER[Math.min(chosen, RATED_BAND_ORDER.length - 1)]
}

function mergeOptions(...groups: string[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  seen.add('')
  for (const group of groups) {
    for (const raw of group) {
      const value = String(raw ?? '').trim()
      const key = value.toLowerCase()
      if (!value || seen.has(key)) continue
      out.push(value)
      seen.add(key)
    }
  }
  return ['', ...out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))]
}

export function parseRatePct(raw: string | undefined | null): number {
  if (!raw) return NaN
  const n = parseFloat(String(raw).replace('%', '').trim())
  if (!Number.isFinite(n)) return NaN
  return n > 1 ? n / 100 : n
}

export function buildBusaRateFractions(cfg: ClassificationConfig): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [cls, pct] of Object.entries(cfg.BUSA_RATE_MAP)) {
    const rate = parseRatePct(pct)
    if (Number.isFinite(rate)) out[cls] = rate
  }
  for (const [cls, pct] of Object.entries(cfg.UBS_CLS_DEFAULT_RATE)) {
    const rate = parseRatePct(pct)
    if (Number.isFinite(rate)) out[cls] = rate
  }
  return out
}

export function busaClassificationOptions(cfg: Pick<ClassificationConfig, 'BUSA_RATE_MAP'>): string[] {
  return ['', ...Object.keys(cfg.BUSA_RATE_MAP).filter(Boolean)]
}
