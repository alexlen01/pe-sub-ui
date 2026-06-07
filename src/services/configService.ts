import { EVENT_TYPES, EVENT_TYPE_VARIANT, AUDIT_RETENTION_LABEL, DEFAULT_DATE_FROM, DEFAULT_DATE_TO } from '../config/auditConfig'
import { WIZARD_STEPS, SNAPSHOT_OPTIONS, CALC_MODES } from '../config/wizardConfig'
import { BUSA_TIERS, AGENT_TIERS, AGENT_RATE_PARAMS, ELIG_RULES, CONC_LIMITS, GLOBAL_SETTINGS } from '../config/eligibilityConfig'
import { REPORT_TABS, REPORT_SCHEDULES, CONCENTRATION_TESTS } from '../config/reportConfig'
import { api } from './api'

const _localAuditCfg = { EVENT_TYPES, EVENT_TYPE_VARIANT, AUDIT_RETENTION_LABEL, DEFAULT_DATE_FROM, DEFAULT_DATE_TO }

export async function getAuditConfig(live: boolean) {
  if (!live) return _localAuditCfg
  return (await api.config.audit()) as typeof _localAuditCfg
}

export function getWizardSteps() { return WIZARD_STEPS }

const _localWizardCfg = { WIZARD_STEPS, SNAPSHOT_OPTIONS, CALC_MODES }

export async function getWizardConfig(live: boolean) {
  if (!live) return _localWizardCfg
  return (await api.config.wizard()) as typeof _localWizardCfg
}

const _localEligCfg = { BUSA_TIERS, AGENT_TIERS, AGENT_RATE_PARAMS, ELIG_RULES, CONC_LIMITS, GLOBAL_SETTINGS }

export async function getEligibilityConfig(live: boolean): Promise<typeof _localEligCfg> {
  if (!live) return _localEligCfg
  return (await api.config.eligibility()) as typeof _localEligCfg
}

const _localRptCfg = { REPORT_TABS, REPORT_SCHEDULES, CONCENTRATION_TESTS }

export async function getReportConfig(live: boolean) {
  if (!live) return _localRptCfg
  return (await api.config.reports()) as typeof _localRptCfg
}
