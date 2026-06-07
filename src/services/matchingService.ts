import { MATCH_QUEUE, SUBMISSION_SUMMARY } from '../data/matchQueueData'
import { DEFAULT_THRESHOLDS, LEGAL_SUFFIXES, KNOWN_ABBREVIATIONS, ABBREV_REGEX_MAP } from '../config/matchingConfig'
import { api } from './api'

export async function getMatchQueue(live: boolean, submissionId: number) {
  if (!live) return MATCH_QUEUE
  const items = await api.matching.queue(submissionId)
  return items.map(item => ({
    ...item,
    facility:     item.facilityName ?? '—',
    agentParent:  '',
    masterParent: '',
  }))
}

export async function getMatchThresholds(live: boolean) {
  if (!live) return DEFAULT_THRESHOLDS
  const d = await api.matching.getThresholds()
  return d
}

export function getLegalSuffixes()      { return LEGAL_SUFFIXES }
export function getKnownAbbreviations() { return KNOWN_ABBREVIATIONS }
export function getAbbrevRegexMap()     { return ABBREV_REGEX_MAP }
export function getSubmissionSummary()  { return SUBMISSION_SUMMARY }
