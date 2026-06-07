import { ALIAS_GROUPS, GLOBAL_BLOCKLIST, PENDING_SUGGESTIONS, ALL_CANONICAL_FIELDS } from '../data/fieldMappingData'
import { api } from './api'

export async function getAliasGroups(live: boolean) {
  if (!live) return ALIAS_GROUPS
  return await api.fieldMapping.aliasGroups()
}

export async function getAllCanonicalFields(live: boolean) {
  if (!live) return ALL_CANONICAL_FIELDS
  return await api.fieldMapping.canonicalFields()
}

export async function getGlobalBlocklist(live: boolean) {
  if (!live) return GLOBAL_BLOCKLIST
  return await api.fieldMapping.blocklist()
}

export async function getPendingSuggestions(live: boolean) {
  if (!live) return PENDING_SUGGESTIONS
  return await api.fieldMapping.suggestions()
}
