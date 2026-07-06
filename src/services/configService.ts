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
  const cfg = await api.config.classification()
  return {
    ...cfg,
    INVESTOR_TYPE_OPTS: cfg.INVESTOR_TYPE_OPTS[0] === ''
      ? cfg.INVESTOR_TYPE_OPTS
      : ['', ...cfg.INVESTOR_TYPE_OPTS],
  }
}
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

export function agentClassFromInvestorProfile(input: ClassificationRuleInput): string {
  const investorType = normalizeText(input.investorType)
  const notes = normalizeText(input.notes)
  if (input.spv || HARD_EXCLUSION.test(`${investorType} ${notes}`)) return 'Ineligible Investors'

  if (hasInvestmentGradeRating(input)) return 'Rated Included'

  if (/family office|hnw|high net worth/.test(investorType)) return 'Ineligible Investors'
  if (/institutional|endowment|foundation|insurance|sovereign|pension|corporate|healthcare|fund of funds|fof/.test(investorType)) {
    return 'Non-Rated Included'
  }

  return ''
}

export function investorTypeFromAgentClass(agentCls: string | undefined): string {
  const value = normalizeText(agentCls)
  if (/pension/.test(value)) return 'Pension Fund'
  if (/endowment/.test(value)) return 'Endowment'
  if (/foundation/.test(value)) return 'Foundation'
  if (/family office/.test(value)) return 'Family Office'
  if (/sovereign/.test(value)) return 'Sovereign Wealth Fund'
  if (/fund of funds|fof/.test(value)) return 'Fund of Funds'
  if (/insurance/.test(value)) return 'Insurance Company'
  if (/healthcare/.test(value)) return 'Healthcare'
  if (/corporate/.test(value)) return 'Corporate'
  if (/\bhnw\b|high net worth/.test(value)) return 'HNW'
  return ''
}

export interface ClassificationRuleInput {
  investorType?: string
  sp?: string
  mdy?: string
  fitch?: string
  lpSizeBil?: string
  lpSizeCriteria?: string
  notes?: string
  spv?: boolean
}

const HARD_EXCLUSION = /\b(sanction|bad actor|kyc|erisa|side letter|non[-\s]?cooperative|ineligible|excluded|gp sleeve|sponsor affiliate|affiliate)\b/i

export function ubsClassFromInvestorProfile(
  _cfg: ClassificationConfig,
  input: ClassificationRuleInput,
): string {
  const investorType = normalizeText(input.investorType)
  const notes = normalizeText(input.notes)
  if (input.spv || HARD_EXCLUSION.test(`${investorType} ${notes}`)) return 'Excluded'

  if (hasInvestmentGradeRating(input)) return 'Rated Investor'

  const sizeM = parseProfileMoneyM(input.lpSizeBil)
  const sizeCriteria = normalizeText(input.lpSizeCriteria)

  if (/family office|hnw|high net worth/.test(investorType)) return 'Excluded'
  if (/fund of funds|fof/.test(investorType) && sizeM >= 10_000) return 'FoF & Other > $10Bn AUM'
  if (/pension|public pension/.test(investorType) && sizeM >= 5_000 && /asset|aum|nav|pension/.test(sizeCriteria)) {
    return 'Corp Pension > $5Bn Assets'
  }
  if (/institutional|endowment|foundation|insurance|sovereign|pension|corporate|healthcare/.test(investorType)) {
    if (/nav/.test(sizeCriteria) && sizeM >= 1_000) return 'Unrated NAV > $1Bn'
    return 'Other Institutional'
  }

  return ''
}

function normalizeText(value: string | undefined | null): string {
  return String(value ?? '').trim().toLowerCase()
}

function hasInvestmentGradeRating(input: ClassificationRuleInput): boolean {
  return isSpInvestmentGrade(input.sp) || isMoodysInvestmentGrade(input.mdy) || isSpInvestmentGrade(input.fitch)
}

function isSpInvestmentGrade(raw: string | undefined): boolean {
  const rating = String(raw ?? '').trim().toUpperCase()
  if (!rating || rating === 'NR' || rating === 'N/R') return false
  const order = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-']
  return order.includes(rating)
}

function isMoodysInvestmentGrade(raw: string | undefined): boolean {
  const rating = String(raw ?? '').trim().toUpperCase()
  if (!rating || rating === 'NR' || rating === 'N/R') return false
  const order = ['AAA', 'AA1', 'AA2', 'AA3', 'A1', 'A2', 'A3', 'BAA1', 'BAA2', 'BAA3']
  return order.includes(rating)
}

function parseProfileMoneyM(raw: string | undefined | null): number {
  const s = String(raw ?? '').trim()
  if (!s) return 0
  const m = s.match(/([\d,.]+)\s*([KMBT])?/i)
  if (!m) return 0
  let value = Number(m[1].replace(/,/g, ''))
  if (!Number.isFinite(value)) return 0
  const unit = (m[2] || '').toUpperCase()
  if (unit === 'T') value *= 1_000_000
  else if (unit === 'B') value *= 1_000
  else if (unit === 'K') value /= 1_000
  else if (!unit && (s.includes('$') || value >= 100_000)) value /= 1_000_000
  return value
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
