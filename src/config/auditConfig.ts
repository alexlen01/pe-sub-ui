// Audit trail filter options and event-type display mapping.

export const EVENT_TYPES = [
  '',
  'LP Reclassified',
  'BB Recalculated',
  'Upload',
  'Export',
  'Config Change',
  'Login',
] as const

export type EventType = typeof EVENT_TYPES[number]

// Maps event type string to Tag variant
export const EVENT_TYPE_VARIANT: Record<string, string> = {
  'LP Reclassified': 'amber',
  'BB Recalculated': 'active',
  'Upload':          'active',
  'Export':          '',
  'Config Change':   'amber',
  'Login':           '',
}

export const AUDIT_RETENTION_LABEL = '7 years'

export const DEFAULT_DATE_FROM = '2026-05-01'
export const DEFAULT_DATE_TO   = '2026-05-27'
