import { ALIAS_GROUPS, GLOBAL_BLOCKLIST, PENDING_SUGGESTIONS, ALL_CANONICAL_FIELDS } from '../data/fieldMappingData'
import { api } from './api'

export async function getAliasGroups() {
  try { return await api.fieldMapping.aliasGroups() }
  catch { return ALIAS_GROUPS }
}

export async function getAllCanonicalFields() {
  try { return await api.fieldMapping.canonicalFields() }
  catch { return ALL_CANONICAL_FIELDS }
}

export async function getGlobalBlocklist() {
  try { return await api.fieldMapping.blocklist() }
  catch { return GLOBAL_BLOCKLIST }
}

export async function getPendingSuggestions() {
  try { return await api.fieldMapping.suggestions() }
  catch { return PENDING_SUGGESTIONS }
}
