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
export const getClassificationConfig = (): Promise<ClassificationConfig> => api.config.classification()
export const getMatchingConfig = (): Promise<MatchingConfig> => api.config.matching()

export function ubsClassFromAgentRate(
  cfg: ClassificationConfig,
  agentRatePct: number | '' | undefined,
): string {
  if (typeof agentRatePct !== 'number') return ''
  if (agentRatePct <= 0) return 'Excluded'
  const tiers = [...cfg.AGENT_RATE_UBS_TIERS].sort((a, b) => b.min - a.min)
  return tiers.find(t => agentRatePct >= t.min)?.cls ?? 'Other Institutional'
}

export function ubsClassFromAgentCls(
  cfg: ClassificationConfig,
  agentCls: string | undefined,
): string {
  if (!agentCls) return ''
  return cfg.AGENT_CLS_UBS_MAP[agentCls] ?? ''
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
