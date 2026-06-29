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
  return await api.config.matching()
}

export async function getLegalSuffixes() {
  return (await api.config.matching()).legalSuffixes
}

export async function getKnownAbbreviations() {
  return (await api.config.matching()).knownAbbreviations
}

export async function getAbbrevRegexMap() {
  return (await api.config.matching()).abbrevRegexMap ?? {}
}
