import { api } from './api'

/**
 * Rows for the Review Matches screen.
 *
 * `agentParent` and `masterParent` come from the API's parent/child routing: the sponsor the agent
 * document named, and the ultimate entity the proposed match resolves to. `masterParent` being
 * empty means the match is itself the ultimate entity — rendered as "Self", not as missing data.
 */
export async function getMatchQueue(submissionId: number) {
  const items = await api.matching.queue(submissionId)
  return items.map(item => ({
    ...item,
    facility:     item.facilityName ?? '—',
    agentParent:  item.agentParent ?? '',
    masterParent: item.masterParent ?? '',
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
