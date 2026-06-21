import { LEGAL_SUFFIXES, KNOWN_ABBREVIATIONS, ABBREV_REGEX_MAP } from '../config/matchingConfig'
import { api } from './api'

export async function getMatchQueue(submissionId: number) {
  const items = await api.matching.queue(submissionId)
  return items.map(item => ({
    ...item,
    facility:     item.facilityName ?? '—',
    agentParent:  '',
    masterParent: '',
  }))
}

export async function getMatchThresholds() {
  return await api.matching.getThresholds()
}

export function getLegalSuffixes()      { return LEGAL_SUFFIXES }
export function getKnownAbbreviations() { return KNOWN_ABBREVIATIONS }
export function getAbbrevRegexMap()     { return ABBREV_REGEX_MAP }
