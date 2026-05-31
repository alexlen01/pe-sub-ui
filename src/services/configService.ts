import { EVENT_TYPES, EVENT_TYPE_VARIANT, AUDIT_RETENTION_LABEL, DEFAULT_DATE_FROM, DEFAULT_DATE_TO } from '../config/auditConfig'
import { WIZARD_STEPS, SNAPSHOT_OPTIONS, CALC_MODES } from '../config/wizardConfig'
import { BUSA_TIERS, AGENT_TIERS, AGENT_RATE_PARAMS, ELIG_RULES, CONC_LIMITS, GLOBAL_SETTINGS } from '../config/eligibilityConfig'
import { REPORT_TABS, REPORT_SCHEDULES, CONCENTRATION_TESTS } from '../config/reportConfig'
import { api } from './api'

export async function getAuditConfig() {
  try { return (await api.config.audit()) as typeof _localAuditCfg }
  catch { return _localAuditCfg }
}
const _localAuditCfg = { EVENT_TYPES, EVENT_TYPE_VARIANT, AUDIT_RETENTION_LABEL, DEFAULT_DATE_FROM, DEFAULT_DATE_TO }

export function getWizardSteps() { return WIZARD_STEPS }

export async function getWizardConfig() {
  try { return (await api.config.wizard()) as typeof _localWizardCfg }
  catch { return _localWizardCfg }
}
const _localWizardCfg = { WIZARD_STEPS, SNAPSHOT_OPTIONS, CALC_MODES }

export async function getEligibilityConfig() {
  try { return (await api.config.eligibility()) as typeof _localEligCfg }
  catch { return _localEligCfg }
}
const _localEligCfg = { BUSA_TIERS, AGENT_TIERS, AGENT_RATE_PARAMS, ELIG_RULES, CONC_LIMITS, GLOBAL_SETTINGS }

export async function getReportConfig() {
  try { return (await api.config.reports()) as typeof _localRptCfg }
  catch { return _localRptCfg }
}
const _localRptCfg = { REPORT_TABS, REPORT_SCHEDULES, CONCENTRATION_TESTS }
