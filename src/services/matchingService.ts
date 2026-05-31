import { MATCH_QUEUE, SUBMISSION_SUMMARY } from '../data/matchQueueData'
import { DEFAULT_THRESHOLDS, LEGAL_SUFFIXES, KNOWN_ABBREVIATIONS, ABBREV_REGEX_MAP } from '../config/matchingConfig'
import { api } from './api'

export async function getMatchQueue() {
  try { return await api.matching.queue(1) }
  catch { return MATCH_QUEUE }
}

export async function getMatchThresholds() {
  try { return await api.matching.getThresholds() }
  catch { return DEFAULT_THRESHOLDS }
}

export function getLegalSuffixes()      { return LEGAL_SUFFIXES }
export function getKnownAbbreviations() { return KNOWN_ABBREVIATIONS }
export function getAbbrevRegexMap()     { return ABBREV_REGEX_MAP }
export function getSubmissionSummary()  { return SUBMISSION_SUMMARY }
