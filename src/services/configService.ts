import { api } from './api'
import type {
  AuditConfig,
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
